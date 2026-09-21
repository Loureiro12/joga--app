import { roomApiUrl } from './config';

export type RoomInfo = {
  code: string;
  gameId: string;
  status: 'open' | 'playing' | 'finished';
  host: { name: string; initial: string; color: string };
  count: number;
  players: { initial: string; color: string }[];
};

/**
 * `found`: a sala existe · `gone`: o servidor respondeu que não existe (terminou)
 * `unknown`: o servidor não respondeu a tempo — NÃO dizemos que a sala terminou, só mostramos o convite sem os detalhes.
 */
export type RoomLookup = { kind: 'found'; room: RoomInfo } | { kind: 'gone' } | { kind: 'unknown' };

const GAME_NAMES: Record<string, string> = { impostor: 'Impostor' };
export const gameName = (gameId: string) => GAME_NAMES[gameId] ?? 'Jogaê';

export async function lookupRoom(code: string, timeoutMs = 2500): Promise<RoomLookup> {
  try {
    const res = await fetch(`${roomApiUrl}/api/room/${code}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (res.status === 404) return { kind: 'gone' };
    if (!res.ok) return { kind: 'unknown' };
    const room = (await res.json()) as RoomInfo;
    return room.status === 'finished' ? { kind: 'gone' } : { kind: 'found', room };
  } catch {
    return { kind: 'unknown' };
  }
}

/** Texto sobre amarelo/verde/lilás/branco é escuro; sobre roxo/vermelho/escuros é claro (regra do design system). */
export const onColor = (bg: string) => (['#FACC15', '#22C55E', '#A78BFA', '#FAFAFA'].includes(bg.toUpperCase()) ? '#0F0F13' : '#FAFAFA');

/** Só aceita as 6 cores de jogador; qualquer outra coisa vinda da API vira roxo. Evita injetar CSS arbitrário. */
const PALETTE = new Set(['#FACC15', '#7C3AED', '#22C55E', '#EF4444', '#A78BFA', '#27272F']);
export const safeColor = (color: string) => (PALETTE.has(color.toUpperCase()) ? color.toUpperCase() : '#7C3AED');
