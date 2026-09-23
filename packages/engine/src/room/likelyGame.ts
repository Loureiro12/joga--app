import {
  LIKELY_RULES,
  eligibleTargets,
  pickLikelyQuestion,
  resolveLikelyRound,
  sanitizeSettings,
  type LikelyQuestion,
  type LikelyRoundResult,
  type LikelySettings,
} from '../games/likely';
import { RoomError, type GameView, type LikelyResultView, type PlayerId, type VoteProgress } from '../types';

import type { GameCtx, GameRules } from './GameRules';

/**
 * Estado do "Quem é Mais Provável?" dentro da sala.
 *
 * Duas coisas aqui não existem no Impostor e valem explicação:
 * - `eligibleIds` congela quem podia votar no instante em que a votação abriu. Quem entra no meio
 *   só participa da próxima pergunta, e quem sai depois de receber votos não os perde (spec §33/§34).
 * - `history`, `received` e os contadores alimentam o resumo do fim da partida, que é a graça
 *   social do jogo: "o grupo decidiu que fulano é o mais provável de…".
 */
export type LikelyState = {
  settings: LikelySettings;
  question: LikelyQuestion | null;
  /** Perguntas já feitas nesta partida: nenhuma se repete (spec §27). */
  askedIds: string[];
  votes: Record<PlayerId, PlayerId>;
  eligibleIds: PlayerId[];
  allVotedAt: number | null;
  result: LikelyRoundResult | null;
  revealStartedAt: number | null;
  stage: 0 | 1 | 2;
  /** Acumulados da partida, para o resumo do fim. */
  received: Record<PlayerId, number>;
  unanimities: number;
  ties: number;
  totalVotes: number;
  history: { questionId: string; question: string; winnerIds: PlayerId[]; votes: number }[];
};

/** `totalRounds: 0` é a opção "sem limite": a partida vai até o host encerrar. */
const isEndless = (ctx: GameCtx) => ctx.room.totalRounds <= 0;

const emptyRound = () => ({
  question: null,
  votes: {},
  eligibleIds: [],
  allVotedAt: null,
  result: null,
  revealStartedAt: null,
  stage: 0 as const,
});

