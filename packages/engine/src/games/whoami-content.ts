import { IDENTITIES } from './whoami-identities';
import { WHOAMI_CATEGORIES, WHOAMI_HINTS, type Identity, type IdentityKind, type WhoamiDifficulty } from './whoami-types';

/**
 * A portaria do conteúdo do "Quem Sou Eu?" e as dicas derivadas.
 *
 * Mesmo princípio da bomba (`bomb-content.ts`): o prompt pede, este arquivo exige. Cada identidade
 * chega como `unknown` e sai como `Identity` ou é descartada em silêncio.
 *
 * Mas aqui há uma regra que a bomba não tinha, e ela é a mais importante do arquivo:
 *
 * > **Nenhuma dica pode conter o nome nem um alias.**
 *
 * Um modelo escorrega nisso com alguma frequência — "Dica 2: sou conhecido como o Homem-Aranha" —
 * e isso não é uma carta fraca, é o jogo inteiro estragado: quem pede a dica ganha a resposta de
 * graça. É verificável em código, então é obrigação da portaria, não do prompt.
 */

/* ────────────────────────── a dica que vem de graça ────────────────────────── */

/**
 * A primeira dica, derivada de `kind`.
 *
 * A própria spec aponta isto em §29 ("os atributos permitem futuramente criar dicas automáticas").
 * É a dica mais vaga e a mais mecânica, então não precisa de criatividade nenhuma — e sai com tom
 * idêntico nas 168 identidades do banco e em toda identidade gerada. De quebra, é um terço menos
 * de conteúdo para gerar e pagar.
 *
 * Nota de desenho: ela fala só do TIPO, nunca da nacionalidade. `br` existe nos dados e serve para
 * filtro e estatística, mas "sou brasileiro" numa primeira dica já corta metade do banco — é forte
 * demais para o degrau mais barato.
 */
const PRIMEIRA_DICA: Record<IdentityKind, string> = {
  pessoa: 'Sou uma pessoa real.',
  personagem: 'Sou um personagem fictício.',
  animal: 'Sou um animal.',
  objeto: 'Sou um objeto, não um ser vivo.',
  lugar: 'Sou um lugar.',
  marca: 'Sou uma marca.',
  profissao: 'Sou uma profissão.',
  comida: 'Sou algo de comer ou beber.',
};

export const firstHint = (identity: Identity): string => PRIMEIRA_DICA[identity.kind];

/** As três dicas na ordem em que são liberadas: a derivada primeiro, as escritas depois. */
export const hintsOf = (identity: Identity): string[] => [firstHint(identity), ...identity.hints];

/* ────────────────────────── normalização e comparação ────────────────────────── */

/** Sem acento, minúsculo, sem pontuação: é como todo nome é comparado neste jogo. */
export const normalizeName = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Distância de edição, com teto.
 *
 * Existe para a tentativa de adivinhação aceitar "homi aranha" e "beyonce" sem acento. O teto é
 * o que a mantém barata: a conta para quando já passou do tolerável, e não há jogo em que isso
 * rode mais de algumas dezenas de vezes.
 */
export function editDistance(a: string, b: string, teto: number): number {
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let melhor = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      melhor = Math.min(melhor, atual[j]);
    }
    if (melhor > teto) return teto + 1;
    anterior = atual;
  }
  return anterior[b.length];
}

/**
 * Quanto erro de digitação se perdoa, pelo tamanho do alvo.
 *
 * Nome curto não ganha folga: com dois erros perdoados, "Tom" aceitaria "Bob". Nome comprido ganha,
 * porque é onde o dedo erra de verdade.
 */
const tolerancia = (alvo: string): number => (alvo.length <= 5 ? 0 : alvo.length <= 9 ? 1 : 2);

/**
 * O chute acertou?
 *
 * Compara contra o nome e todos os aliases. É generoso de propósito: numa festa, recusar o acerto
 * de quem escreveu "Bob esponga" transforma o melhor momento do jogo numa discussão com o app.
 */
export function matchesIdentity(guess: string, identity: Identity): boolean {
  const chute = normalizeName(guess);
  if (chute.length < 2) return false;
  const alvos = [identity.name, ...identity.aliases].map(normalizeName).filter(Boolean);
  return alvos.some((alvo) => chute === alvo || editDistance(chute, alvo, tolerancia(alvo)) <= tolerancia(alvo));
}

/* ────────────────────────── a portaria ────────────────────────── */

/** Conteúdo vindo de fora do motor, somado ao banco local. */
export type WhoamiContent = {
  identities: Identity[];
  /** Ids que este grupo já viu em partidas anteriores: evitados enquanto houver alternativa. */
  seenIds: string[];
};

