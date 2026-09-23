import { IMPOSTOR_RULES, createImpostorRound, resolveImpostorRound, type ImpostorRound } from '../games/impostor';
import { RoomError, type GameView, type ImpostorRoundResult, type PlayerId, type VoteProgress } from '../types';

import type { GameCtx, GameRules } from './GameRules';

/** Estado do Impostor dentro da sala. JSON puro: é salvo e restaurado junto com ela. */
export type ImpostorState = {
  round: ImpostorRound | null;
  /** Conta os sorteios da partida; ver `ImpostorRoundPublic.deal`. */
  deal: number;
  roundStartedAt: number | null;
  ackedIds: PlayerId[];
  timer: { remainingMs: number; endsAt: number | null };
  votes: Record<PlayerId, PlayerId>;
  allVotedAt: number | null;
  result: Omit<ImpostorRoundResult, 'stage'> | null;
  revealStartedAt: number | null;
  stage: 0 | 1 | 2;
  usedWords: string[];
  impostorsCaught: number;
  /** Por jogador, na partida em curso: vezes como impostor e vezes em que escapou. */
  roleStats: Record<PlayerId, { timesImpostor: number; timesEscaped: number }>;
};

const ROUND_MS = IMPOSTOR_RULES.roundSeconds * 1000;

const emptyRound = () => ({
  round: null,
  roundStartedAt: null,
  ackedIds: [],
  timer: { remainingMs: ROUND_MS, endsAt: null },
  votes: {},
  allVotedAt: null,
  result: null,
  revealStartedAt: null,
  stage: 0 as const,
});