export const likelyGame: GameRules<LikelyState> = {
  id: 'likely',
  minPlayers: LIKELY_RULES.minPlayers,
  maxPlayers: LIKELY_RULES.maxPlayers,
  hostCommands: new Set(['startMatch', 'openVoting', 'endVoting', 'skipQuestion', 'nextRound', 'playAgain']),

  initial(input) {
    return {
      ...emptyRound(),
      // O app manda as escolhas do host em `settings`; o que não vier usa o padrão.
      settings: sanitizeSettings(input.settings),
      askedIds: [],
      received: {},
      unanimities: 0,
      ties: 0,
      totalVotes: 0,
      history: [],
    };
  },

  hydrate(state) {
    // Sala salva por uma versão anterior pode não ter os campos mais novos.
    return Object.assign({ received: {}, unanimities: 0, ties: 0, totalVotes: 0, history: [] }, state, { settings: sanitizeSettings(state.settings) });
  },

  startMatch(s, ctx) {
    Object.assign(s, { askedIds: [], received: {}, unanimities: 0, ties: 0, totalVotes: 0, history: [] });
    beginRound(s, ctx, 1);
  },

  dispatch(s, ctx, playerId, command) {
    const phase = ctx.room.phase;
    switch (command.type) {
      case 'skipQuestion': {
        // Só antes de abrir a votação: depois de ver votos, pular seria escolher o resultado (spec §31).
        if (phase !== 'question') throw new RoomError('invalid_phase');
        drawQuestion(s, ctx);
        return;
      }
      case 'openVoting': {
        if (phase !== 'question') throw new RoomError('invalid_phase');
        s.votes = {};
        s.allVotedAt = null;
        // Congela o universo da votação: quem chegar depois entra só na próxima pergunta.
        s.eligibleIds = ctx.players.filter((p) => p.connected).map((p) => p.id);
        ctx.room.phase = 'voting';
        ctx.room.paused = false;
        return;
      }
      case 'castVote': {
        if (phase !== 'voting') throw new RoomError('invalid_phase');
        if (!s.eligibleIds.includes(playerId)) throw new RoomError('invalid_phase');
        if (s.votes[playerId]) return; // depois de confirmar, o voto fica bloqueado
        const alvos = eligibleTargets(ctx.players, playerId, s.settings);
        if (!alvos.includes(command.targetId)) throw new RoomError('bad_request');
        s.votes[playerId] = command.targetId;
        checkVotes(s, ctx);
        return;
      }
      case 'endVoting': {
        if (phase !== 'voting') throw new RoomError('invalid_phase');
        // O host encerra adiantado, mas só com voto registrado: sem isso não há resultado (spec §12).
        if (Object.keys(s.votes).length === 0) throw new RoomError('bad_request');
        s.allVotedAt = ctx.now;
        return;
      }
      case 'nextRound': {
        if (phase !== 'revealing' || s.stage !== 2) throw new RoomError('invalid_phase');
        const acabou = !isEndless(ctx) && ctx.room.roundIndex >= ctx.room.totalRounds;
        if (acabou) ctx.room.phase = 'finished';
        else beginRound(s, ctx, ctx.room.roundIndex + 1);
        return;
      }
      case 'endMatch': {
        // Único jeito de terminar uma partida sem limite.
        if (phase === 'lobby' || phase === 'finished' || phase === 'closed') throw new RoomError('invalid_phase');
        ctx.room.phase = 'finished';
        return;
      }
      case 'setPaused': {
        ctx.room.paused = command.paused;
        return;
      }
      default:
        throw new RoomError('bad_request');
    }
  },

  step(s, ctx) {
    const { config } = ctx;
    if (ctx.room.phase === 'voting' && s.allVotedAt !== null && s.allVotedAt + config.allVotedPauseMs <= ctx.now) {
      s.result = resolveLikelyRound(s.votes, s.eligibleIds, s.settings);
      s.revealStartedAt = ctx.now;
      s.stage = 0;
      ctx.room.phase = 'revealing';
      return true;
    }
    if (ctx.room.phase === 'revealing' && s.revealStartedAt !== null) {
      if (s.stage === 0 && s.revealStartedAt + config.revealStage1Ms <= ctx.now) {
        s.stage = 1;
        return true;
      }
      if (s.stage === 1 && s.revealStartedAt + config.revealStage2Ms <= ctx.now) {
        s.stage = 2;
        applyResult(s, ctx);
        return true;
      }
    }
    return false;
  },

  recheck(s, ctx) {
    checkVotes(s, ctx);
  },

  playerRemoved(s, ctx, playerId) {
    // Ao contrário do Impostor, a rodada NÃO é sorteada de novo: os votos já dados continuam
    // valendo, inclusive os recebidos por quem saiu (spec §34). Ele só some da próxima pergunta.
    s.eligibleIds = s.eligibleIds.filter((id) => id !== playerId);
    delete s.votes[playerId];
    checkVotes(s, ctx);
  },

  reset(s) {
    Object.assign(s, emptyRound(), { askedIds: [], received: {}, unanimities: 0, ties: 0, totalVotes: 0, history: [] });
  },

  deadlines(s, ctx) {
    const out: number[] = [];
    if (ctx.room.phase === 'voting' && s.allVotedAt !== null) out.push(s.allVotedAt + ctx.config.allVotedPauseMs);
    if (ctx.room.phase === 'revealing' && s.revealStartedAt !== null) {
      if (s.stage === 0) out.push(s.revealStartedAt + ctx.config.revealStage1Ms);
      if (s.stage === 1) out.push(s.revealStartedAt + ctx.config.revealStage2Ms);
    }
    return out;
  },

  viewFor(s, ctx, playerId): GameView {
    const inRound = s.question !== null && ctx.room.phase !== 'lobby';
    return {
      kind: 'likely',
      round: inRound
        ? {
            index: ctx.room.roundIndex,
            totalRounds: isEndless(ctx) ? null : ctx.room.totalRounds,
            questionId: s.question!.id,
            question: s.question!.text,
            category: s.question!.category,
            intensity: s.question!.intensity,
            targets: eligibleTargets(ctx.players, playerId, s.settings),
            timer: null,
          }
        : null,
      result: ctx.room.phase === 'revealing' && s.result ? maskedResult(s.result, s.stage) : null,
      summary: ctx.room.phase === 'finished' ? summaryOf(s) : null,
    };
  },

  voteProgress(s, ctx, playerId): VoteProgress | null {
    if (ctx.room.phase !== 'voting' && ctx.room.phase !== 'revealing') return null;
    // Nunca "fulano tem 3 votos": só quantos já votaram, para ninguém ser influenciado (spec §11).
    return { votedIds: Object.keys(s.votes), total: s.eligibleIds.length, myVote: s.votes[playerId] ?? null };
  },

  recordExtras() {
    // O jogo não tem impostor; o histórico guarda só posição e pontos.
    return { impostorsCaught: 0, perPlayer: {} };
  },
};

