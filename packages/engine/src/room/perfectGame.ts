import {
  PERFECT_RULES,
  countPerfectQuestions,
  outcomeOf,
  pickPerfectQuestion,
  pointsFor,
  roundPoints,
  sanitizePerfectSettings,
  scaleOptions,
} from '../games/perfect';
import {
  PERFECT_STREAKS,
  type PerfectCategory,
  type PerfectCouple,
  type PerfectCoupleReveal,
  type PerfectOption,
  type PerfectOutcome,
  type PerfectQuestion,
  type PerfectSettings,
  type PerfectStanding,
  type PerfectSummary,
  type PerfectTitle,
} from '../games/perfect-types';
import { RoomError, type GameView, type PlayerId, type VoteProgress } from '../types';

import type { GameCtx, GameRules } from './GameRules';

/**
 * Casal Perfeito: os dois respondem em segredo, no próprio celular, e a graça é a espera entre
 * apertar a resposta e descobrir se o outro apertou a mesma (§74).
 *
 * Duas coisas moldam este arquivo:
 *
 * - **A unidade do jogo é o casal, não o jogador.** Placar, sequência, título e estatística são
 *   do par. O `RoomEngine` só conhece jogadores, então o placar da sala guarda a mesma pontuação
 *   nos dois — é o que faz o histórico e o ranking da sala continuarem funcionando sem saber o
 *   que é um casal.
 * - **A resposta de um nunca chega ao celular do outro antes da revelação** (§32). O snapshot de
 *   cada jogador carrega só a própria resposta; as dos outros aparecem de uma vez, em `result`.
 */

type CoupleStats = {
  matches: number;
  rounds: number;
  streak: number;
  bestStreak: number;
  byCategory: Record<string, { m: number; t: number }>;
};

export type PerfectState = {
  settings: PerfectSettings;
  couples: PerfectCouple[];
  /** Convites pendentes: quem convidou → quem foi convidado. Só vira casal com o aceite (§8). */
  invites: Record<PlayerId, PlayerId>;
  question: PerfectQuestion | null;
  askedIds: string[];
  /** Em `know`, de quem é a pergunta nesta rodada, por casal. */
  aboutOf: Record<string, PlayerId>;
  /** Quantas rodadas de previsão cada casal já teve — é o que faz a vez alternar (§28). */
  knowTurn: Record<string, number>;
  answers: Record<PlayerId, string>;
  answerDeadline: number | null;
  lockedAt: number | null;
  result: PerfectCoupleReveal[] | null;
  revealStartedAt: number | null;
  stage: 0 | 1 | 2;
  double: boolean;
  final: boolean;
  /** Casais empatados no topo, jogando o desempate (§48). Vazio fora dele. */
  tieBreakIds: string[];
  tieBreakCount: number;
  stats: Record<string, CoupleStats>;
  /** Acertos de previsão por pessoa: alimenta o "leitor de mentes" (§53). */
  reads: Record<PlayerId, { hits: number; tries: number }>;
  history: { questionId: string; text: string; outcome: Record<string, PerfectOutcome> }[];
};

/** Identidade visual de cada casal (§10). Atribuída na ordem em que as duplas fecham. */
const LOOKS = [
  { emoji: '❤️', color: '#EF4444' },
  { emoji: '💙', color: '#3B82F6' },
  { emoji: '💛', color: '#FACC15' },
  { emoji: '💚', color: '#22C55E' },
  { emoji: '💜', color: '#A78BFA' },
  { emoji: '🧡', color: '#FB923C' },
];

const emptyRound = () => ({
  question: null,
  answers: {},
  answerDeadline: null,
  lockedAt: null,
  result: null,
  revealStartedAt: null,
  stage: 0 as const,
  double: false,
  final: false,
});

const emptyMatch = () => ({
  askedIds: [],
  aboutOf: {},
  knowTurn: {},
  tieBreakIds: [],
  tieBreakCount: 0,
  stats: {},
  reads: {},
  history: [],
});

const novaEstatistica = (): CoupleStats => ({ matches: 0, rounds: 0, streak: 0, bestStreak: 0, byCategory: {} });

/** `totalRounds: 0` é a partida sem limite: vai até o host encerrar (§11). */
const isEndless = (ctx: GameCtx) => ctx.room.totalRounds <= 0;

