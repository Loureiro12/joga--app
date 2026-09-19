import { create } from 'zustand';

import { toast } from '@/core/ui/toast';
import { services } from '@/services';

import type { ConnectionState, Player, PlayerId, RoomSnapshot } from '@jogae/engine';

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

services.room.subscribe((snapshot) => useMatchStore.setState({ snapshot }));
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
