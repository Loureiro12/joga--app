import {
  WHOAMI_RULES,
  advanceTurn,
  closeWhoamiRound,
  createWhoamiState,
  currentTurn,
  guessIdentity,
  hintsTaken,
  sanitizeWhoamiSettings,
  someoneSearching,
  startWhoamiRound,
  takeHint,
  whoamiStandings,
  whoamiSummary,
  type WhoamiState,
} from '../games/whoami';
import { EMPTY_WHOAMI_CONTENT, sanitizeGeneratedIdentities } from '../games/whoami-content';
import type { Identity } from '../games/whoami-types';
import { WHOAMI_HINTS } from '../games/whoami-types';
import { RoomError, type GameView, type PlayerId, type VoteProgress } from '../types';

import type { GameCtx, GameRules } from './GameRules';

/**
 * Quem Sou Eu? numa sala: cada um no seu celular.
 *
 * ## A inversão que define este arquivo
 *
 * Em todos os outros jogos deste motor, o segredo é meu e o filtro do snapshot serve para os
 * outros não verem. Aqui é ao contrário: **a minha identidade é a única coisa que eu não posso
 * ver, e todo mundo vê.** O `viewFor` manda as identidades alheias por inteiro e corta só a de
 * quem pediu a foto.
 *
 * Isso é o jogo todo, não um detalhe de privacidade. Um vazamento aqui não dá vantagem a alguém —
 * acaba com a rodada daquele jogador, e ele nem fica sabendo por quê. Por isso tem teste próprio.
 *
 * Também vai cortado: a dica que o jogador **ainda não pagou**. Mandar as três e esconder na tela
 * seria entregar o jogo a quem abrisse o WebSocket.
 *
 * ## O que este jogo pede da sala, e o que não pede
 *
 * As respostas são faladas, então não há votação, não há pergunta no estado e o app não coleta
 * nada por pergunta. O turno é só "de quem é a vez". Dois prazos: o do turno, que passa a vez, e
 * o da rodada, que a encerra.
 */

export type RoomWhoamiState = {
  whoami: WhoamiState | null;
  /** O que o host escolheu, guardado para quando a partida começar. */
  settings: WhoamiState['settings'];
  /** Quantas rodadas a sala pediu. `0` = até o host encerrar. */
  totalRounds: number;
  /**
   * Identidades que ESTA sala já gastou, somando as partidas anteriores.
   *
   * Mesma ideia da bomba: numa sala não há aparelho comum para lembrar, então quem lembra é a
   * sala, enquanto ela existir. Sem isso, "jogar de novo" reencontraria as mesmas identidades.
   */
  seenIds: string[];
  /**
   * Identidades geradas por IA, entregues pelo servidor no LOBBY.
   *
   * O lobby é o tempo morto mais generoso que o app tem: o host cria a sala, manda o código, e as
   * pessoas entram uma por uma. São trinta a noventa segundos em que ninguém está esperando nada,
   * e a geração cabe inteira ali com folga — ao contrário da bomba, onde entre escolher as opções
   * e acender o pavio não há brecha nenhuma.
   *
   * Entra pelo `receiveContent`, que não tem caminho de protocolo: quem entrega é o processo do
   * servidor, nunca um cliente.
   */
  pool?: Identity[];
};

/** Teto da memória da sala. Uma sala não vive tanto; o limite é contra estado que só cresce. */
const MAX_SEEN_NA_SALA = 300;
/** Teto do pool. Uma partida de 8 pessoas × 5 rodadas usa 40; o resto é folga. */
const MAX_POOL = 60;

const jogadoresAtivos = (ctx: GameCtx): PlayerId[] => ctx.players.filter((p) => p.connected).map((p) => p.id);

/** Fecha a rodada e põe a sala na tela de revelação. */
function revelar(s: RoomWhoamiState, ctx: GameCtx): void {
  if (!s.whoami) return;
  closeWhoamiRound(s.whoami);
  ctx.room.phase = 'revealing';
  sincronizarPlacar(s, ctx);
}

