/**
 * A rota de cada fase. Mora num módulo puro (`matchRoute.ts`) justamente para caber aqui: o
 * navegador de verdade importa o expo-router, que não roda em Node.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RoomPhase, RoomSnapshot } from '@jogae/engine';

import { routeForSnapshot } from '../src/features/match/matchRoute';

type Kind = RoomSnapshot['game']['kind'];

/** Um snapshot com o mínimo que a decisão de rota olha: fase, rodada e qual jogo. */
const snap = (phase: RoomPhase, kind: Kind, roundIndex = 1): RoomSnapshot =>
  ({
    room: { code: '4827', hostId: 'ana', gameId: kind, category: '', totalRounds: 3, maxPlayers: 8, phase, roundIndex, paused: false },
    players: [],
    meId: 'ana',
    votes: null,
    scores: [],
    game: { kind } as RoomSnapshot['game'],
  }) as RoomSnapshot;

const JOGOS: Kind[] = ['impostor', 'likely', 'secret', 'perfect', 'bomb'];

test('toda fase tem uma rota, em todos os jogos', () => {
  const fases: RoomPhase[] = [
    'lobby',
    'role_reveal',
    'clues',
    'question',
    'voting',
    'revealing',
    'briefing',
    'mission',
    'verdict',
    'pairing',
    'answering',
    'handoff',
    'armed',
    'finished',
    'closed',
  ];
  for (const kind of JOGOS) {
    for (const fase of fases) {
      const rota = routeForSnapshot(snap(fase, kind));
      assert.ok(typeof rota === 'string' && rota.startsWith('/'), `${kind} na fase "${fase}" ficou sem rota — a tela trava onde está`);
    }
  }
});

/**
 * O "jogar novamente" dos jogos de sala não navega sozinho: ele só manda o comando, e quem leva
 * todo mundo de volta ao lobby é a mudança de rota. Se o fim e o lobby caíssem na mesma tela, o
 * botão pareceria morto — foi exatamente o que aconteceu na versão local da bomba.
 */
test('jogar novamente: a rota do fim é diferente da do lobby em todos os jogos', () => {
  for (const kind of JOGOS) {
    const fim = routeForSnapshot(snap('finished', kind, 3));
    const lobby = routeForSnapshot(snap('lobby', kind, 0));
    assert.notEqual(fim, lobby, `em ${kind} o fim e o lobby são a mesma tela: "jogar novamente" não sairia do lugar`);
  }
});

test('cada jogo tem a própria tela de fim — o resumo é diferente em cada um', () => {
  const fins = JOGOS.map((kind) => routeForSnapshot(snap('finished', kind)));
  assert.equal(new Set(fins).size, JOGOS.length, `dois jogos dividem a tela de fim: ${fins.join(', ')}`);
});

test('a sala fechada leva todo mundo para a mesma tela, venha de onde vier', () => {
  for (const kind of JOGOS) assert.equal(routeForSnapshot(snap('closed', kind)), routeForSnapshot(snap('closed', 'impostor')));
});
