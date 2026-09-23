import { CARDS } from './couple-cards';
import { DEFAULT_COUPLE_SETTINGS, type CoupleCard, type CoupleDepth, type CoupleMood, type CoupleSettings, type CoupleState } from './couple-types';

export * from './couple-types';

/**
 * Entre Nós: um casal, um celular, uma conversa.
 *
 * Não há vencedor, pontos, cronômetro nem resposta certa — e por isso este arquivo é quase todo
 * sobre **ordem das perguntas**. A diferença entre uma noite boa e um interrogatório está em qual
 * carta aparece quando:
 *
 * - A sessão **começa leve e desce aos poucos** (§38). Abrir com uma pergunta profunda pede
 *   vulnerabilidade de quem ainda não entrou no clima.
 * - Nunca muitas profundas seguidas (§37): de tempos em tempos entra uma carta leve, que dá
 *   respiro e faz a próxima descida ser aceita.
 * - `intimidade` só entra se o casal escolher, e nunca nas primeiras cartas.
 */

export const COUPLE_CATEGORIES = [
  'Nosso relacionamento',
  'Nossa história',
  'Sobre você',
  'Amor e carinho',
  'Comunicação',
  'Futuro',
  'Vida juntos',
  'Leve e divertido',
  'Valores',
  'Intimidade',
] as const;

/** Só o clima `intimidade` destrava a categoria de mesmo nome. */
export const INTIMATE_CATEGORY = 'Intimidade';

/** Quantas cartas por vez o app oferece. `0` é a conversa livre. */
export const COUPLE_LENGTHS = [5, 10, 20, 0] as const;

/** Quais profundidades cada clima aceita. */
const DEPTHS_BY_MOOD: Record<CoupleMood, CoupleDepth[]> = {
  leve: ['leve'],
  conectar: ['leve', 'conectar'],
  profundo: ['leve', 'conectar', 'profundo'],
  // Intimidade não substitui o resto: entra junto, para a conversa ter onde respirar.
  intimidade: ['leve', 'conectar', 'profundo', 'intimidade'],
  // "Surpreenda-nos" mistura tudo menos intimidade, que é sempre escolha consciente (§18).
  surpresa: ['leve', 'conectar', 'profundo'],
};

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/** Uma carta leve a cada tantas: é o respiro que impede a sessão de virar interrogatório (§37). */
const ALIVIO_A_CADA = 4;

/**
 * Que profundidade a carta desta posição deveria ter.
 *
 * `position` é 1-based. Numa sessão com total definido a curva usa a fração percorrida; na
 * conversa livre, que não tem fim, ela usa a contagem absoluta e estabiliza no fundo.
 */
export function depthFor(position: number, total: number, mood: CoupleMood, rng: () => number = Math.random): CoupleDepth {
  const permitidas = DEPTHS_BY_MOOD[mood];
  if (permitidas.length === 1) return permitidas[0];

  // O respiro vem primeiro: ele vale mesmo no fundo da sessão.
  if (position > ALIVIO_A_CADA && position % ALIVIO_A_CADA === 0) return 'leve';

  const fracao = total > 0 ? position / total : Math.min(position / 12, 1);
  const candidatas: CoupleDepth[] = [];

  if (fracao <= 0.3) candidatas.push('leve');
  else if (fracao <= 0.65) candidatas.push('conectar');
  else candidatas.push('profundo', 'conectar');

  // Intimidade entra só depois de a conversa já ter andado — nunca de saída.
  if (mood === 'intimidade' && fracao > 0.35) candidatas.push('intimidade', 'intimidade');

  const possiveis = candidatas.filter((d) => permitidas.includes(d));
  return possiveis.length ? pick(possiveis, rng) : permitidas[permitidas.length - 1];
}

function matches(card: CoupleCard, settings: CoupleSettings): boolean {
  // A categoria Intimidade nunca aparece fora do clima que a destrava, nem por "todas as categorias".
  if (card.category === INTIMATE_CATEGORY && settings.mood !== 'intimidade') return false;
  return settings.categories.length === 0 || settings.categories.includes(card.category);
}

/** Quantas cartas existem para uma configuração. */
export const countCards = (settings: CoupleSettings): number => CARDS.filter((c) => matches(c, settings)).length;

/**
 * Escolhe a próxima carta: tenta a profundidade que a posição pede e, não havendo, sobe ou desce
 * até achar — mas nunca cai numa carta que o clima não permite.
 */
