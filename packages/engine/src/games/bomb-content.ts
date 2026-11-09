import { THEMES } from './alphabet-themes';
import { ALPHABET_CATEGORIES, ALPHABET_RULES, FULL_ALPHABET, type AlphabetTheme } from './alphabet-types';

import { CHALLENGES } from './bomb-challenges';
import { BOMB_CATEGORIES, type BombChallenge, type BombDifficulty, type BombSettings } from './bomb-types';

/**
 * A portaria do conteúdo gerado por IA.
 *
 * O banco local (`bomb-challenges.ts`, `alphabet-themes.ts`) foi escrito à mão sob critérios que
 * estão no comentário de cada arquivo: frase curta no imperativo, muitas respostas possíveis, e
 * uma lista de assuntos proibidos. Um modelo não tem como ser obrigado a respeitar isso — ele pode
 * ser instruído, e quase sempre obedece, mas "quase sempre" não serve para um jogo que roda numa
 * mesa com crianças por perto.
 *
 * Então a regra é: **nada entra no jogo sem passar por aqui.** O prompt pede, este arquivo exige.
 * Cada carta chega como `unknown`, e sai como `BombChallenge` ou é descartada em silêncio — um
 * lote que volta pela metade é um lote menor, nunca um lote ruim.
 *
 * Vive no motor porque é regra de conteúdo, não de rede: é pura, não depende de quem gerou, e
 * pode ser testada carta por carta sem nenhuma chamada de API.
 *
 * ## Uma diferença de propósito entre o banco e o gerado
 *
 * O banco tem `"Diga um país da América do Sul."` — nome próprio no meio da frase. Aqui isso é
 * recusado. Não é inconsistência: a mão humana sabe distinguir "América do Sul" (lugar, seguro)
 * de "uma música da [artista]" (pessoa real, fora dos critérios), e um teste de maiúscula não
 * sabe. Como o banco local já cobre geografia e cultura, o gerado não perde nada ficando no
 * vocabulário comum — e em troca a regra fica curta o bastante para ser confiável.
 */

/** Conteúdo vindo de fora do motor, somado aos bancos locais. */
export type BombContent = {
  challenges: BombChallenge[];
  themes: AlphabetTheme[];
  /**
   * Ids que este grupo já viu em partidas ANTERIORES. Evitados enquanto houver alternativa — é o
   * que faz a repetição morrer entre uma partida e outra, e funciona mesmo sem IA nenhuma.
   */
  seenIds: string[];
};

export const EMPTY_BOMB_CONTENT: BombContent = { challenges: [], themes: [], seenIds: [] };

/** Prefixo dos ids gerados. Garante que nunca colidam com os do banco local (`ger-001`, `animais`). */
export const AI_ID_PREFIX = 'ia-';

export const isAiGenerated = (id: string): boolean => id.startsWith(AI_ID_PREFIX);

/* ────────────────────────────── a régua ────────────────────────────── */

/** Os três verbos do banco. Qualquer outro começo é outro tipo de frase, e não o enunciado curto que o jogo pede. */
const VERBOS = ['Diga', 'Cite', 'Fale'];

/** O banco vai de 13 a 57 caracteres. A folga é pequena de propósito: frase longa não se lê em voz alta no susto. */
const TEXTO_MIN = 12;
const TEXTO_MAX = 70;

const NOME_MIN = 3;
const NOME_MAX = 22;

/**
 * Assuntos fora dos critérios do banco.
 *
 * Duas listas, porque há dois jeitos de um assunto aparecer.
 *
 * `PROIBIDOS` casa com **início de palavra**, nunca com um pedaço qualquer dela. A diferença não
 * é detalhe: como substring, `arma` derrubava "farmácia", `raca` derrubava "decoração" e `fei`
 * derrubava "feito" — três cartas boas do banco, mortas em silêncio. Um radical largo não quebra
 * nada, só faz a geração render menos sem ninguém saber por quê. O teste que passa as 180 cartas
 * humanas por aqui é o que mantém a lista honesta.
 *
 * `FRASES_PROIBIDAS` é para o que só é proibido junto: "gênero" sozinho é gênero musical, e
 * "identidade de gênero" é outra coisa.
 *
 * As duas são listas de RECUSA, não de detecção: não provam que a carta é boa, só derrubam a que
 * é claramente ruim. A primeira linha de defesa continua sendo o prompt.
 */