const coupleOf = (s: PerfectState, playerId: PlayerId) => s.couples.find((c) => c.aId === playerId || c.bId === playerId);
const partnerOf = (s: PerfectState, playerId: PlayerId): PlayerId | null => {
  const c = coupleOf(s, playerId);
  return c ? (c.aId === playerId ? c.bId : c.aId) : null;
};
const membersOf = (c: PerfectCouple): PlayerId[] => [c.aId, c.bId];
const nameOf = (ctx: GameCtx, id: PlayerId) => ctx.players.find((p) => p.id === id)?.name ?? '—';

export const perfectGame: GameRules<PerfectState> = {
  id: 'perfect',
  minPlayers: PERFECT_RULES.minPlayers,
  recommendedPlayers: PERFECT_RULES.recommendedPlayers,
  maxPlayers: PERFECT_RULES.maxPlayers,
  hostCommands: new Set(['startMatch', 'beginQuestions', 'skipQuestion', 'nextRound', 'endMatch', 'playAgain']),

  initial(input) {
    return { ...emptyRound(), ...emptyMatch(), settings: sanitizePerfectSettings(input.settings), couples: [], invites: {} };
  },

  hydrate(state) {
    return Object.assign({ ...emptyMatch(), couples: [], invites: {} }, state, { settings: sanitizePerfectSettings(state.settings) });
  },

  startMatch(s, ctx) {
    // Começar não abre a primeira pergunta: abre a formação das duplas (§7). Sem par definido,
    // não existe com quem comparar resposta.
    Object.assign(s, emptyRound(), emptyMatch(), { couples: [], invites: {} });
    ctx.room.phase = 'pairing';
    ctx.room.roundIndex = 0;
  },

  dispatch(s, ctx, playerId, command) {
    const phase = ctx.room.phase;
    switch (command.type) {
      case 'pairWith': {
        if (phase !== 'pairing') throw new RoomError('invalid_phase');
        const alvo = ctx.players.find((p) => p.id === command.targetId && p.connected);
        if (!alvo || alvo.id === playerId) throw new RoomError('bad_request');
        if (coupleOf(s, playerId) || coupleOf(s, alvo.id)) throw new RoomError('bad_request');

        // O outro já tinha convidado: é o aceite, e a dupla fecha (§8).
        if (s.invites[alvo.id] === playerId) {
          delete s.invites[alvo.id];
          delete s.invites[playerId];
          const look = LOOKS[s.couples.length % LOOKS.length];
          s.couples.push({ id: `c${s.couples.length + 1}`, aId: alvo.id, bId: playerId, ...look });
          return;
        }
        s.invites[playerId] = alvo.id;
        return;
      }

      case 'unpair': {
        if (phase !== 'pairing') throw new RoomError('invalid_phase');
        delete s.invites[playerId];
        const casal = coupleOf(s, playerId);
        if (casal) desfazer(s, casal.id);
        return;
      }

      case 'beginQuestions': {
        if (phase !== 'pairing') throw new RoomError('invalid_phase');
        if (s.couples.length === 0) throw new RoomError('not_enough_players');
        // Ninguém fica de fora: quem está na sala sem par travaria a rodada esperando resposta.
        if (ctx.players.some((p) => p.connected && !coupleOf(s, p.id))) throw new RoomError('not_enough_players');
        beginRound(s, ctx, 1);
        return;
      }

      case 'skipQuestion': {
        // Válvula de escape para a pergunta que não cabe naquela mesa (§59). Só antes da primeira
        // resposta: depois, trocar seria escolher o resultado.
        if (phase !== 'answering' || Object.keys(s.answers).length > 0) throw new RoomError('invalid_phase');
        drawQuestion(s, ctx);
        return;
      }

      case 'submitAnswer': {
        if (phase !== 'answering' || !s.question) throw new RoomError('invalid_phase');
        if (!quemResponde(s, ctx).includes(playerId)) throw new RoomError('invalid_phase');
        if (s.answers[playerId]) return; // enviada é enviada (§33)
        const validas = optionsFor(s, ctx, playerId).map((o) => o.id);
        if (!validas.includes(command.value)) throw new RoomError('bad_request');
        s.answers[playerId] = command.value;
        checkAnswers(s, ctx);
        return;
      }

      case 'nextRound': {
        if (phase !== 'revealing' || s.stage !== 2) throw new RoomError('invalid_phase');
        avancar(s, ctx);
        return;
      }

      case 'endMatch': {
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
    // O cronômetro fecha a rodada com o que houver: quem não respondeu fica sem match (§34).
    if (ctx.room.phase === 'answering' && s.answerDeadline !== null && s.answerDeadline <= ctx.now && s.lockedAt === null) {
      s.lockedAt = ctx.now;
      return true;
    }
    if (ctx.room.phase === 'answering' && s.lockedAt !== null && s.lockedAt + config.allVotedPauseMs <= ctx.now) {
      s.result = apurar(s, ctx);
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
        aplicar(s, ctx);
        return true;
      }
    }
    return false;
  },

  recheck(s, ctx) {
    checkAnswers(s, ctx);
  },

  playerRemoved(s, ctx, playerId) {
    delete s.invites[playerId];
    for (const [de, para] of Object.entries(s.invites)) if (para === playerId) delete s.invites[de];
    delete s.answers[playerId];
    // Sem o par, o casal não tem o que comparar: sai da disputa e quem ficou volta a ser avulso.
    const casal = coupleOf(s, playerId);
    if (casal) desfazer(s, casal.id);
    checkAnswers(s, ctx);
  },

  reset(s) {
    Object.assign(s, emptyRound(), emptyMatch(), { couples: [], invites: {} });
  },

  deadlines(s, ctx) {
    const out: number[] = [];
    if (ctx.room.phase === 'answering') {
      if (s.lockedAt !== null) out.push(s.lockedAt + ctx.config.allVotedPauseMs);
      else if (s.answerDeadline !== null) out.push(s.answerDeadline);
    }
    if (ctx.room.phase === 'revealing' && s.revealStartedAt !== null) {
      if (s.stage === 0) out.push(s.revealStartedAt + ctx.config.revealStage1Ms);
      if (s.stage === 1) out.push(s.revealStartedAt + ctx.config.revealStage2Ms);
    }
    return out;
  },

  viewFor(s, ctx, playerId): GameView {
    const phase = ctx.room.phase;
    const meu = coupleOf(s, playerId);
    const emRodada = s.question !== null && (phase === 'answering' || phase === 'revealing');

    return {
      kind: 'perfect',
      couples: s.couples,
      myCoupleId: meu?.id ?? null,
      pairing:
        phase === 'pairing'
          ? {
              couples: s.couples,
              waiting: ctx.players.filter((p) => p.connected && !coupleOf(s, p.id)).map((p) => p.id),
              invited: s.invites[playerId] ?? null,
              invitedBy: Object.entries(s.invites)
                .filter(([, para]) => para === playerId)
                .map(([de]) => de),
            }
          : null,
      round: emRodada ? roundView(s, ctx, playerId) : null,
      myAnswer: s.answers[playerId] ?? null,
      result:
        phase === 'revealing' && s.result
          ? {
              stage: s.stage,
              // Antes do tempo 1 a tela só mostra a pergunta e a expectativa: é a espera que faz o jogo.
              couples: s.stage === 0 ? [] : s.result,
              standings: s.stage === 2 && mostrarPlacar(s, ctx) ? standingsOf(s) : null,
            }
          : null,
      summary: phase === 'finished' ? summaryOf(s, ctx, playerId) : null,
    };
  },

  voteProgress(s, ctx): VoteProgress | null {
    if (ctx.room.phase !== 'answering') return null;
    // Quantos já responderam — nunca o quê (§69).
    const esperados = quemResponde(s, ctx);
    return { votedIds: esperados.filter((id) => s.answers[id]), total: esperados.length, myVote: null };
  },

  recordExtras() {
    return { impostorsCaught: 0, perPlayer: {} };
  },
};

/* --------------------------------------------------------------- pareamento */

function desfazer(s: PerfectState, coupleId: string): void {
  s.couples = s.couples.filter((c) => c.id !== coupleId);
  delete s.stats[coupleId];
  delete s.aboutOf[coupleId];
  delete s.knowTurn[coupleId];
  s.tieBreakIds = s.tieBreakIds.filter((id) => id !== coupleId);
}

/* ------------------------------------------------------------------ rodadas */

function beginRound(s: PerfectState, ctx: GameCtx, index: number): void {
  Object.assign(s, emptyRound());
  ctx.room.phase = 'answering';
  ctx.room.roundIndex = index;
  ctx.room.paused = false;
  // O match final vale dobro, e a rodada em dobro aparece de vez em quando — nunca na primeira,
  // que ninguém entrou no ritmo ainda (§43, §47).
  s.final = !isEndless(ctx) && index >= ctx.room.totalRounds;
  s.double = s.final || (index > 1 && ctx.rng() < 0.15);
  drawQuestion(s, ctx);
  if (s.settings.timerSec > 0) s.answerDeadline = ctx.now + s.settings.timerSec * 1000;
}

function drawQuestion(s: PerfectState, ctx: GameCtx): void {
  // O desempate é sempre de escala: vence a menor diferença interna, e para isso a resposta
  // precisa ser um número (§49).
  const tipo = s.tieBreakIds.length ? ('scale' as const) : undefined;
  const q = pickPerfectQuestion(s.settings, new Set(s.askedIds), ctx.rng, tipo);
  s.question = q;
  if (!s.askedIds.includes(q.id)) s.askedIds.push(q.id);
  s.answers = {};
  s.lockedAt = null;
  // Em `know`, a vez alterna a cada rodada de previsão do casal (§28).
  if (q.type === 'know') {
    for (const casal of casaisDaRodada(s)) {
      const vez = s.knowTurn[casal.id] ?? 0;
      s.aboutOf[casal.id] = vez % 2 === 0 ? casal.aId : casal.bId;
      s.knowTurn[casal.id] = vez + 1;
    }
  }
}

/** Os casais que jogam esta rodada: todos, ou só os empatados quando é desempate. */
const casaisDaRodada = (s: PerfectState): PerfectCouple[] =>
  s.tieBreakIds.length ? s.couples.filter((c) => s.tieBreakIds.includes(c.id)) : s.couples;

/** Quem precisa responder para a rodada fechar: quem está em casal da rodada e conectado. */
function quemResponde(s: PerfectState, ctx: GameCtx): PlayerId[] {
  const conectado = (id: PlayerId) => ctx.players.some((p) => p.id === id && p.connected);
  return casaisDaRodada(s).flatMap(membersOf).filter(conectado);
}

function checkAnswers(s: PerfectState, ctx: GameCtx): void {
  if (ctx.room.phase !== 'answering' || s.lockedAt !== null) return;
  const esperados = quemResponde(s, ctx);
  // Quem caiu não é esperado: um celular sem sinal não pode segurar a mesa inteira.
  if (esperados.length > 0 && esperados.every((id) => s.answers[id])) s.lockedAt = ctx.now;
}

/* ------------------------------------------------------ o que cada um vê */

function optionsFor(s: PerfectState, ctx: GameCtx, playerId: PlayerId): PerfectOption[] {
  const q = s.question;
  if (!q) return [];
  if (q.type === 'scale') return scaleOptions();
  if (q.type === 'who') {
    const parceiro = partnerOf(s, playerId);
    // "Eu" e o nome do outro. O servidor compara a pessoa, não a palavra (§25).
    return [
      { id: 'self', emoji: '👤', label: 'Eu' },
      { id: 'partner', emoji: '💞', label: parceiro ? nameOf(ctx, parceiro) : 'Meu par' },
    ];
  }
  return q.options ?? [];
}

function roundView(s: PerfectState, ctx: GameCtx, playerId: PlayerId) {
  const q = s.question!;
  const casal = coupleOf(s, playerId);
  const alvo = q.type === 'know' && casal ? (s.aboutOf[casal.id] ?? null) : null;
  const sobreMim = alvo === playerId;
  const parceiro = partnerOf(s, playerId);

  const prompt =
    q.type === 'know' && !sobreMim
      ? (q.predictText ?? q.text).replace('{nome}', parceiro ? nameOf(ctx, parceiro) : 'seu par')
      : q.text;

  return {
    index: ctx.room.roundIndex,
    totalRounds: isEndless(ctx) ? null : ctx.room.totalRounds,
    questionId: q.id,
    category: q.category,
    type: q.type,
    prompt,
    options: optionsFor(s, ctx, playerId),
    scale: q.scale ?? null,
    aboutId: alvo,
    points: roundPoints(s.double),
    double: s.double,
    final: s.final,
    tieBreak: s.tieBreakIds.length > 0,
    timer:
      s.settings.timerSec > 0 && s.answerDeadline !== null
        ? { durationSec: s.settings.timerSec, remainingSec: Math.max(0, Math.ceil((s.answerDeadline - ctx.now) / 1000)) }
        : null,
  };
}

/* ------------------------------------------------------------------ apuração */

/** O que a resposta quer dizer, em algo comparável: em `who`, a PESSOA escolhida (§25). */
function normalizar(s: PerfectState, playerId: PlayerId, valor: string | undefined): string | undefined {
  if (!valor) return undefined;
  if (s.question?.type !== 'who') return valor;
  return valor === 'self' ? playerId : (partnerOf(s, playerId) ?? undefined);
}

/** Em "quem é mais", a pessoa apontada. `null` nas outras mecânicas, em que a resposta é uma opção. */
function escolhido(s: PerfectState, playerId: PlayerId, valor: string | undefined): PlayerId | null {
  if (!valor || s.question?.type !== 'who') return null;
  return valor === 'self' ? playerId : partnerOf(s, playerId);
}

function rotulo(s: PerfectState, ctx: GameCtx, playerId: PlayerId, valor: string | undefined): string {
  if (!valor) return '—';
  const q = s.question!;
  if (q.type === 'who') return valor === 'self' ? nameOf(ctx, playerId) : nameOf(ctx, partnerOf(s, playerId) ?? '');
  if (q.type === 'scale') return valor;
  return q.options?.find((o) => o.id === valor)?.label ?? valor;
}

function apurar(s: PerfectState, ctx: GameCtx): PerfectCoupleReveal[] {
  const q = s.question!;
  const valor = roundPoints(s.double);

  return casaisDaRodada(s).map((casal) => {
    const [a, b] = membersOf(casal);
    const respostaA = s.answers[a];
    const respostaB = s.answers[b];

    // Em `know`, a verdade é a resposta de quem falou de si; o outro tentou adivinhar.
    const outcome =
      q.type === 'know'
        ? outcomeOf(q.type, respostaA, respostaB)
        : outcomeOf(q.type, normalizar(s, a, respostaA), normalizar(s, b, respostaB));

    const stats = s.stats[casal.id] ?? novaEstatistica();
    const streak = outcome === 'match' ? stats.streak + 1 : 0;

    return {
      coupleId: casal.id,
      answers: [
        { playerId: a, label: rotulo(s, ctx, a, respostaA), chosenId: escolhido(s, a, respostaA), missing: !respostaA },
        { playerId: b, label: rotulo(s, ctx, b, respostaB), chosenId: escolhido(s, b, respostaB), missing: !respostaB },
      ],
      outcome,
      points: pointsFor(outcome, valor),
      streak,
    };
  });
}

/** Fecha a rodada: pontos no placar da sala, números para os títulos do fim. */
function aplicar(s: PerfectState, ctx: GameCtx): void {
  const q = s.question;
  if (!s.result || !q) return;
  const outcomePorCasal: Record<string, PerfectOutcome> = {};

  for (const linha of s.result) {
    const casal = s.couples.find((c) => c.id === linha.coupleId);
    if (!casal) continue;
    const stats = (s.stats[casal.id] ??= novaEstatistica());
    stats.rounds += 1;
    if (linha.outcome === 'match') stats.matches += 1;
    stats.streak = linha.streak;
    stats.bestStreak = Math.max(stats.bestStreak, linha.streak);
    const cat = (stats.byCategory[q.category] ??= { m: 0, t: 0 });
    cat.t += 1;
    if (linha.outcome === 'match') cat.m += 1;
    outcomePorCasal[casal.id] = linha.outcome;

    // O placar da sala é por jogador; os dois do casal carregam o mesmo número.
    for (const id of membersOf(casal)) {
      const antes = ctx.scores[id] ?? { playerId: id, points: 0, lastDelta: 0 };
      ctx.scores[id] = { playerId: id, points: antes.points + linha.points, lastDelta: linha.points };
    }

    // Previsão: quem tentou adivinhar o outro acertou? É o que decide o leitor de mentes (§53).
    if (q.type === 'know') {
      const alvo = s.aboutOf[casal.id];
      const adivinho = alvo === casal.aId ? casal.bId : casal.aId;
      const r = (s.reads[adivinho] ??= { hits: 0, tries: 0 });
      r.tries += 1;
      if (linha.outcome === 'match') r.hits += 1;
    }
  }

  s.history.push({ questionId: q.id, text: q.text, outcome: outcomePorCasal });
}

/** Passa para a próxima pergunta, para o desempate, ou fecha a partida. */
function avancar(s: PerfectState, ctx: GameCtx): void {
  if (s.tieBreakIds.length) {
    const vencedores = vencedoresDoDesempate(s);
    // Ainda empatados: outra pergunta, até o limite. Depois disso, o troféu é dividido (§49).
    if (vencedores.length > 1 && s.tieBreakCount < 3) return abrirDesempate(s, ctx, vencedores);
    for (const id of vencedores) premiarDesempate(s, ctx, id);
    s.tieBreakIds = [];
    ctx.room.phase = 'finished';
    return;
  }

  const acabou = !isEndless(ctx) && ctx.room.roundIndex >= ctx.room.totalRounds;
  if (!acabou) return beginRound(s, ctx, ctx.room.roundIndex + 1);

  const empatados = empateNoTopo(s);
  if (empatados.length > 1) return abrirDesempate(s, ctx, empatados);
  ctx.room.phase = 'finished';
}

function empateNoTopo(s: PerfectState): string[] {
  const placar = standingsOf(s);
  if (placar.length < 2) return [];
  const topo = placar[0].points;
  const empatados = placar.filter((l) => l.points === topo);
  return empatados.length > 1 ? empatados.map((l) => l.coupleId) : [];
}

function abrirDesempate(s: PerfectState, ctx: GameCtx, coupleIds: string[]): void {
  s.tieBreakIds = coupleIds;
  s.tieBreakCount += 1;
  beginRound(s, ctx, ctx.room.roundIndex + 1);
}

/** Vence o desempate quem tiver a menor diferença interna (§49). */
function vencedoresDoDesempate(s: PerfectState): string[] {
  const linhas = (s.result ?? []).map((linha) => {
    const [a, b] = linha.answers;
    const distancia = a.missing || b.missing ? Number.POSITIVE_INFINITY : Math.abs(Number(a.label) - Number(b.label));
    return { coupleId: linha.coupleId, distancia };
  });
  if (!linhas.length) return s.tieBreakIds;
  const melhor = Math.min(...linhas.map((l) => l.distancia));
  return linhas.filter((l) => l.distancia === melhor).map((l) => l.coupleId);
}

/** O desempate não vale pontos de verdade: vale a ponta, e só. */
function premiarDesempate(s: PerfectState, ctx: GameCtx, coupleId: string): void {
  const casal = s.couples.find((c) => c.id === coupleId);
  if (!casal) return;
  for (const id of membersOf(casal)) {
    const antes = ctx.scores[id] ?? { playerId: id, points: 0, lastDelta: 0 };
    ctx.scores[id] = { playerId: id, points: antes.points + 1, lastDelta: 1 };
  }
}

/* -------------------------------------------------------------------- placar */

function standingsOf(s: PerfectState): PerfectStanding[] {
  return s.couples
    .map((c) => {
      const stats = s.stats[c.id] ?? novaEstatistica();
      return { coupleId: c.id, points: pontosDoCasal(s, c.id), matches: stats.matches, rounds: stats.rounds };
    })
    .sort((a, b) => b.points - a.points || b.matches - a.matches);
}

/** Os pontos do casal saem do histórico do próprio jogo, não do placar da sala. */
function pontosDoCasal(s: PerfectState, coupleId: string): number {
  let total = 0;
  for (const linha of s.history) {
    const outcome = linha.outcome[coupleId];
    if (outcome === 'match') total += 100;
    else if (outcome === 'close') total += 50;
  }
  return total;
}

/**
 * Quando o placar aparece entre as rodadas: a cada cinco (§45), e nunca nas três últimas (§46).
 * Terminar sem saber quem está na frente é o que faz a contagem regressiva do fim valer alguma coisa.
 */
function mostrarPlacar(s: PerfectState, ctx: GameCtx): boolean {
  if (s.tieBreakIds.length) return false;
  const i = ctx.room.roundIndex;
  if (isEndless(ctx)) return i % 5 === 0;
  if (i > ctx.room.totalRounds - 3) return false;
  return i % 5 === 0;
}

/* ------------------------------------------------------------------- o fim */

function summaryOf(s: PerfectState, ctx: GameCtx, playerId: PlayerId): PerfectSummary {
  const placar = standingsOf(s);
  const totalRodadas = placar.reduce((n, l) => n + l.rounds, 0);
  const totalMatches = placar.reduce((n, l) => n + l.matches, 0);
  const meu = coupleOf(s, playerId);

  return {
    standings: placar,
    titles: titlesOf(s, ctx),
    percent: totalRodadas ? Math.round((totalMatches / totalRodadas) * 100) : 0,
    mine: meu ? mineOf(s, meu) : null,
  };
}

function mineOf(s: PerfectState, casal: PerfectCouple): NonNullable<PerfectSummary['mine']> {
  const stats = s.stats[casal.id] ?? novaEstatistica();
  // A melhor categoria é a de maior aproveitamento; com empate, ganha a que teve mais perguntas.
  const categorias = Object.entries(stats.byCategory)
    .map(([category, v]) => ({ category: category as PerfectCategory, matches: v.m, rounds: v.t }))
    .sort((a, b) => b.matches / b.rounds - a.matches / a.rounds || b.rounds - a.rounds);

  return {
    coupleId: casal.id,
    matches: stats.matches,
    rounds: stats.rounds,
    bestStreak: stats.bestStreak,
    bestCategory: categorias.length && categorias[0].matches > 0 ? categorias[0] : null,
    // Em que combinaram e em que não (§55): é a conversa que continua depois da partida.
    agreed: s.history.filter((h) => h.outcome[casal.id] === 'match').map((h) => h.text),
    disagreed: s.history.filter((h) => h.outcome[casal.id] === 'miss').map((h) => h.text),
    reads: membersOf(casal).map((id) => ({ playerId: id, ...(s.reads[id] ?? { hits: 0, tries: 0 }) })),
  };
}

/** Os títulos do fim. Só saem quando têm base, e nenhum deles humilha ninguém (§53). */
function titlesOf(s: PerfectState, ctx: GameCtx): PerfectTitle[] {
  const out: PerfectTitle[] = [];
  const placar = standingsOf(s);
  if (!placar.length) return out;

  const sequencia = [...placar].sort((a, b) => (s.stats[b.coupleId]?.bestStreak ?? 0) - (s.stats[a.coupleId]?.bestStreak ?? 0))[0];
  const melhorSequencia = s.stats[sequencia.coupleId]?.bestStreak ?? 0;
  if (melhorSequencia >= PERFECT_STREAKS.fire) {
    out.push({
      key: melhorSequencia >= PERFECT_STREAKS.total ? 'sintonia' : 'sequencia',
      emoji: melhorSequencia >= PERFECT_STREAKS.total ? '💞' : '🔥',
      title: melhorSequencia >= PERFECT_STREAKS.total ? 'Sintonia total' : 'Maior sequência',
      coupleId: sequencia.coupleId,
      playerId: null,
      detail: `${melhorSequencia} matches seguidos`,
    });
  }

  const leitores = Object.entries(s.reads)
    .filter(([, r]) => r.tries >= 2 && r.hits > 0)
    .sort((a, b) => b[1].hits / b[1].tries - a[1].hits / a[1].tries || b[1].tries - a[1].tries);
  if (leitores.length) {
    const [id, r] = leitores[0];
    out.push({ key: 'leitor', emoji: '🧠', title: 'Leitor de mentes', coupleId: null, playerId: id, detail: `Acertou ${r.hits} de ${r.tries} sobre o par` });
  }

  // Só com pelo menos dois casais, e com jeito: é piada, não boletim.
  const ultimo = placar[placar.length - 1];
  if (placar.length >= 2 && ultimo.rounds > 0 && ultimo.matches < ultimo.rounds) {
    out.push({
      key: 'planetas',
      emoji: '😂',
      title: 'Cada um num planeta',
      coupleId: ultimo.coupleId,
      playerId: null,
      detail: `${ultimo.rounds - ultimo.matches} respostas diferentes — rende história`,
    });
  }

  return out.filter((t) => !t.playerId || ctx.players.some((p) => p.id === t.playerId));
}

export { coupleOf as perfectCoupleOf, standingsOf as perfectStandings };
