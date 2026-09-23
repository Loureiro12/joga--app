import {
  PERFECT_CATEGORIES,
  PERFECT_TIMERS,
  PROTOCOL_VERSION,
  SECRET_CONTEXTS,
  SECRET_DIFFICULTIES,
  SECRET_LIMITS,
  type ClientMessage,
  type CreateRoomInput,
  type GameId,
  type LikelyIntensity,
  type PlayerAppearance,
  type RoomCommand,
  type SecretDifficulty,
} from '@jogae/engine';

/**
 * Tudo que chega do cliente é tratado como hostil até ser validado aqui.
 * Devolve a mensagem tipada, ou `null` se estiver malformada.
 */
const COLORS = new Set(['#FACC15', '#7C3AED', '#22C55E', '#EF4444', '#A78BFA', '#27272F']);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function appearance(v: unknown): PlayerAppearance | null {
  if (!isObject(v) || typeof v.name !== 'string' || typeof v.color !== 'string') return null;
  const name = v.name.trim().slice(0, 24);
  if (name.length < 1 || !COLORS.has(v.color)) return null;
  return { name, color: v.color };
}

const INTENSITIES = new Set<string>(['leve', 'moderado', 'pesado']);

/** As opções de jogo que o host escolheu. O engine normaliza de novo; aqui só barramos lixo. */
function gameSettings(v: unknown): CreateRoomInput['settings'] {
  if (!isObject(v)) return undefined;
  const list = (x: unknown, max: number) => (Array.isArray(x) && x.length <= max && x.every((i) => typeof i === 'string' && i.length <= 30) ? (x as string[]) : undefined);
  const bool = (x: unknown) => (typeof x === 'boolean' ? x : undefined);
  const num = (x: unknown, min: number, max: number) => (isInt(x, min, max) ? x : undefined);
  const { accusations, swaps } = SECRET_LIMITS;
  return {
    // Do Desafio Secreto; o engine normaliza de novo.
    context: typeof v.context === 'string' && (SECRET_CONTEXTS as readonly string[]).includes(v.context) ? (v.context as never) : undefined,
    difficulties: list(v.difficulties, SECRET_DIFFICULTIES.length)?.filter((d): d is SecretDifficulty => (SECRET_DIFFICULTIES as readonly string[]).includes(d)),
    accusations: num(v.accusations, accusations.min, accusations.max),
    swaps: num(v.swaps, swaps.min, swaps.max),
    // Do Casal Perfeito. As categorias dele e as do outro jogo dividem o mesmo campo; cada motor
    // fica com o que reconhece e descarta o resto.
    timerSec: (PERFECT_TIMERS as readonly number[]).includes(v.timerSec as number) ? (v.timerSec as number) : undefined,
    categories: list(v.categories, Math.max(12, PERFECT_CATEGORIES.length)),
    intensities: list(v.intensities, 3)?.filter((i): i is LikelyIntensity => INTENSITIES.has(i)),
    allowSelfVote: bool(v.allowSelfVote),
    openVotes: bool(v.openVotes),
    competitive: bool(v.competitive),
  };
}

function roomInput(v: unknown): CreateRoomInput | null {
  if (!isObject(v)) return null;
  // Jogos com regras no engine. Sem isto, uma sala nasceria sem motor e morreria no primeiro comando.
  const jogos: GameId[] = ['impostor', 'likely', 'secret', 'perfect'];
  if (typeof v.gameId !== 'string' || !jogos.includes(v.gameId as GameId)) return null;
  const gameId = v.gameId as GameId;
  if (typeof v.category !== 'string' || v.category.length < 1 || v.category.length > 30) return null;
  // `totalRounds: 0` é a partida sem limite do "Quem é Mais Provável?" e a ausência de rodada no
  // Desafio Secreto, que dura o rolê inteiro. Só o Impostor exige pelo menos uma.
  const minRounds = gameId === 'impostor' ? 1 : 0;
  // O teto da sala pode ser 2: o mínimo é técnico, não recomendação — quem decide o tamanho é o host.
  if (!isInt(v.totalRounds, minRounds, 30) || !isInt(v.maxPlayers, 2, 20)) return null;
  return { gameId, category: v.category, totalRounds: v.totalRounds, maxPlayers: v.maxPlayers, settings: gameSettings(v.settings) };
}

function command(v: unknown): RoomCommand | null {
  if (!isObject(v) || typeof v.type !== 'string') return null;
  switch (v.type) {
    case 'startMatch':
    case 'resetTimer':
    case 'openVoting':
    case 'nextRound':
    case 'playAgain':
    case 'ackRole':
    case 'endVoting':
    case 'skipQuestion':
    case 'endMatch':
    case 'missionReady':
    case 'missionDone':
    case 'swapMission':
    case 'nextReveal':
      return { type: v.type };
    case 'accuse':
      return typeof v.targetId === 'string' && v.targetId.length <= 80 && typeof v.missionId === 'string' && v.missionId.length <= 40
        ? { type: v.type, targetId: v.targetId, missionId: v.missionId }
        : null;
    case 'voteReveal':
      return typeof v.valid === 'boolean' ? { type: v.type, valid: v.valid } : null;
    case 'setTimerRunning':
      return typeof v.running === 'boolean' ? { type: v.type, running: v.running } : null;
    case 'setPaused':
      return typeof v.paused === 'boolean' ? { type: v.type, paused: v.paused } : null;
    case 'castVote':
      return typeof v.targetId === 'string' && v.targetId.length <= 80 ? { type: v.type, targetId: v.targetId } : null;
    default:
      return null;
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(v)) return null;

  switch (v.t) {
    case 'ping':
      return { t: 'ping' };
    case 'hello':
      return v.v === PROTOCOL_VERSION && typeof v.token === 'string' && v.token.length <= 4096 ? { t: 'hello', v: v.v, token: v.token } : null;
    case 'create': {
      const input = roomInput(v.input);
      const me = appearance(v.me);
      return isId(v.id) && input && me ? { t: 'create', id: v.id, input, me } : null;
    }
    case 'join': {
      const me = appearance(v.me);
      return isId(v.id) && typeof v.code === 'string' && /^\d{4}$/.test(v.code) && me ? { t: 'join', id: v.id, code: v.code, me } : null;
    }
    case 'resume':
      return isId(v.id) && typeof v.code === 'string' && /^\d{4}$/.test(v.code) ? { t: 'resume', id: v.id, code: v.code } : null;
    case 'leave':
      return isId(v.id) ? { t: 'leave', id: v.id } : null;
    case 'cmd': {
      const cmd = command(v.cmd);
      return isId(v.id) && cmd ? { t: 'cmd', id: v.id, cmd } : null;
    }
    default:
      return null;
  }
}