const PROIBIDOS = [
  // saúde física e mental
  'doenca','doente','doencas','sintoma','sintomas','remedio','remedios','medicamento','hospital','cancer','depressao','depressivo','ansiedade','ansioso','ansiosa','estresse','estressado','trauma','suicidio','transtorno','deficiencia','deficiente','vacina','virus','pandemia','terapia','psicolog','psiquiatr',
  // corpo e aparência
  'gordo','gorda','gordura','magro','magra','feio','feia','feiura','obeso','obesidade','dieta','emagrecer','celulite','espinha','calvo','careca',
  // raça, etnia, religião, orientação, identidade
  'raca','etnia','etnico','religiao','religioso','igreja','deus','jesus','ala','crenca','pecado','gay','lesbica','heterossexual','homossexual','homofob','transexual','travesti',
  // crime, violência, morte
  'crime','criminoso','ladrao','roubo','roubar','assalto','assaltar','matar','morte','morrer','morreu','morto','mortal','assassino','assassinato','arma','armas','faca','facada','tiro','tiroteio','briga','brigar','soco','violencia','violento','sangue','guerra','terrorismo','terrorista','preso','prisao','cadeia','policia','policial','sequestro',
  // drogas e álcool pesado
  'droga','drogas','maconha','cocaina','crack','cigarro','fumar','bebado','bebada','embriagado','alcool','alcoolico','vodka','cachaca','whisky','tequila',
  // sexo
  'sexo','sexual','sexualmente','nudez','nu','nua','pelado','pelada','transar','camisinha','porno','pornografia','orgasmo','virgem',
  // política partidária
  'politica','politico','partido','presidente','eleicao','eleicoes','deputado','senador','vereador','prefeito','governador','voto','votar','comunismo','comunista','fascismo','fascista',
  // outros fora de tom
  'divida','dividas','falencia','demissao','demitido','desemprego','desempregado','suborno','corrupcao','corrupto','aposta','apostar','cassino',
];

/** Proibido só na combinação: cada palavra, sozinha, é inocente. */
const FRASES_PROIBIDAS = [
  'identidade de genero',
  'orientacao sexual',
  'saude mental',
  'parte do corpo que',
  'beijar na boca',
  'esquerda ou direita',
];

/** Sem acento, minúsculo: a comparação é sobre o radical, não sobre a grafia. */
const simples = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Para deduplicar: duas cartas com a mesma frase são a mesma carta, por mais que pontuação e espaço mudem. */
const chaveDeTexto = (texto: string): string => simples(texto).replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Exportada para ser testável contra o banco local.
 *
 * Uma lista de recusa larga demais é um problema silencioso: ela não quebra nada, só derruba
 * carta boa e faz a geração render menos sem ninguém saber por quê. O teste que passa as 180
 * cartas escritas à mão por aqui é o que mantém a lista honesta.
 */
export const hasBlockedTopic = (texto: string): boolean => {
  const limpo = simples(texto);
  if (FRASES_PROIBIDAS.some((frase) => limpo.includes(frase))) return true;
  // Início de palavra: `arma` pega "armas" e não pega "farmácia".
  const palavras = limpo.split(/[^a-z0-9]+/).filter(Boolean);
  const proibidos = new Set(PROIBIDOS);
  return palavras.some((palavra) => {
    if (proibidos.has(palavra)) return true;
    // Flexão simples ("crimes", "roubando"): o radical casa com o começo da palavra, mas só a
    // partir de 4 letras — abaixo disso qualquer radical pega palavra inocente demais.
    return PROIBIDOS.some((radical) => radical.length >= 4 && palavra.startsWith(radical));
  });
};

const temAssuntoProibido = hasBlockedTopic;

/**
 * Nome próprio no meio da frase — pessoa real, marca, obra.
 *
 * O enunciado só pode ter maiúscula na primeira letra. Siglas inteiras em maiúsculas também caem
 * aqui, e é o que se quer: "Diga uma série da HBO" entrega a marca na própria pergunta.
 */
const temNomeProprio = (texto: string): boolean => /\s[A-ZÀ-ÖØ-Þ]/.test(texto);

