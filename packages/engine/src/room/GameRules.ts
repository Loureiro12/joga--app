import type { CreateRoomInput, GameId, GameView, Player, PlayerId, Room, Score, VoteProgress } from '../types';

import type { RoomCommand } from './protocol';
import type { EngineConfig } from './RoomEngine';

/**
 * A fronteira entre SALA e JOGO.
 *
 * O `RoomEngine` cuida do que vale para qualquer jogo: quem está na sala, quem caiu e por quanto
 * tempo guarda a vaga, migração de host, o alarme único, salvar e restaurar. Cada jogo implementa
 * este contrato e cuida só da partida: como é a rodada, o que é segredo, como apura, quanto vale.
 *
 * Regras da casa:
 * - `S` é JSON puro — ele é serializado junto com a sala e restaurado em outro processo.
 * - Nada de `Date.now()` nem `Math.random()`: use `ctx.now` e `ctx.rng`, senão a partida deixa
 *   de ser determinística e os testes param de valer.
 * - Todo prazo é um carimbo de tempo no estado, devolvido por `deadlines`. Quem arma o timer é a sala.
 */
export type GameCtx = {
  /** Mutável: é o jogo que muda `phase` e `roundIndex`. */
  room: Room;
  /** Todos os que estão na sala, conectados ou não. */
  players: Player[];
  /** Mutável: o placar acumulado da partida. */
  scores: Record<PlayerId, Score>;
  now: number;
  rng: () => number;
  config: EngineConfig;
};

export interface GameRules<S> {
  readonly id: GameId;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Comandos que só o host pode mandar; os demais são recusados com `not_host`. */
  readonly hostCommands: ReadonlySet<RoomCommand['type']>;

  /** Estado inicial, no lobby, a partir do que o host escolheu ao criar a sala. */
  initial(input: CreateRoomInput, ctx: GameCtx): S;
  /** Estado salvo por uma versão anterior pode não ter os campos mais novos. */
  hydrate(state: S): S;

  /** Host começou a partida. O jogo define a primeira fase. */
  startMatch(s: S, ctx: GameCtx): void;
  /** Comando de um jogador que já está na sala. Lança `RoomError` quando não cabe na fase. */
  dispatch(s: S, ctx: GameCtx, playerId: PlayerId, command: RoomCommand): void;
  /** Aplica UM prazo vencido. Devolve `false` quando não havia nada a aplicar. */
  step(s: S, ctx: GameCtx): boolean;
  /** Reavalia o que depende de quem está conectado (quem falta confirmar, quem falta votar). */
  recheck(s: S, ctx: GameCtx): void;
  /** Alguém saiu no meio da partida. A sala já removeu o jogador. */
  playerRemoved(s: S, ctx: GameCtx, playerId: PlayerId): void;
  /** Voltar ao lobby mantendo a turma ("jogar de novo"). */
  reset(s: S, ctx: GameCtx): void;

  /** Prazos pendentes, em epoch ms. A sala arma o alarme para o mais próximo. */
  deadlines(s: S, ctx: GameCtx): number[];
  /** A parte da foto que é deste jogo — já filtrada para o que ESTE jogador pode ver. */
  viewFor(s: S, ctx: GameCtx, playerId: PlayerId): GameView;
  /** Quem já votou (nunca em quem). `null` fora da votação. */
  voteProgress(s: S, ctx: GameCtx, playerId: PlayerId): VoteProgress | null;

  /**
   * Números do boletim que só o jogo conhece.
   * `impostorsCaught` e as estatísticas de papel nasceram do Impostor e continuam no histórico;
   * um jogo que não tem papel devolve zeros. Generalizar isso é dívida conhecida do passo 4.
   */
  recordExtras(s: S): { impostorsCaught: number; perPlayer: Record<PlayerId, { timesImpostor: number; timesEscaped: number }> };
}