export const impostorGame: GameRules<ImpostorState> = {
  id: 'impostor',
  minPlayers: IMPOSTOR_RULES.minPlayers,
  recommendedPlayers: IMPOSTOR_RULES.recommendedPlayers,
  maxPlayers: 12,
  hostCommands: new Set(['startMatch', 'setTimerRunning', 'resetTimer', 'openVoting', 'nextRound', 'playAgain']),

  initial() {
    return { ...emptyRound(), deal: 0, usedWords: [], impostorsCaught: 0, roleStats: {} };
  },

  hydrate(state) {
    // Sala salva por uma versão anterior pode não ter os campos mais novos.
    return Object.assign({ deal: 0, roleStats: {} }, state);
  },

  startMatch(s, ctx) {
    s.roleStats = {};
    beginRound(s, ctx, 1);
  },

  dispatch(s, ctx, playerId, command) {
    const phase = ctx.room.phase;
    switch (command.type) {
      case 'ackRole': {
        if (phase !== 'role_reveal') return;
        if (!s.ackedIds.includes(playerId)) s.ackedIds.push(playerId);
        checkAcks(s, ctx);
        return;
      }
      case 'setTimerRunning': {
        if (phase !== 'clues') throw new RoomError('invalid_phase');
        if (command.running) {
          if (ctx.room.paused || s.timer.endsAt !== null || s.timer.remainingMs <= 0) return;
          s.timer.endsAt = ctx.now + s.timer.remainingMs;
        } else stopTimer(s, ctx);
        return;
      }
      case 'resetTimer': {
        if (phase !== 'clues') throw new RoomError('invalid_phase');
        s.timer = { remainingMs: ROUND_MS, endsAt: null };
        return;
      }
      case 'openVoting': {
        if (phase !== 'clues') throw new RoomError('invalid_phase');
        stopTimer(s, ctx);
        s.votes = {};
        s.allVotedAt = null;
        ctx.room.phase = 'voting';
        ctx.room.paused = false;
        return;
      }
      case 'castVote': {
        if (phase !== 'voting') throw new RoomError('invalid_phase');
        if (s.votes[playerId]) return; // voto é voto
        // No Impostor ninguém vota em si mesmo: votar é acusar.
        if (command.targetId === playerId || !ctx.players.some((p) => p.id === command.targetId)) throw new RoomError('bad_request');
        s.votes[playerId] = command.targetId;
        checkVotes(s, ctx);
        return;
      }
      case 'nextRound': {
        if (phase !== 'revealing' || s.stage !== 2) throw new RoomError('invalid_phase');
        if (ctx.room.roundIndex >= ctx.room.totalRounds) ctx.room.phase = 'finished';
        else beginRound(s, ctx, ctx.room.roundIndex + 1);
        return;
      }
      case 'setPaused': {
        if (command.paused) stopTimer(s, ctx);
        ctx.room.paused = command.paused;
        return;
      }
      default:
        throw new RoomError('bad_request');
    }
  },

  step(s, ctx) {
    const { config } = ctx;
    if (ctx.room.phase === 'role_reveal' && s.roundStartedAt !== null && s.roundStartedAt + config.ackTimeoutMs <= ctx.now) {
      // Se alguém nunca confirmar que viu o papel, a rodada segue mesmo assim.
      ctx.room.phase = 'clues';
      return true;
    }
    if (ctx.room.phase === 'clues' && s.timer.endsAt !== null && s.timer.endsAt <= ctx.now) {
      s.timer = { remainingMs: 0, endsAt: null };
      return true;
    }
    if (ctx.room.phase === 'voting' && s.allVotedAt !== null && s.allVotedAt + config.allVotedPauseMs <= ctx.now) {
      s.result = resolveImpostorRound(s.round!, s.votes, ctx.players);
      s.revealStartedAt = ctx.now;
      s.stage = 0;
      ctx.room.phase = 'revealing';
      ctx.room.paused = false;
      return true;
    }
    if (ctx.room.phase === 'revealing' && s.revealStartedAt !== null) {
      if (s.stage === 0 && s.revealStartedAt + config.revealStage1Ms <= ctx.now) {
        s.stage = 1;
        return true;
      }
      if (s.stage === 1 && s.revealStartedAt + config.revealStage2Ms <= ctx.now) {
        s.stage = 2;
        applyScores(s, ctx);
        return true;
      }
    }
    return false;
  },

  recheck(s, ctx) {
    checkAcks(s, ctx);
    checkVotes(s, ctx);
  },

  playerRemoved(s, ctx) {
    // Ordem, impostor e votos referenciam quem saiu: a rodada é sorteada de novo, com o mesmo número.
    if (ctx.room.phase !== 'revealing') beginRound(s, ctx, ctx.room.roundIndex);
  },

  reset(s) {
    Object.assign(s, emptyRound(), { usedWords: [], impostorsCaught: 0, roleStats: {} });
  },

  deadlines(s, ctx) {
    const { config } = ctx;
    const out: number[] = [];
    if (ctx.room.phase === 'role_reveal' && s.roundStartedAt !== null) out.push(s.roundStartedAt + config.ackTimeoutMs);
    if (ctx.room.phase === 'clues' && s.timer.endsAt !== null) out.push(s.timer.endsAt);
    if (ctx.room.phase === 'voting' && s.allVotedAt !== null) out.push(s.allVotedAt + config.allVotedPauseMs);
    if (ctx.room.phase === 'revealing' && s.revealStartedAt !== null) {
      if (s.stage === 0) out.push(s.revealStartedAt + config.revealStage1Ms);
      if (s.stage === 1) out.push(s.revealStartedAt + config.revealStage2Ms);
    }
    return out;
  },

  viewFor(s, ctx, playerId): GameView {
    const inRound = s.round !== null && ctx.room.phase !== 'lobby';
    const remainingMs = s.timer.endsAt !== null ? Math.max(0, s.timer.endsAt - ctx.now) : s.timer.remainingMs;
    const scores = rankedScores(ctx);
    return {
      kind: 'impostor',
      round: inRound
        ? {
            index: ctx.room.roundIndex,
            deal: s.deal,
            category: s.round!.category,
            starterId: s.round!.order[0],
            order: [...s.round!.order],
            ackedIds: [...s.ackedIds],
            timer: { durationSec: IMPOSTOR_RULES.roundSeconds, remainingSec: Math.ceil(remainingMs / 1000), running: s.timer.endsAt !== null },
          }
        : null,
      secret: inRound ? (s.round!.impostorId === playerId ? { role: 'impostor' } : { role: 'word', word: s.round!.word.word, emoji: s.round!.word.emoji }) : null,
      result: ctx.room.phase === 'revealing' && s.result ? maskedResult(s.result, s.stage) : null,
      summary: ctx.room.phase === 'finished' && scores[0] ? { winnerId: scores[0], impostorsCaught: s.impostorsCaught } : null,
    };
  },

  voteProgress(s, ctx, playerId): VoteProgress | null {
    if (ctx.room.phase !== 'voting' && ctx.room.phase !== 'revealing') return null;
    return { votedIds: Object.keys(s.votes), total: ctx.players.filter((p) => p.connected).length, myVote: s.votes[playerId] ?? null };
  },

  recordExtras(s) {
    return { impostorsCaught: s.impostorsCaught, perPlayer: s.roleStats };
  },
};

