import {
  BOMB_RULES,
  activePlayers,
  armBomb,
  bombTick,
  createBombMatch,
  endMatch as endBombMatch,
  highlights,
  nextRound,
  passBomb,
  sanitizeBombSettings,
  standings,
  useLetter,
} from '../games/bomb';
import type { BombHighlight, BombPhase, BombStanding, BombState } from '../games/bomb-types';
import { RoomError, type GameView, type PlayerId, type VoteProgress } from '../types';

import type { GameCtx, GameRules } from './GameRules';

/**
 * A Bomba-Relógio numa sala: cada um no seu celular, e a bomba é virtual.
 *
 * O jogo continua sendo o mesmo de `bomb.ts` — este arquivo **não tem regra de bomba nenhuma**.
 * Ele só faz três coisas: traduzir os jogadores da sala para o motor, dar ao servidor os prazos
 * do pavio, e **cortar do snapshot tudo que denunciaria quando ela vai estourar**.
 *
 * Esse corte é a razão de o jogo poder existir em rede. Com um celular só, `explodeAt` ficava na
 * memória do aparelho e ninguém olhava. Em sala ele trafega — e quem abrisse o WebSocket saberia
 * o segundo exato da explosão, que é a única coisa que o jogo inteiro depende de esconder.
 */

export type RoomBombState = {
  /** O estado do motor local, inteiro. É ele que manda; aqui ninguém reimplementa regra. */
  bomb: BombState | null;
  /** O que o host escolheu, guardado para quando a partida começar. */
  settings: BombState['settings'];
};

/** As fases do motor que viram fase de sala. */
const ROOM_PHASE: Record<BombPhase, 'handoff' | 'armed' | 'revealing' | 'finished'> = {
  handoff: 'handoff',
  armed: 'armed',
  exploded: 'revealing',
  disarmed: 'revealing',
  finished: 'finished',
};

