/**
 * Tipos do "Quem Sou Eu?".
 *
 * Separados das regras porque o banco de identidades (`whoami-identities.ts`) importa daqui sem
 * puxar a lógica junto — mesma divisão da bomba.
 */

export type WhoamiDifficulty = 'facil' | 'medio' | 'dificil';

/** As categorias, na ordem em que aparecem na tela. */
export const WHOAMI_CATEGORIES = [
  'Celebridades',
  'Personagens de filmes',
  'Personagens de séries',
  'Desenhos animados',
  'Animais',
  'Profissões',
  'Objetos',
  'Comidas',
  'Marcas',
  'Jogadores de futebol',
  'Cantores e artistas',
  'Personagens de videogames',
  'Lugares',
  'Personalidades históricas',
] as const;

/**
 * Que tipo de coisa a identidade é.
 *
 * A spec (§29) propõe `isRealPerson` / `isFictional` / `isHuman` como booleanos soltos. Troquei
 * por um campo só, e de propósito: a sopa de booleanos permite estados impossíveis (real **e**
 * fictício, humano que não é pessoa) e ainda deixa a pergunta "que dica dar primeiro?" sem
 * resposta única. Com um `kind` a primeira dica é uma tabela, e estados impossíveis não existem.
 */
export type IdentityKind =
  /** Pessoa real: celebridade, atleta, artista, figura histórica. */
  | 'pessoa'
  /** Personagem fictício humano ou humanoide. */
  | 'personagem'
  /** Bicho, real ou fictício. */
  | 'animal'
  /** Coisa sem vida: objeto, utensílio, veículo. */
  | 'objeto'
  /** Cidade, país, ponto turístico. */
  | 'lugar'
  /** Empresa ou produto. */
  | 'marca'
  /** O que alguém faz, não quem alguém é. */
  | 'profissao'
  /** Prato, fruta, doce, bebida. */
  | 'comida';

/**
 * Uma identidade secreta.
 *
 * `aliases` não é enfeite — é a peça central da tentativa de adivinhação. A spec (§12) fala em
 * "selecionar ou escrever", mas **selecionar quebra o jogo**: quem vê as identidades de todos os
 * outros descobre a própria por eliminação, sem perguntar nada. Logo a tentativa é texto livre, e
 * é `aliases` que faz "Spider-Man", "Peter Parker" e "homi aranha" valerem como acerto.
 *
 * `hints` guarda só as dicas 2 e 3. A primeira nasce de `kind`, em código: é a mais vaga e a mais
 * mecânica ("Sou um personagem fictício"), não precisa de criatividade nenhuma e assim sai com
 * tom idêntico em todas as 200 identidades.
 */
export type Identity = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  difficulty: WhoamiDifficulty;
  kind: IdentityKind;
  /** Brasileiro(a). Vale para `pessoa`, `personagem`, `lugar`, `marca` e `comida`. */
  br?: boolean;
  /** Outros jeitos de escrever o nome, para a tentativa não depender de ortografia. */
  aliases: string[];
  /** As dicas 2 e 3, nessa ordem: da mais vaga para a mais entregadora. */
  hints: [string, string];
};

/** Quantas dicas existem por identidade: a derivada de `kind` mais as duas escritas. */
export const WHOAMI_HINTS = 3;

export type WhoamiSettings = {
  /** Vazio = todas as categorias. */
  categories: string[];
  difficulties: WhoamiDifficulty[];
  /** Segundos de cada turno. `0` = sem limite (a mesa se organiza sozinha). */
  turnSeconds: number;
  /** Minutos de cada rodada. `0` = sem limite: vai até todos descobrirem ou o host encerrar. */
  roundMinutes: number;
  /** Dicas liberadas? No Hardcore, não. */
  hints: boolean;
};

export const DEFAULT_WHOAMI_SETTINGS: WhoamiSettings = {
  categories: [],
  difficulties: ['facil', 'medio'],
  turnSeconds: 45,
  roundMinutes: 10,
  hints: true,
};

/**
 * Os presets da tela. São combinações de opções, não motores separados — foi a decisão de escopo:
 * um jogo, três réguas. "Simultâneo" e "Equipes" (§17 e §19) mudariam o turno e ficam para depois.
 */
export const WHOAMI_PRESETS = {
  /** §16: o formato principal. */
  classico: { turnSeconds: 45, roundMinutes: 10, hints: true, difficulties: ['facil', 'medio'] },
  /** §20: menos conversa, mais pressão. */
  rapido: { turnSeconds: 20, roundMinutes: 5, hints: false, difficulties: ['facil', 'medio'] },
  /** §21: identidades específicas, sem dica, tempo curto. */
  hardcore: { turnSeconds: 20, roundMinutes: 10, hints: false, difficulties: ['dificil'] },
} as const satisfies Record<string, Partial<WhoamiSettings>>;

export type WhoamiPreset = keyof typeof WHOAMI_PRESETS;

/** Pontuação da §25. */
export const WHOAMI_POINTS = {
  /** Por dica usada, do zero ao três. */
  found: [100, 75, 50, 25] as const,
  wrongAttempt: -10,
  /** §25: quem descobre primeiro na rodada leva um extra. */
  firstBonus: 20,
} as const;

/** O que cada jogador acumulou na rodada. */
export type WhoamiPlayerRound = {
  playerId: string;
  identityId: string;
  /** Quantas dicas pediu (0 a 3). */
  hintsUsed: number;
  /** Tentativas erradas nesta rodada. */
  misses: number;
  /** Em que instante descobriu; `null` se não descobriu. */
  foundAt: number | null;
  /** Foi o primeiro da rodada a descobrir? É o bônus de velocidade. */
  first: boolean;
  /** Pontos da rodada, já com dicas, erros e bônus. */
  points: number;
};

/** A revelação do fim da rodada (§26). */
export type WhoamiReveal = {
  playerId: string;
  identity: Identity;
  found: boolean;
  hintsUsed: number;
  misses: number;
  points: number;
};

/** Um título do fim da partida (§27). */
export type WhoamiTitle = {
  key: 'mestre' | 'detetive' | 'chutador' | 'rapido' | 'persistente';
  emoji: string;
  title: string;
  playerId: string;
  value: string;
};

export type WhoamiStanding = { playerId: string; points: number; found: number; misses: number; position: number };

export type WhoamiSummary = { standings: WhoamiStanding[]; titles: WhoamiTitle[]; rounds: number };