export function pickCard(settings: CoupleSettings, usedIds: Set<string>, position: number, rng: () => number = Math.random): CoupleCard {
  const doTema = CARDS.filter((c) => matches(c, settings));
  const disponiveis = doTema.filter((c) => !usedIds.has(c.id));
  // Baralho esgotado: recomeça em vez de deixar o casal sem carta.
  const fonte = disponiveis.length ? disponiveis : doTema.length ? doTema : CARDS;

  const alvo = depthFor(position, settings.total, settings.mood, rng);
  const exatas = fonte.filter((c) => c.depth === alvo);
  if (exatas.length) return pick(exatas, rng);

  // Sem carta na profundidade pedida: fica na mais próxima que o clima aceita.
  const ordem: CoupleDepth[] = ['leve', 'conectar', 'profundo', 'intimidade'];
  const permitidas = DEPTHS_BY_MOOD[settings.mood];
  const porDistancia = [...fonte]
    .filter((c) => permitidas.includes(c.depth))
    .sort((a, b) => Math.abs(ordem.indexOf(a.depth) - ordem.indexOf(alvo)) - Math.abs(ordem.indexOf(b.depth) - ordem.indexOf(alvo)));
  return porDistancia[0] ?? pick(fonte, rng);
}

export function sanitizeCoupleSettings(input: Partial<CoupleSettings> | undefined): CoupleSettings {
  const base = { ...DEFAULT_COUPLE_SETTINGS, ...input };
  const nomes = (base.names ?? ['', '']).map((n) => (n ?? '').trim().slice(0, 16));
  const categories = base.categories.filter((c) => (COUPLE_CATEGORIES as readonly string[]).includes(c));
  return {
    names: [nomes[0] || 'Você', nomes[1] || 'A gente'],
    mood: base.mood in DEPTHS_BY_MOOD ? base.mood : 'conectar',
    // Pedir Intimidade sem o clima que a destrava deixaria a sessão sem carta nenhuma.
    categories: base.mood === 'intimidade' ? categories : categories.filter((c) => c !== INTIMATE_CATEGORY),
    total: (COUPLE_LENGTHS as readonly number[]).includes(base.total) ? base.total : DEFAULT_COUPLE_SETTINGS.total,
  };
}

export function createCoupleSession(settings: Partial<CoupleSettings>, rng: () => number = Math.random): CoupleState {
  const limpo = sanitizeCoupleSettings(settings);
  const card = pickCard(limpo, new Set(), 1, rng);
  return {
    settings: limpo,
    // Quem abre a primeira é sorteado; daí em diante alterna (§24–25).
    firstIndex: rng() < 0.5 ? 0 : 1,
    index: 1,
    card,
    usedIds: [card.id],
    followUp: null,
    seen: { [card.category]: 1 },
    finished: false,
  };
}

/** Próxima carta. Alterna quem começa, para a mesma pessoa não influenciar sempre a outra. */
export function nextCard(state: CoupleState, rng: () => number = Math.random): CoupleState {
  if (state.finished) return state;
  if (state.settings.total > 0 && state.index >= state.settings.total) return { ...state, finished: true, followUp: null };

  const posicao = state.index + 1;
  const card = pickCard(state.settings, new Set(state.usedIds), posicao, rng);
  return {
    ...state,
    firstIndex: state.firstIndex === 0 ? 1 : 0,
    index: posicao,
    card,
    usedIds: [...state.usedIds, card.id],
    followUp: null,
    seen: { ...state.seen, [card.category]: (state.seen[card.category] ?? 0) + 1 },
  };
}

/**
 * Trocar a carta sem avançar a sessão: a pergunta não coube, e ninguém precisa dizer por quê (§35).
 * Não conta como carta vista, e quem começa continua o mesmo.
 */
export function swapCard(state: CoupleState, rng: () => number = Math.random): CoupleState {
  if (state.finished || !state.card) return state;
  const atual = state.card;
  const card = pickCard(state.settings, new Set(state.usedIds), state.index, rng);
  const seen = { ...state.seen };
  // A carta descartada sai da conta do resumo; a nova entra.
  seen[atual.category] = Math.max(0, (seen[atual.category] ?? 1) - 1);
  seen[card.category] = (seen[card.category] ?? 0) + 1;
  return { ...state, card, usedIds: [...state.usedIds, card.id], followUp: null, seen };
}

/** Abre a segunda camada da MESMA conversa (§34). Sem follow-up, nada muda. */
export function deepen(state: CoupleState, rng: () => number = Math.random): CoupleState {
  const opcoes = state.card?.followUps ?? [];
  const novas = opcoes.filter((f) => f !== state.followUp);
  if (!novas.length) return state;
  return { ...state, followUp: pick(novas, rng) };
}

export const endSession = (state: CoupleState): CoupleState => ({ ...state, finished: true, followUp: null });

/** Quem responde primeiro nesta carta, e quem vem depois. */
export function order(state: CoupleState): [string, string] {
  const [a, b] = state.settings.names;
  return state.firstIndex === 0 ? [a, b] : [b, a];
}

/** O resumo do fim: sobre o que o casal conversou, sem nota nem desempenho (§44). */
export function sessionSummary(state: CoupleState): { total: number; byCategory: { category: string; count: number }[] } {
  const byCategory = Object.entries(state.seen)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { total: byCategory.reduce((n, c) => n + c.count, 0), byCategory };
}