/** Espelha no placar da sala o que o jogo apurou. */
function sincronizarPlacar(s: RoomWhoamiState, ctx: GameCtx): void {
  if (!s.whoami) return;
  for (const linha of whoamiStandings(s.whoami)) {
    const antes = ctx.scores[linha.playerId] ?? { playerId: linha.playerId, points: 0, lastDelta: 0 };
    ctx.scores[linha.playerId] = { playerId: linha.playerId, points: linha.points, lastDelta: linha.points - antes.points };
  }
}

/** A rodada acabou? Pode ser por acerto de todos, por prazo, ou porque não sobrou ninguém. */
function fecharSePrecisa(s: RoomWhoamiState, ctx: GameCtx): boolean {
  const w = s.whoami;
  if (!w || ctx.room.phase !== 'guessing') return false;
  if (!someoneSearching(w)) {
    revelar(s, ctx);
    return true;
  }
  return false;
}

export const whoamiGame: GameRules<RoomWhoamiState> = {
  id: 'whoami',
  minPlayers: WHOAMI_RULES.minPlayers,
  recommendedPlayers: WHOAMI_RULES.recommendedPlayers,
  maxPlayers: WHOAMI_RULES.maxPlayers,
  hostCommands: new Set(['startMatch', 'nextRound', 'endRound', 'endMatch', 'playAgain']),

  initial(input) {
    return {
      whoami: null,
      settings: sanitizeWhoamiSettings({ ...input.settings, categories: input.category && input.category !== 'Aleatório' ? [input.category] : (input.settings?.categories as string[]) }),
      totalRounds: Math.max(0, Math.min(10, Math.floor(input.totalRounds) || 0)),
      seenIds: [],
      pool: [],
    };
  },

  hydrate(state) {
    return {
      whoami: state.whoami ?? null,
      settings: sanitizeWhoamiSettings(state.settings),
      totalRounds: Math.max(0, Math.min(10, Math.floor(state.totalRounds) || 0)),
      seenIds: Array.isArray(state.seenIds) ? state.seenIds.filter((id): id is string => typeof id === 'string') : [],
      // Passa pela portaria de novo ao restaurar: estado em disco é entrada, como qualquer outra.
      pool: sanitizeGeneratedIdentities(state.pool ?? []),
    };
  },

  startMatch(s, ctx) {
    const pool = s.pool ?? [];
    const content = s.seenIds.length || pool.length ? { identities: pool, seenIds: s.seenIds } : EMPTY_WHOAMI_CONTENT;
    s.whoami = createWhoamiState(s.settings, content);
    startWhoamiRound(s.whoami, jogadoresAtivos(ctx), ctx.now, ctx.rng);
    ctx.room.phase = 'guessing';
    ctx.room.roundIndex = 1;
    ctx.room.paused = false;
  },

  dispatch(s, ctx, playerId, command) {
    const w = s.whoami;
    if (!w) throw new RoomError('invalid_phase');

    switch (command.type) {
      case 'guessIdentity': {
        if (ctx.room.phase !== 'guessing') throw new RoomError('invalid_phase');
        // Só quem está na vez chuta. Sem isto, quem já sabe dispara no turno alheio e rouba o bônus.
        if (currentTurn(w) !== playerId) throw new RoomError('bad_request');
        const chute = command.guess.trim();
        if (!chute || chute.length > 60) throw new RoomError('bad_request');
        guessIdentity(w, playerId, chute, ctx.now);
        fecharSePrecisa(s, ctx);
        sincronizarPlacar(s, ctx);
        return;
      }

      case 'takeHint': {
        if (ctx.room.phase !== 'guessing') throw new RoomError('invalid_phase');
        if (!w.settings.hints) throw new RoomError('bad_request');
        // Dica é só da própria vez: fora dela, o jogador juntaria as três de graça enquanto espera.
        if (currentTurn(w) !== playerId) throw new RoomError('bad_request');
        if (takeHint(w, playerId) === null) throw new RoomError('bad_request');
        return;
      }

      case 'passTurn': {
        if (ctx.room.phase !== 'guessing') throw new RoomError('invalid_phase');
        if (currentTurn(w) !== playerId) throw new RoomError('bad_request');
        advanceTurn(w, ctx.now);
        return;
      }

      case 'endRound': {
        // §26: o host pode encerrar a rodada. Serve para problema técnico e para grupo que cansou.
        if (ctx.room.phase !== 'guessing') throw new RoomError('invalid_phase');
        revelar(s, ctx);
        return;
      }

      case 'nextRound': {
        if (ctx.room.phase !== 'revealing') throw new RoomError('invalid_phase');
        if (s.totalRounds > 0 && w.roundsPlayed >= s.totalRounds) {
          ctx.room.phase = 'finished';
          return;
        }
        startWhoamiRound(w, jogadoresAtivos(ctx), ctx.now, ctx.rng);
        ctx.room.phase = 'guessing';
        ctx.room.roundIndex = w.roundsPlayed;
        return;
      }

      case 'endMatch': {
        if (ctx.room.phase === 'guessing') closeWhoamiRound(w);
        ctx.room.phase = 'finished';
        sincronizarPlacar(s, ctx);
        return;
      }

      case 'setPaused': {
        // Pausar pararia os dois prazos no meio de um turno de alguém. A rodada é curta: quem
        // precisa parar usa "encerrar rodada".
        throw new RoomError('bad_request');
      }

      default:
        throw new RoomError('bad_request');
    }
  },

  step(s, ctx) {
    const w = s.whoami;
    if (!w || ctx.room.phase !== 'guessing') return false;

    // O prazo da rodada vem primeiro: não faz sentido passar a vez numa rodada que já acabou.
    if (w.roundEndsAt !== null && w.roundEndsAt <= ctx.now) {
      revelar(s, ctx);
      return true;
    }
    if (w.turnEndsAt !== null && w.turnEndsAt <= ctx.now) {
      // §14: quem não perguntou no tempo perde a vez, sem penalidade — o tempo já é a punição.
      advanceTurn(w, ctx.now);
      if (w.turnEndsAt !== null && w.turnEndsAt <= ctx.now) w.turnEndsAt = ctx.now + w.settings.turnSeconds * 1000;
      fecharSePrecisa(s, ctx);
      return true;
    }
    return false;
  },

  recheck(s, ctx) {
    // Se a vez é de alguém que caiu, a rodada travaria até o prazo do turno vencer — e numa
    // partida sem limite de tempo, travaria para sempre.
    const w = s.whoami;
    if (!w || ctx.room.phase !== 'guessing') return;
    const daVez = currentTurn(w);
    if (daVez && !ctx.players.some((p) => p.id === daVez && p.connected)) {
      advanceTurn(w, ctx.now);
      fecharSePrecisa(s, ctx);
    }
  },

  playerRemoved(s, ctx, playerId) {
    const w = s.whoami;
    if (!w) return;
    // A identidade de quem saiu sai com ele: ela não é mais segredo de ninguém, e deixá-la na
    // ordem faria a rodada esperar uma vez que nunca vem.
    const saiuDaVez = currentTurn(w) === playerId;
    w.order = w.order.filter((id) => id !== playerId);
    delete w.round[playerId];
    delete w.assigned[playerId];
    w.foundOrder = w.foundOrder.filter((id) => id !== playerId);
    if (w.turnIndex >= w.order.length) w.turnIndex = 0;
    if (saiuDaVez) advanceTurn(w, ctx.now);
    if (ctx.room.phase === 'guessing' && !w.order.length) {
      revelar(s, ctx);
      return;
    }
    fecharSePrecisa(s, ctx);
  },

  /**
   * Identidades geradas chegando do servidor.
   *
   * Passa pela portaria do motor (`sanitizeGeneratedIdentities`) mesmo já tendo passado no
   * servidor. Não é desconfiança: é a mesma razão de o motor ser puro — a regra de conteúdo é
   * uma só, e quem decide o que a mesa vê é quem monta a rodada.
   *
   * Só vale no lobby. Trocar o baralho com a partida andando mudaria o sorteio debaixo de uma
   * rodada já distribuída.
   */
  receiveContent(s, content) {
    if (s.whoami) return false;
    const novas = sanitizeGeneratedIdentities(content);
    if (!novas.length) return false;
    const existentes = new Set((s.pool ?? []).map((i) => i.id));
    const entram = novas.filter((i) => !existentes.has(i.id) && !s.seenIds.includes(i.id));
    if (!entram.length) return false;
    s.pool = [...(s.pool ?? []), ...entram].slice(-MAX_POOL);
    return true;
  },

  reset(s) {
    // "Jogar de novo": a partida vai embora, a memória do que ela gastou fica.
    if (s.whoami) {
      const gastas = s.whoami.usedIdentityIds;
      s.seenIds = [...s.seenIds.filter((id) => !gastas.includes(id)), ...gastas].slice(-MAX_SEEN_NA_SALA);
    }
    s.whoami = null;
  },

  deadlines(s, ctx) {
    const w = s.whoami;
    if (!w || ctx.room.phase !== 'guessing') return [];
    return [...(w.turnEndsAt === null ? [] : [w.turnEndsAt]), ...(w.roundEndsAt === null ? [] : [w.roundEndsAt])];
  },

  viewFor(s, ctx, playerId): GameView {
    const w = s.whoami;
    if (!w) {
      return {
        kind: 'whoami',
        settings: s.settings,
        totalRounds: s.totalRounds || null,
        roundIndex: 0,
        visibleIdentities: [],
        mine: null,
        turnId: null,
        turnEndsAt: null,
        roundEndsAt: null,
        found: [],
        reveal: null,
        summary: null,
      };
    }

    const acabou = ctx.room.phase === 'finished';
    const revelando = ctx.room.phase === 'revealing' || acabou;
    const meu = w.round[playerId];

    return {
      kind: 'whoami',
      settings: w.settings,
      totalRounds: s.totalRounds || null,
      roundIndex: w.roundsPlayed,

      // O coração do jogo: a identidade dos OUTROS, por inteiro.
      visibleIdentities: w.order
        .filter((id) => id !== playerId)
        .map((id) => ({
          playerId: id,
          name: w.assigned[id]?.name ?? '',
          emoji: w.assigned[id]?.emoji ?? '',
          category: w.assigned[id]?.category ?? '',
          found: w.round[id]?.foundAt !== null && w.round[id] !== undefined,
        })),

      /**
       * A minha parte, SEM o nome da minha identidade.
       *
       * Só as dicas que eu já paguei entram — as outras ficam no servidor. E `name` aparece
       * apenas quando a rodada terminou, aí para todo mundo ao mesmo tempo.
       */
      mine: meu
        ? {
            secret: !revelando && meu.foundAt === null,
            name: revelando || meu.foundAt !== null ? (w.assigned[playerId]?.name ?? null) : null,
            emoji: revelando || meu.foundAt !== null ? (w.assigned[playerId]?.emoji ?? null) : null,
            hints: hintsTaken(w, playerId),
            hintsLeft: w.settings.hints ? Math.max(0, WHOAMI_HINTS - meu.hintsUsed) : 0,
            misses: meu.misses,
            found: meu.foundAt !== null,
          }
        : null,

      turnId: ctx.room.phase === 'guessing' ? currentTurn(w) : null,
      turnEndsAt: ctx.room.phase === 'guessing' ? w.turnEndsAt : null,
      roundEndsAt: ctx.room.phase === 'guessing' ? w.roundEndsAt : null,
      found: w.foundOrder,
      reveal: revelando ? w.reveal : null,
      summary: acabou ? whoamiSummary(w) : null,
    };
  },

  voteProgress(): VoteProgress | null {
    // Não há votação: as respostas são faladas, na mesa.
    return null;
  },

  recordExtras(s) {
    const w = s.whoami;
    if (!w) return { impostorsCaught: 0, perPlayer: {} };
    // `impostorsCaught` nasceu do Impostor e continua no boletim; aqui o número que mais se parece
    // com "acertos do grupo" é quantas identidades foram descobertas.
    const descobertas = Object.values(w.totals).reduce((soma, t) => soma + t.found, 0);
    return { impostorsCaught: descobertas, perPlayer: {} };
  },
};