export const EMPTY_WHOAMI_CONTENT: WhoamiContent = { identities: [], seenIds: [] };

/** Prefixo dos ids gerados. Garante que nunca colidam com os do banco (`batman`, `pizza`). */
export const WHOAMI_AI_PREFIX = 'ia-';

export const isAiIdentity = (id: string): boolean => id.startsWith(WHOAMI_AI_PREFIX);

const NOME_MIN = 2;
const NOME_MAX = 40;
const DICA_MIN = 28;
const DICA_MAX = 130;
const MAX_ALIASES = 6;

const KINDS: IdentityKind[] = ['pessoa', 'personagem', 'animal', 'objeto', 'lugar', 'marca', 'profissao', 'comida'];
const DIFICULDADES: WhoamiDifficulty[] = ['facil', 'medio', 'dificil'];

/**
 * Assuntos fora de tom para uma identidade.
 *
 * Bem mais curta que a lista da bomba, e de propósito: lá o que se filtrava era o ASSUNTO da
 * pergunta, então "hospital" e "remédio" eram sinal de problema. Aqui "Médico" e "Dentista" são
 * identidades legítimas — e uma lista herdada da bomba derrubaria as duas. O que não pode entrar
 * é outra coisa: identidade que humilha, sexualiza ou glorifica violência.
 *
 * Casa com início de palavra, como na bomba, para `arma` não derrubar "farmácia".
 */
const PROIBIDOS = [
  'nazista','nazismo','hitler','ditador','terrorista','assassino','serial','estuprador','pedofilo','traficante','cafetao',
  'prostituta','prostituicao','garota de programa','stripper','pornografia','pornostar',
  'maconha','cocaina','crack','heroina','traficante',
  'suicidio','suicida','genocidio','escravo','escravidao',
  'puta','viado','retardado','aleijado','corno','otario','idiota','imbecil',
  'gordinho','gordao','baleia','anao','nanico',
];

/** Combinações que só são problema juntas. */
const FRASES_PROIBIDAS = ['doente mental', 'deficiente fisico', 'morreu de', 'foi morto', 'fui morto', 'matou a', 'a tiros', 'a facadas'];

const simples = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const hasBlockedIdentity = (texto: string): boolean => {
  const limpo = simples(texto);
  if (FRASES_PROIBIDAS.some((f) => limpo.includes(f))) return true;
  const palavras = limpo.split(/[^a-z0-9]+/).filter(Boolean);
  const exatos = new Set(PROIBIDOS);
  return palavras.some((p) => exatos.has(p) || PROIBIDOS.some((r) => r.length >= 5 && p.startsWith(r)));
};

/**
 * A dica entrega o nome?
 *
 * O que conta como entrega, exatamente:
 *
 * - **qualquer palavra do nome**, de 4 letras para cima — "chuva" numa dica do Guarda-chuva entrega;
 * - **um alias de uma palavra só** — "Sparrow", "Aranha", "Batman";
 * - **um alias composto, inteiro** — "Peter Parker" dito por extenso.
 *
 * O que NÃO conta: uma palavra solta de um alias composto. O alias do Jack Sparrow é "Capitão Jack
 * Sparrow", e uma dica que diz "comando um navio e sou capitão" não entrega nada — "capitão" é
 * palavra comum, não é o nome dele. Contar essas palavras soltas derrubava cinco dicas boas do
 * banco escrito à mão, que é o sinal clássico de régua torta.
 */
export function hintLeaksName(hint: string, name: string, aliases: string[]): boolean {
  const alvo = simples(hint);
  const palavras = (t: string) => simples(t).split(/[^a-z0-9]+/).filter(Boolean);
  const termos = [
    ...palavras(name).filter((t) => t.length >= 4),
    ...aliases.flatMap((a) => {
      const partes = palavras(a);
      return partes.length === 1 ? partes.filter((t) => t.length >= 4) : [partes.join(' ')];
    }),
  ].filter((t) => t.length >= 4);
  return termos.some((t) => alvo.includes(t));
}

const texto = (valor: unknown): string | null => (typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : null);

const slug = (nome: string): string =>
  normalizeName(nome)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export type SanitizeIdentityOptions = {
  categories?: string[];
  difficulties?: string[];
};

/**
 * Filtra um lote de identidades geradas.
 *
 * Descarta em silêncio, uma por uma. Um lote que volta pela metade é um lote menor — e o banco
 * local, que é o motor deste jogo, completa.
 */
