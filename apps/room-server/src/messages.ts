import { PROTOCOL_VERSION, type ClientMessage, type CreateRoomInput, type LikelyIntensity, type PlayerAppearance, type RoomCommand } from '@jogae/engine';

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

/** As opções do "Quem é Mais Provável?". O engine normaliza de novo; aqui só barramos lixo. */
function likelySettings(v: unknown): CreateRoomInput['settings'] {
  if (!isObject(v)) return undefined;
  const list = (x: unknown, max: number) => (Array.isArray(x) && x.length <= max && x.every((i) => typeof i === 'string' && i.length <= 30) ? (x as string[]) : undefined);
  const bool = (x: unknown) => (typeof x === 'boolean' ? x : undefined);
  return {
    categories: list(v.categories, 12),
    intensities: list(v.intensities, 3)?.filter((i): i is LikelyIntensity => INTENSITIES.has(i)),
    allowSelfVote: bool(v.allowSelfVote),
    openVotes: bool(v.openVotes),
    competitive: bool(v.competitive),
  };
}

function roomInput(v: unknown): CreateRoomInput | null {
  if (!isObject(v)) return null;
  if (v.gameId !== 'impostor' && v.gameId !== 'likely') return null; // jogos com regras no engine
  if (typeof v.category !== 'string' || v.category.length < 1 || v.category.length > 30) return null;
  // `totalRounds: 0` no "Quem é Mais Provável?" é a partida sem limite; o Impostor exige pelo menos 1.
  const minRounds = v.gameId === 'likely' ? 0 : 1;
  if (!isInt(v.totalRounds, minRounds, 30) || !isInt(v.maxPlayers, 3, 20)) return null;
  return { gameId: v.gameId, category: v.category, totalRounds: v.totalRounds, maxPlayers: v.maxPlayers, settings: likelySettings(v.settings) };
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
      return { type: v.type };
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