function rankedScores(ctx: GameCtx): PlayerId[] {
  const present = new Set(ctx.players.map((p) => p.id));
  return Object.values(ctx.scores)
    .filter((score) => present.has(score.playerId))
    .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId))
    .map((s) => s.playerId);
}

function beginRound(s: ImpostorState, ctx: GameCtx, index: number): void {
  const round = createImpostorRound(ctx.players, ctx.room.category, new Set(s.usedWords), ctx.rng);
  s.usedWords.push(round.word.word);
  Object.assign(s, emptyRound());
  s.round = round;
  s.deal += 1;
  s.roundStartedAt = ctx.now;
  ctx.room.phase = 'role_reveal';
  ctx.room.roundIndex = index;
  ctx.room.paused = false;
}

function stopTimer(s: ImpostorState, ctx: GameCtx): void {
  if (s.timer.endsAt === null) return;
  s.timer.remainingMs = Math.max(0, s.timer.endsAt - ctx.now);
  s.timer.endsAt = null;
}

function checkAcks(s: ImpostorState, ctx: GameCtx): void {
  if (ctx.room.phase !== 'role_reveal') return;
  // Quem caiu deixa de ser esperado: a rodada não trava por causa de um celular sem sinal.
  if (ctx.players.every((p) => !p.connected || s.ackedIds.includes(p.id))) ctx.room.phase = 'clues';
}

function checkVotes(s: ImpostorState, ctx: GameCtx): void {
  if (ctx.room.phase !== 'voting' || s.allVotedAt !== null) return;
  const connected = ctx.players.filter((p) => p.connected);
  if (connected.length > 0 && connected.every((p) => s.votes[p.id])) s.allVotedAt = ctx.now;
}

/** Os pontos só entram no placar junto com o desfecho, para o placar não entregar o resultado antes. */
function applyScores(s: ImpostorState, ctx: GameCtx): void {
  if (!s.result) return;
  if (s.result.caught) s.impostorsCaught += 1;
  const role = (s.roleStats[s.result.impostorId] ??= { timesImpostor: 0, timesEscaped: 0 });
  role.timesImpostor += 1;
  if (!s.result.caught) role.timesEscaped += 1;
  for (const player of ctx.players) {
    const delta = s.result.pointsDelta[player.id] ?? 0;
    const previous = ctx.scores[player.id] ?? { playerId: player.id, points: 0, lastDelta: 0 };
    ctx.scores[player.id] = { playerId: player.id, points: previous.points + delta, lastDelta: delta };
  }
}

/** Nada do desfecho sai antes da hora: tempo 0 = suspense, tempo 1 = só o escolhido, tempo 2 = tudo. */
function maskedResult(result: Omit<ImpostorRoundResult, 'stage'>, stage: 0 | 1 | 2): ImpostorRoundResult {
  if (stage === 2) return { ...result, stage };
  return {
    stage,
    chosenId: stage === 1 ? result.chosenId : '',
    impostorId: '',
    caught: false,
    word: '',
    tally: [],
    pointsDelta: {},
    headline: { points: 0, target: 'group' },
  };
}