function beginRound(s: LikelyState, ctx: GameCtx, index: number): void {
  Object.assign(s, emptyRound());
  ctx.room.phase = 'question';
  ctx.room.roundIndex = index;
  ctx.room.paused = false;
  drawQuestion(s, ctx);
}

function drawQuestion(s: LikelyState, ctx: GameCtx): void {
  const question = pickLikelyQuestion(s.settings, new Set(s.askedIds), ctx.rng);
  s.question = question;
  if (!s.askedIds.includes(question.id)) s.askedIds.push(question.id);
}

function checkVotes(s: LikelyState, ctx: GameCtx): void {
  if (ctx.room.phase !== 'voting' || s.allVotedAt !== null) return;
  // Quem caiu deixa de ser esperado, senão a rodada trava por causa de um celular sem sinal.
  const esperados = s.eligibleIds.filter((id) => ctx.players.some((p) => p.id === id && p.connected));
  if (esperados.length > 0 && esperados.every((id) => s.votes[id])) s.allVotedAt = ctx.now;
}

/** Fecha a pergunta: pontos no placar e números para o resumo do fim. */
function applyResult(s: LikelyState, ctx: GameCtx): void {
  const r = s.result;
  if (!r) return;
  s.totalVotes += r.totalVotes;
  if (r.unanimous) s.unanimities += 1;
  if (r.winnerIds.length > 1) s.ties += 1;
  for (const entry of r.tally) s.received[entry.playerId] = (s.received[entry.playerId] ?? 0) + entry.votes;
  if (s.question) {
    s.history.push({ questionId: s.question.id, question: s.question.text, winnerIds: [...r.winnerIds], votes: r.tally[0]?.votes ?? 0 });
  }
  // No modo casual `pointsDelta` vem vazio: o placar não se mexe e a tela nem mostra pontos.
  for (const player of ctx.players) {
    const delta = r.pointsDelta[player.id] ?? 0;
    const previous = ctx.scores[player.id] ?? { playerId: player.id, points: 0, lastDelta: 0 };
    ctx.scores[player.id] = { playerId: player.id, points: previous.points + delta, lastDelta: delta };
  }
}

/** Tempo 0 não conta nada, tempo 1 mostra a contagem, tempo 2 abre tudo. */
function maskedResult(result: LikelyRoundResult, stage: 0 | 1 | 2): LikelyResultView {
  if (stage === 2) return { ...result, stage };
  if (stage === 1) return { ...result, stage, tally: [], pointsDelta: {} };
  return { stage, winnerIds: [], tally: [], totalVotes: result.totalVotes, eligibleCount: result.eligibleCount, unanimous: false, selfConfirmed: false, pointsDelta: {} };
}

function summaryOf(s: LikelyState) {
  const max = Math.max(0, ...Object.values(s.received));
  return {
    mostChosenIds: max > 0 ? Object.keys(s.received).filter((id) => s.received[id] === max) : [],
    questions: s.history.length,
    votes: s.totalVotes,
    unanimities: s.unanimities,
    ties: s.ties,
    // As mais marcantes primeiro: mais votos é mais consenso, e consenso rende conversa.
    highlights: [...s.history].sort((a, b) => b.votes - a.votes).slice(0, 3),
  };
}