/**
 * Id estável derivado do texto.
 *
 * Tem de ser estável porque é ele que a lista de "já vistos" guarda: se o mesmo desafio voltasse
 * com id novo a cada geração, o grupo veria a mesma carta de novo e a memória não serviria para
 * nada. Hash simples (djb2) — não é criptografia, é só um nome curto e determinístico.
 */
function idDe(prefixoDoTipo: string, texto: string): string {
  let h = 5381;
  const chave = chaveDeTexto(texto);
  for (let i = 0; i < chave.length; i++) h = ((h << 5) + h + chave.charCodeAt(i)) | 0;
  return `${AI_ID_PREFIX}${prefixoDoTipo}-${(h >>> 0).toString(36)}`;
}

const DIFICULDADES: BombDifficulty[] = ['facil', 'medio', 'dificil'];

const texto = (valor: unknown): string | null => (typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : null);

/* ──────────────────────── desafios do clássico ──────────────────────── */

export type SanitizeOptions = {
  /** Categorias aceitas. Vazio = as do jogo. Uma carta fora do que o grupo pediu não serve, mesmo sendo boa. */
  categories?: string[];
  /** Dificuldades aceitas. Vazio = todas. */
  difficulties?: string[];
};

/**
 * Filtra um lote de desafios gerados.
 *
 * Descarta em silêncio, por carta. O chamador decide o que fazer com um lote curto — e a resposta
 * certa é quase sempre "siga com o banco local", nunca "mostre isso ao grupo de qualquer jeito".
 */
