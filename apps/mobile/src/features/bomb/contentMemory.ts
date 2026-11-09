import { isAiGenerated, type AlphabetTheme, type BombChallenge, type BombContent, type BombDifficulty, type BombSettings } from '@jogae/engine';

/**
 * As decisões da memória de conteúdo da Bomba-Relógio, sem nada em volta.
 *
 * Mesmo corte de `adPolicy.ts`: o que tem regra fica puro e testado, o que é encanamento
 * (AsyncStorage, zustand, `fetch`) fica em `bombContentStore.ts`. Aqui não há disco, rede nem
 * relógio — o `agora` chega como argumento.
 *
 * A regra que organiza o arquivo: **o aparelho é quem lembra**. Não o servidor, que serviria o
 * mesmo tema a todo mundo, e não a partida, que esquece tudo ao terminar. É este módulo que sabe
 * o que *aquela* turma já viu.
 */

/** Ids guardados. Além disso, o mais antigo sai — ninguém lembra do que viu há 400 rodadas. */
export const MAX_SEEN = 400;
/** Cartas geradas guardadas por aparelho. É teto de disco, não de jogo. */
export const MAX_CHALLENGES = 150;
export const MAX_THEMES = 80;
/** Quantas cartas pedir por vez. Cobre uma partida inteira com folga. */
export const PEDIDO = 14;
/** Com menos cartas inéditas que isto para as opções escolhidas, vale buscar mais. */
export const PISO_PARA_BUSCAR = 10;
/** Duas buscas para a mesma configuração dentro disso não acrescentam nada. */
export const INTERVALO_MS = 5 * 60_000;
/** Quantas frases mandar como "não repita". Além disso o prompt cresce sem ganhar nada. */
export const MAX_AVOID = 40;

/** O que fica guardado no aparelho entre uma sessão e outra. */
export type Memoria = {
  /** Ids de desafios e temas que este grupo já viu, mais recentes no fim. */
  seenIds: string[];
  challenges: BombChallenge[];
  themes: AlphabetTheme[];
};

export const MEMORIA_VAZIA: Memoria = { seenIds: [], challenges: [], themes: [] };

/** Só o que interessa ao conteúdo: o resto das opções (modo, ordem, pavio) não muda carta. */
export type Opcoes = Pick<BombSettings, 'variant' | 'categories' | 'difficulties'>;

/** A assinatura das opções. Ordenada para "A,B" e "B,A" serem a mesma configuração. */
export const assinatura = (o: Opcoes): string => [o.variant, [...o.categories].sort().join('|'), [...o.difficulties].sort().join('|')].join('::');

const serve = (item: { category: string; difficulty: BombDifficulty }, o: Pick<Opcoes, 'categories' | 'difficulties'>): boolean =>
  (o.categories.length === 0 || o.categories.includes(item.category)) && o.difficulties.includes(item.difficulty);

/**
 * O conteúdo que o motor recebe ao criar a partida.
 *
 * Filtra pelas opções escolhidas de propósito: carta de outra categoria no baralho faria o motor
 * filtrar de novo à toa, e o contador da tela de preparação contaria carta que nunca sairia.
 */
export function contentFor(memoria: Memoria, o: Opcoes): BombContent {
  return {
    challenges: o.variant === 'classico' ? memoria.challenges.filter((c) => serve(c, o)) : [],
    themes: o.variant === 'alfabeto' ? memoria.themes.filter((t) => serve(t, o)) : [],
    seenIds: memoria.seenIds,
  };
}

/**
 * Quantas cartas inéditas existem para estas opções, somando banco local e geradas.
 *
 * `bankCount` vem de fora porque é o motor que sabe contar o banco. Do banco não há como saber
 * *quais* foram vistas sem reler tudo, então a conta usa o que se sabe: o total menos os ids
 * vistos que não têm prefixo de IA. É uma estimativa, e serve: ela só decide se vale buscar mais.
 */
export function freshCount(memoria: Memoria, o: Opcoes, bankCount: number): number {
  const vistos = new Set(memoria.seenIds);
  const geradas = (o.variant === 'alfabeto' ? memoria.themes : memoria.challenges).filter((item) => serve(item, o));
  const vistosDoBanco = memoria.seenIds.filter((id) => !isAiGenerated(id)).length;
  return Math.max(0, bankCount - vistosDoBanco) + geradas.filter((g) => !vistos.has(g.id)).length;
}

/**
 * Vale gastar uma chamada de API agora?
 *
 * Três motivos para não: já tem carta inédita de sobra, já se buscou para esta configuração há
 * pouco, ou uma busca está em curso. Cada chamada custa dinheiro de verdade — o padrão é não.
 */
export function shouldPrefetch(
  memoria: Memoria,
  o: Opcoes,
  bankCount: number,
  estado: { buscando: boolean; ultimaBusca: number | null; agora: number },
): boolean {
  if (estado.buscando) return false;
  if (estado.ultimaBusca !== null && estado.agora - estado.ultimaBusca < INTERVALO_MS) return false;
  return freshCount(memoria, o, bankCount) < PISO_PARA_BUSCAR;
}

/**
 * As frases que vão no pedido como "o grupo já viu estas".
 *
 * Mandar a lista é mais barato e mais confiável do que esperar originalidade espontânea: sem ela,
 * o modelo cai nos mesmos lugares-comuns a cada chamada.
 */
export function avoidTexts(memoria: Memoria, o: Opcoes): string[] {
  const fonte = o.variant === 'alfabeto' ? memoria.themes.map((t) => t.name) : memoria.challenges.map((c) => c.text);
  return fonte.slice(-MAX_AVOID);
}

/** Junta sem duplicar, mantendo as mais novas quando o teto aperta. */
export function juntar<T extends { id: string }>(atuais: T[], novas: T[], teto: number): T[] {
  const ids = new Set(novas.map((n) => n.id));
  return [...atuais.filter((a) => !ids.has(a.id)), ...novas].slice(-teto);
}

/** Guarda o que uma partida usou, sem duplicar e respeitando o teto. */
export function remember(memoria: Memoria, usedIds: string[]): Memoria {
  if (!usedIds.length) return memoria;
  return { ...memoria, seenIds: [...memoria.seenIds.filter((id) => !usedIds.includes(id)), ...usedIds].slice(-MAX_SEEN) };
}

/** Absorve um lote recém-gerado, ignorando o que o grupo já viu. */
export function absorver(memoria: Memoria, novo: { challenges: BombChallenge[]; themes: AlphabetTheme[] }): Memoria {
  const vistos = new Set(memoria.seenIds);
  const desafios = novo.challenges.filter((c) => !vistos.has(c.id));
  const temas = novo.themes.filter((t) => !vistos.has(t.id));
  if (!desafios.length && !temas.length) return memoria;
  return {
    ...memoria,
    challenges: juntar(memoria.challenges, desafios, MAX_CHALLENGES),
    themes: juntar(memoria.themes, temas, MAX_THEMES),
  };
}