export function sanitizeGeneratedIdentities(raw: unknown, options: SanitizeIdentityOptions = {}): Identity[] {
  if (!Array.isArray(raw)) return [];

  const categoriasOk = new Set(options.categories?.length ? options.categories : WHOAMI_CATEGORIES);
  const dificuldadesOk = new Set<string>(options.difficulties?.length ? options.difficulties : DIFICULDADES);
  // O banco local entra na dedupe: gerar de novo o que já existe à mão é gastar chamada para nada.
  const jaExiste = new Set(IDENTITIES.map((i) => normalizeName(i.name)));

  const aceitas: Identity[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const bruto = item as Record<string, unknown>;

    const name = texto(bruto.name);
    if (!name || name.length < NOME_MIN || name.length > NOME_MAX) continue;
    if (/[.?!;:\n"]/.test(name)) continue;
    if (hasBlockedIdentity(name)) continue;

    const category = texto(bruto.category);
    if (!category || !categoriasOk.has(category)) continue;

    const difficulty = texto(bruto.difficulty);
    if (!difficulty || !dificuldadesOk.has(difficulty) || !DIFICULDADES.includes(difficulty as WhoamiDifficulty)) continue;

    const kind = texto(bruto.kind);
    if (!kind || !KINDS.includes(kind as IdentityKind)) continue;

    const aliases = (Array.isArray(bruto.aliases) ? bruto.aliases : [])
      .map((a) => texto(a))
      .filter((a): a is string => !!a && a.length >= NOME_MIN && a.length <= NOME_MAX && !hasBlockedIdentity(a))
      .filter((a, i, lista) => lista.findIndex((b) => normalizeName(b) === normalizeName(a)) === i)
      .filter((a) => normalizeName(a) !== normalizeName(name))
      .slice(0, MAX_ALIASES);

    const dicas = (Array.isArray(bruto.hints) ? bruto.hints : []).map((h) => texto(h));
    if (dicas.length !== WHOAMI_HINTS - 1) continue;
    if (dicas.some((d) => !d || d.length < DICA_MIN || d.length > DICA_MAX || !d.endsWith('.'))) continue;
    if (dicas.some((d) => hasBlockedIdentity(d!))) continue;
    // A regra que mais importa deste arquivo.
    if (dicas.some((d) => hintLeaksName(d!, name, aliases))) continue;
    if (normalizeName(dicas[0]!) === normalizeName(dicas[1]!)) continue;

    const chave = normalizeName(name);
    if (jaExiste.has(chave)) continue;
    jaExiste.add(chave);

    const emojiCru = texto(bruto.emoji);
    const emoji = emojiCru && [...emojiCru].length <= 3 && /\p{Extended_Pictographic}/u.test(emojiCru) ? emojiCru : '❓';

    aceitas.push({
      id: `${WHOAMI_AI_PREFIX}${slug(name)}`,
      name,
      emoji,
      category,
      difficulty: difficulty as WhoamiDifficulty,
      kind: kind as IdentityKind,
      aliases,
      hints: [dicas[0]!, dicas[1]!],
    });
  }
  return aceitas;
}

/* ────────────────────────── o pedido ────────────────────────── */

export type WhoamiContentRequest = {
  categories: string[];
  difficulties: WhoamiDifficulty[];
  count: number;
  /** Nomes que o grupo já viu — vão no prompt como "não repita". */
  avoidNames: string[];
};

/** Teto do lote. Uma partida de 8 jogadores × 3 rodadas cabe num só. */
export const MAX_IDENTITY_COUNT = 30;
export const MAX_AVOID_NAMES = 80;

/** Normaliza o pedido vindo da rede. O servidor confia nesta saída, não na entrada. */
export function sanitizeIdentityRequest(raw: unknown): WhoamiContentRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const bruto = raw as Record<string, unknown>;
  const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()) : []);

  const categories = [...new Set(lista(bruto.categories).filter((c) => (WHOAMI_CATEGORIES as readonly string[]).includes(c)))];
  const difficulties = [...new Set(lista(bruto.difficulties).filter((d): d is WhoamiDifficulty => DIFICULDADES.includes(d as WhoamiDifficulty)))];
  const count = Math.min(MAX_IDENTITY_COUNT, Math.max(1, Math.floor(Number(bruto.count) || 0) || 12));
  const avoidNames = lista(bruto.avoidNames)
    .filter((n) => n.length > 0 && n.length <= NOME_MAX)
    .slice(0, MAX_AVOID_NAMES);

  return { categories, difficulties: difficulties.length ? difficulties : DIFICULDADES, count, avoidNames };
}