export const bombGame: GameRules<RoomBombState> = {
  id: 'bomb',
  // Dois já jogam: um passa para o outro. Abaixo disso não existe "passar".
  minPlayers: 2,
  recommendedPlayers: 4,
  maxPlayers: 12,
  hostCommands: new Set(['startMatch', 'nextRound', 'endMatch', 'playAgain']),

  initial(input) {
    // Quantas rodadas é campo DA SALA, como em todos os outros jogos — e não das opções da bomba,
    // que tem um `totalRounds` próprio herdado da versão de um celular. Duas fontes para a mesma
    // coisa significaria a tela dizendo "rodada 2 de 2" e a partida seguindo até a décima.
    return { bomb: null, settings: sanitizeBombSettings({ ...input.settings, totalRounds: input.totalRounds }) };
  },

  hydrate(state) {
    return { bomb: state.bomb ?? null, settings: sanitizeBombSettings(state.settings) };
  },

  startMatch(s, ctx) {
    const jogadores = ctx.players.filter((p) => p.connected).map((p) => ({ id: p.id, name: p.name, color: p.color }));
    s.bomb = createBombMatch(jogadores, s.settings, ctx.now, ctx.rng);
    sincronizar(s, ctx);
  },

  dispatch(s, ctx, playerId, command) {
    const bomb = s.bomb;
    if (!bomb) throw new RoomError('invalid_phase');

    switch (command.type) {
      case 'armBomb': {
        // Só quem está com a bomba acende o próprio pavio. É a mesma regra do "estou pronto"
        // do celular único, e sem ela qualquer um poderia acender a bomba na mão do outro.
        if (bomb.phase !== 'handoff') throw new RoomError('invalid_phase');
        if (playerId !== bomb.activeId) throw new RoomError('bad_request');
        s.bomb = armBomb(bomb, ctx.now, ctx.rng);
        return sincronizar(s, ctx);
      }

      case 'passBomb': {
        if (bomb.phase !== 'armed') throw new RoomError('invalid_phase');
        if (playerId !== bomb.activeId) throw new RoomError('bad_request');
        s.bomb = passBomb(bomb, ctx.now, ctx.rng);
        return sincronizar(s, ctx);
      }

      case 'useLetter': {
        if (bomb.phase !== 'armed') throw new RoomError('invalid_phase');
        if (playerId !== bomb.activeId) throw new RoomError('bad_request');
        // Toque inválido (letra fora do tema, já usada) o motor devolve igual, em silêncio:
        // no meio da pressa, punir quem errou o dedo seria injusto.
        s.bomb = useLetter(bomb, command.letter, ctx.now, ctx.rng);
        return sincronizar(s, ctx);
      }

      case 'nextRound': {
        if (bomb.phase !== 'exploded' && bomb.phase !== 'disarmed') throw new RoomError('invalid_phase');
        s.bomb = nextRound(bomb, ctx.rng);
        return sincronizar(s, ctx);
      }

      case 'endMatch': {
        s.bomb = endBombMatch(bomb);
        return sincronizar(s, ctx);
      }

      case 'setPaused': {
        // A bomba não pausa: o pavio é um instante absoluto, e parar o relógio daria a quem está
        // com ela o poder de fugir da explosão.
        throw new RoomError('bad_request');
      }

      default:
        throw new RoomError('bad_request');
    }
  },

  step(s, ctx) {
    const bomb = s.bomb;
    if (!bomb || bomb.phase !== 'armed') return false;
    const depois = bombTick(bomb, ctx.now);
    if (depois === bomb) return false;
    s.bomb = depois;
    sincronizar(s, ctx);
    return true;
  },

  recheck() {
    // Nada a reavaliar por presença: a bomba não espera ninguém responder.
  },

  playerRemoved(s, ctx, playerId) {
    const bomb = s.bomb;
    if (!bomb) return;
    const restantes = bomb.players.filter((p) => p.id !== playerId);
    // Saiu com a bomba na mão: ela passa adiante em vez de explodir com quem nem está mais aqui.
    const activeId = bomb.activeId === playerId ? (restantes[0]?.id ?? '') : bomb.activeId;
    s.bomb = {
      ...bomb,
      players: restantes,
      activeId,
      eliminated: bomb.eliminated.filter((id) => id !== playerId),
      loserId: bomb.loserId === playerId ? null : bomb.loserId,
    };
    sincronizar(s, ctx);
  },

  reset(s) {
    s.bomb = null;
  },

  deadlines(s) {
    const bomb = s.bomb;
    if (!bomb || bomb.phase !== 'armed') return [];
    // O pavio e os sustos. É por aqui que o servidor sabe quando acordar — e é a única cópia
    // desses instantes que sai deste arquivo.
    return [...(bomb.explodeAt === null ? [] : [bomb.explodeAt]), ...bomb.pendingAlarms];
  },

  viewFor(s, ctx): GameView {
    const bomb = s.bomb;
    if (!bomb) {
      return {
        kind: 'bomb',
        variant: s.settings.variant,
        mode: s.settings.mode,
        phase: 'handoff',
        roundIndex: 0,
        totalRounds: s.settings.totalRounds || null,
        challenge: null,
        alphabet: null,
        activeId: '',
        alarmCount: 0,
        loserId: null,
        lives: {},
        bombs: {},
        eliminated: [],
        standings: null,
        highlights: null,
      };
    }

    const acabou = bomb.phase === 'finished';
    return {
      kind: 'bomb',
      variant: bomb.settings.variant,
      mode: bomb.settings.mode,
      phase: bomb.phase,
      roundIndex: bomb.roundIndex,
      totalRounds: bomb.settings.totalRounds || null,
      challenge: bomb.challenge ? { text: bomb.challenge.text, category: bomb.challenge.category } : null,
      // `used` perde o tempo de cada letra: somado, ele diria há quanto tempo o pavio queima.
      alphabet: bomb.alphabet
        ? {
            themeId: bomb.alphabet.themeId,
            name: bomb.alphabet.name,
            emoji: bomb.alphabet.emoji,
            letters: bomb.alphabet.letters,
            used: bomb.alphabet.used.map((u) => ({ letter: u.letter, playerId: u.playerId })),
          }
        : null,
      activeId: bomb.activeId,
      /** Sobe a cada susto. É público: o susto é para todo mundo ouvir. */
      alarmCount: bomb.alarmCount,
      loserId: bomb.loserId,
      lives: bomb.settings.mode === 'eliminacao' ? bomb.lives : {},
      bombs: bomb.bombs,
      eliminated: bomb.eliminated,
      standings: acabou ? standings(bomb) : null,
      highlights: acabou ? highlights(bomb) : null,
    };
  },

  voteProgress(): VoteProgress | null {
    // Não há votação em nenhum momento: a bomba é de um por vez.
    return null;
  },

  recordExtras() {
    return { impostorsCaught: 0, perPlayer: {} };
  },
};

/**
 * Espelha no `Room` o que o motor da bomba decidiu, e mantém o placar da sala em dia.
 *
 * Toda mudança de fase passa por aqui — é o único ponto de tradução entre os dois mundos.
 */
function sincronizar(s: RoomBombState, ctx: GameCtx): void {
  const bomb = s.bomb;
  if (!bomb) return;
  ctx.room.phase = ROOM_PHASE[bomb.phase];
  ctx.room.roundIndex = bomb.roundIndex;
  // A bomba não usa pausa; garantir isso aqui evita que uma pausa herdada trave a tela.
  ctx.room.paused = false;

  // Placar da sala: no modo pontos é o do jogo; nos outros, menos bombas é melhor, então o
  // placar guarda o negativo — é o que faz o ranking da sala ordenar na direção certa.
  for (const p of bomb.players) {
    const pontos = bomb.settings.mode === 'pontos' ? (bomb.points[p.id] ?? 0) : -(bomb.bombs[p.id] ?? 0) * BOMB_RULES.points.survive;
    const antes = ctx.scores[p.id] ?? { playerId: p.id, points: 0, lastDelta: 0 };
    ctx.scores[p.id] = { playerId: p.id, points: pontos, lastDelta: pontos - antes.points };
  }
}

export { activePlayers as bombActivePlayers };
export type { BombHighlight, BombStanding };