export function sanitizeGeneratedChallenges(raw: unknown, options: SanitizeOptions = {}): BombChallenge[] {
  if (!Array.isArray(raw)) return [];

  const categoriasOk = new Set(options.categories?.length ? options.categories : BOMB_CATEGORIES);
  const dificuldadesOk = new Set<string>(options.difficulties?.length ? options.difficulties : DIFICULDADES);
  // O banco local entra na dedupe: gerar de novo o que já existe à mão é gastar chamada para nada.
  const jaExiste = new Set(CHALLENGES.map((c) => chaveDeTexto(c.text)));

  const aceitos: BombChallenge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const bruto = item as Record<string, unknown>;

    const frase = texto(bruto.text);
    if (!frase) continue;
    if (frase.length < TEXTO_MIN || frase.length > TEXTO_MAX) continue;
    // Uma frase só, no imperativo, terminada em ponto: é assim que o enunciado se lê em voz alta.
    if (!frase.endsWith('.')) continue;
    if (/[?!;:\n"']/.test(frase)) continue;
    if (frase.slice(0, -1).includes('.')) continue;
    if (!VERBOS.some((v) => frase.startsWith(`${v} `))) continue;
    if (temNomeProprio(frase)) continue;
    if (temAssuntoProibido(frase)) continue;

    const categoria = texto(bruto.category);
    if (!categoria || !categoriasOk.has(categoria)) continue;

    const dificuldade = texto(bruto.difficulty);
    if (!dificuldade || !dificuldadesOk.has(dificuldade) || !DIFICULDADES.includes(dificuldade as BombDifficulty)) continue;

    // `pool: 'baixo'` existe no banco como exceção consciente ("o desafio é divertido o bastante
    // para compensar"). Esse julgamento é humano: no gerado, poucas respostas é só uma carta ruim.
    const pool = texto(bruto.pool);
    if (pool !== 'alto' && pool !== 'medio') continue;

    const chave = chaveDeTexto(frase);
    if (jaExiste.has(chave)) continue;
    jaExiste.add(chave);

    aceitos.push({ id: idDe('d', frase), category: categoria, difficulty: dificuldade as BombDifficulty, pool, text: frase });
  }
  return aceitos;
}

/* ───────────────────────── temas do alfabeto ───────────────────────── */

/**
 * Filtra um lote de temas gerados.
 *
 * A regra que mais derruba carta aqui é `letters`: o tema promete que toda letra listada tem
 * resposta que sai em três segundos. Não há como verificar isso de fora, mas há como exigir o
 * mínimo — `ALPHABET_RULES.minLetters`, o mesmo piso que o banco local respeita, porque um tema
 * curto trava o grupo no meio da rodada.
 */
export function sanitizeGeneratedThemes(raw: unknown, options: SanitizeOptions = {}): AlphabetTheme[] {
  if (!Array.isArray(raw)) return [];

  const categoriasOk = new Set(options.categories?.length ? options.categories : ALPHABET_CATEGORIES);
  const dificuldadesOk = new Set<string>(options.difficulties?.length ? options.difficulties : DIFICULDADES);
  const jaExiste = new Set(THEMES.map((t) => chaveDeTexto(t.name)));

  const aceitos: AlphabetTheme[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const bruto = item as Record<string, unknown>;

    const nome = texto(bruto.name);
    if (!nome) continue;
    if (nome.length < NOME_MIN || nome.length > NOME_MAX) continue;
    if (/[.?!;:\n"']/.test(nome)) continue;
    if (temAssuntoProibido(nome)) continue;

    const categoria = texto(bruto.category);
    if (!categoria || !categoriasOk.has(categoria)) continue;

    const dificuldade = texto(bruto.difficulty);
    if (!dificuldade || !dificuldadesOk.has(dificuldade) || !DIFICULDADES.includes(dificuldade as BombDifficulty)) continue;

    // Letras: maiúsculas, sem repetir, na ordem do alfabeto — a grade da tela é desenhada assim.
    const cru = texto(bruto.letters);
    if (!cru) continue;
    const letras = [...new Set(cru.toUpperCase().replace(/[^A-Z]/g, ''))].sort().join('');
    if (letras.length < ALPHABET_RULES.minLetters || letras.length > FULL_ALPHABET.length) continue;

    // O emoji é decoração, mas uma decoração errada vira caixinha vazia na tela. Sem emoji válido, usa um padrão.
    const emojiCru = typeof bruto.emoji === 'string' ? [...bruto.emoji.trim()] : [];
    const emoji = emojiCru.length >= 1 && emojiCru.length <= 3 && /\p{Extended_Pictographic}/u.test(bruto.emoji as string) ? (bruto.emoji as string).trim() : '✨';

    const chave = chaveDeTexto(nome);
    if (jaExiste.has(chave)) continue;
    jaExiste.add(chave);

    aceitos.push({ id: idDe('t', nome), name: nome, emoji, category: categoria, difficulty: dificuldade as BombDifficulty, letters: letras });
  }
  return aceitos;
}

/* ──────────────────────────── o pedido ──────────────────────────── */

/**
 * O que o app pede e o servidor gera. Derivado das opções que o grupo marcou na tela — é só isso
 * que atravessa a rede, nunca um prompt escrito pelo jogador.
 */
export type BombContentRequest = {
  variant: BombSettings['variant'];
  categories: string[];
  difficulties: BombDifficulty[];
  /** Quantas cartas pedir. Limitado na recepção; aqui é só o desejo do app. */
  count: number;
  /** Frases que o grupo já viu — o gerador recebe para não repetir o que está na mão deles. */
  avoidTexts: string[];
};

/** Teto do lote. Mais que isto numa resposta só piora a qualidade e o tempo de espera. */
export const MAX_CONTENT_COUNT = 24;
/** Quantas frases vale a pena mandar como "não repita". Além disso o prompt cresce sem ganhar nada. */
export const MAX_AVOID_TEXTS = 60;

/** Normaliza o pedido vindo da rede. O servidor confia nesta saída, não na entrada. */
export function sanitizeContentRequest(raw: unknown, availableCategories: readonly string[]): BombContentRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const bruto = raw as Record<string, unknown>;

  const variant = bruto.variant === 'alfabeto' ? 'alfabeto' : bruto.variant === 'classico' ? 'classico' : null;
  if (!variant) return null;

  const lista = (valor: unknown): string[] => (Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string').map((v) => v.trim()) : []);

  const categories = [...new Set(lista(bruto.categories).filter((c) => availableCategories.includes(c)))];
  const difficulties = [...new Set(lista(bruto.difficulties).filter((d): d is BombDifficulty => DIFICULDADES.includes(d as BombDifficulty)))];
  const count = Math.min(MAX_CONTENT_COUNT, Math.max(1, Math.floor(Number(bruto.count) || 0) || 8));
  const avoidTexts = lista(bruto.avoidTexts)
    .filter((t) => t.length > 0 && t.length <= TEXTO_MAX)
    .slice(0, MAX_AVOID_TEXTS);

  return { variant, categories, difficulties: difficulties.length ? difficulties : DIFICULDADES, count, avoidTexts };
}
