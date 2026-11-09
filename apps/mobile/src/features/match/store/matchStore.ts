import { create } from 'zustand';

import { toast } from '@/core/ui/toast';
import { adsState } from '@/features/ads/adsStore';
import { services } from '@/services';

import type { ConnectionState, GameView, Player, PlayerId, RoomSnapshot } from '@jogae/engine';

type MatchState = {
  snapshot: RoomSnapshot | null;
  connection: ConnectionState;
};

/**
 * Espelho reativo do `RoomService`. O store NÃO tem regra de jogo: só guarda o último
 * snapshot e o estado da conexão. Comandos vão direto para `services.room`.
 */
export const useMatchStore = create<MatchState>(() => ({
  snapshot: null,
  connection: { status: 'online' },
}));

/**
 * Quando a partida da sala começou, e com o quê.
 *
 * Fora do store de propósito: nenhuma tela renderiza a partir disto, e é lido uma vez por
 * transição de fase. Serve para a telemetria saber **quanto durou** e **se chegou ao fim** — que
 * é a pergunta que mais diz sobre um jogo de festa: as pessoas terminam o que começam?
 */
let partidaAtual: { gameId: string; players: number; rounds: number; em: number } | null = null;

/** Encerra a medição da partida e manda o evento. `completou` separa quem terminou de quem saiu. */
function fecharPartida(completou: boolean): void {
  if (!partidaAtual) return;
  const { gameId, players, rounds, em } = partidaAtual;
  partidaAtual = null;
  services.telemetry.track({ name: 'partida_terminada', gameId, players, rounds, segundos: Math.round((Date.now() - em) / 1000), completou });
}

services.room.subscribe((snapshot) => {
  const previous = useMatchStore.getState().snapshot;
  useMatchStore.setState({ snapshot });

  // Saiu da sala (ou a sala fechou) com partida andando: isso é abandono, e precisa ser contado
  // ANTES da saída rápida abaixo — senão a métrica mais importante só existiria para quem termina.
  if (!snapshot || (previous && previous.room.code !== snapshot.room.code)) fecharPartida(false);

  if (!previous || !snapshot || previous.room.code !== snapshot.room.code) return;

  // Saiu do lobby: a partida começou. Vale para todos os jogos de sala de uma vez — o mesmo
  // motivo de o contador de anúncios morar aqui, e não espalhado por sete motores.
  if (previous.room.phase === 'lobby' && snapshot.room.phase !== 'lobby' && snapshot.room.phase !== 'closed') {
    const players = snapshot.players.filter((p) => p.connected).length;
    partidaAtual = { gameId: snapshot.room.gameId, players, rounds: snapshot.room.totalRounds, em: Date.now() };
    services.telemetry.track({ name: 'partida_iniciada', gameId: snapshot.room.gameId, players, rounds: snapshot.room.totalRounds });
  }

  // A partida acabou de verdade. É aqui que ela conta para os anúncios — e não na saída, senão
  // um grupo que joga cinco seguidas e sai uma vez teria jogado "uma partida".
  if (previous.room.phase !== 'finished' && snapshot.room.phase === 'finished') {
    adsState.countMatch();
    fecharPartida(true);
  }

  // Migração de host: alguém precisa saber que agora é ele quem conduz.
  if (previous.room.hostId !== snapshot.room.hostId) {
    const host = snapshot.players.find((p) => p.id === snapshot.room.hostId);
    toast(snapshot.room.hostId === snapshot.meId ? 'O host saiu. Agora você conduz a partida.' : `O host saiu. ${host?.name ?? 'Outro jogador'} assumiu.`, 'neutral', '👑');
  }
  // Mesma rodada sorteada de novo: alguém saiu no meio. Só o Impostor faz isso.
  const before = previous.game.kind === 'impostor' ? previous.game.round : null;
  const now = snapshot.game.kind === 'impostor' ? snapshot.game.round : null;
  if (before && now && before.index === now.index && before.deal !== now.deal) {
    toast('Alguém saiu: a rodada foi sorteada de novo.', 'neutral', '🎲');
  }
});
services.room.subscribeConnection((connection) => {
  const prev = useMatchStore.getState().connection;
  if (prev.status !== 'online' && connection.status === 'online') toast('Conexão restabelecida');
  useMatchStore.setState({ connection });
});

/* ---------------------------------------------------------------- selectors */

export const useSnapshot = () => useMatchStore((s) => s.snapshot);
export const useConnection = () => useMatchStore((s) => s.connection);

export type MatchView = RoomSnapshot & {
  me: Player;
  host: Player | undefined;
  isHost: boolean;
  connectedPlayers: Player[];
  others: Player[];
  player: (id: PlayerId) => Player | undefined;
  /** Nome para exibição: "Você" para o próprio jogador. */
  displayName: (id: PlayerId) => string;
};

/** Snapshot + derivados usados por quase todas as telas de partida. `null` fora de uma sala. */
export function useMatch(): MatchView | null {
  const snapshot = useSnapshot();
  if (!snapshot) return null;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const me = byId.get(snapshot.meId);
  if (!me) return null;
  return {
    ...snapshot,
    me,
    host: byId.get(snapshot.room.hostId),
    isHost: snapshot.room.hostId === snapshot.meId,
    connectedPlayers: snapshot.players.filter((p) => p.connected),
    others: snapshot.players.filter((p) => p.id !== snapshot.meId && p.connected),
    player: (id) => byId.get(id),
    displayName: (id) => (id === snapshot.meId ? 'Você' : (byId.get(id)?.name ?? '—')),
  };
}

type ImpostorView = Extract<GameView, { kind: 'impostor' }>;
type LikelyView = Extract<GameView, { kind: 'likely' }>;
type SecretView = Extract<GameView, { kind: 'secret' }>;
type PerfectView = Extract<GameView, { kind: 'perfect' }>;
type BombRoomView = Extract<GameView, { kind: 'bomb' }>;
type WhoamiView = Extract<GameView, { kind: 'whoami' }>;

/**
 * As telas de um jogo pedem a view dele, já achatada no snapshot — `match.round`, `match.result`.
 * Devolve `null` quando a sala é de outro jogo, o que também cobre o instante entre trocar de sala
 * e o primeiro snapshot chegar.
 */
export function useImpostorMatch(): (MatchView & ImpostorView) | null {
  const match = useMatch();
  return match && match.game.kind === 'impostor' ? { ...match, ...match.game } : null;
}

export function useSecretMatch(): (MatchView & SecretView) | null {
  const match = useMatch();
  return match && match.game.kind === 'secret' ? { ...match, ...match.game } : null;
}

export function useLikelyMatch(): (MatchView & LikelyView) | null {
  const match = useMatch();
  return match && match.game.kind === 'likely' ? { ...match, ...match.game } : null;
}

export function usePerfectMatch(): (MatchView & PerfectView) | null {
  const match = useMatch();
  return match && match.game.kind === 'perfect' ? { ...match, ...match.game } : null;
}

export function useBombRoomMatch(): (MatchView & BombRoomView) | null {
  const match = useMatch();
  return match && match.game.kind === 'bomb' ? { ...match, ...match.game } : null;
}

export function useWhoamiMatch(): (MatchView & WhoamiView) | null {
  const match = useMatch();
  return match && match.game.kind === 'whoami' ? { ...match, ...match.game } : null;
}
