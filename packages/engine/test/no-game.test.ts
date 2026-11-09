import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RoomEngine, RoomError, type CreateRoomInput, type GameView, type PlayerId } from '../src/index';

/**
 * A sala que nasce sem jogo.
 *
 * O grupo se reúne primeiro e decide depois — é como as coisas acontecem numa mesa de verdade.
 * A alternativa seria a sala nascer com um jogo qualquer e a tela mentir até alguém trocar.
 */

const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

const vazia = (): CreateRoomInput => ({ gameId: 'none', category: '', totalRounds: 0, maxPlayers: 8 });

function sala(nomes: string[] = ['ana', 'bia', 'caio'], input: CreateRoomInput = vazia()) {
  const [host, ...guests] = nomes;
  const engine = RoomEngine.create('4827', input, { id: host, name: host, color: '#7C3AED' }, { rng: seeded(7) });
  for (const g of guests) engine.join({ id: g, name: g, color: '#FACC15' });
  const view = (id: PlayerId) => engine.snapshotFor(id).game as GameView;
  return { engine, view, host, all: nomes };
}

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RoomError, `esperava RoomError, veio ${e}`);
    return e.code;
  }
  assert.fail('deveria ter lançado');
};

const impostor = (): CreateRoomInput => ({ gameId: 'impostor', category: 'Comidas', totalRounds: 3, maxPlayers: 8 });

test('a sala existe antes de o jogo existir, e todo mundo vê isso', () => {
  const r = sala();
  assert.equal(r.engine.phase, 'lobby');
  for (const id of r.all) assert.equal(r.view(id).kind, 'none', `${id} não viu a sala sem jogo`);
  // A sala é de verdade: tem código e gente dentro, só não tem o que jogar ainda.
  assert.equal(r.engine.snapshotFor(r.host).players.length, 3);
});

test('sala sem jogo não começa, e o erro não é genérico', () => {
  const r = sala();
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'startMatch' })), 'bad_request');
  assert.equal(r.engine.phase, 'lobby', 'a sala saiu do lobby sem ter jogo');
});

test('escolher o jogo troca as regras da sala inteira', () => {
  const r = sala();
  r.engine.dispatch(r.host, { type: 'setGame', input: impostor() });

  const snap = r.engine.snapshotFor(r.host);
  assert.equal(snap.room.gameId, 'impostor');
  assert.equal(snap.room.category, 'Comidas');
  assert.equal(snap.room.totalRounds, 3);
  // E agora é o motor do jogo que responde, não mais o vazio.
  for (const id of r.all) assert.equal(r.view(id).kind, 'impostor', `${id} continuou vendo a sala sem jogo`);

  // Com jogo, a sala começa.
  r.engine.dispatch(r.host, { type: 'startMatch' });
  assert.equal(r.engine.phase, 'role_reveal');
});

test('trocar de jogo descarta o estado do anterior', () => {
  const r = sala();
  r.engine.dispatch(r.host, { type: 'setGame', input: impostor() });
  r.engine.dispatch(r.host, { type: 'setGame', input: { gameId: 'likely', category: 'Aleatório', totalRounds: 0, maxPlayers: 8 } });

  const v = r.view(r.host);
  assert.equal(v.kind, 'likely');
  // Nada do Impostor sobrou: uma rodada herdada apareceria como pergunta fantasma.
  assert.ok(!JSON.stringify(r.engine.serialize().game).includes('ackedIds'));
  assert.equal(r.engine.snapshotFor(r.host).room.gameId, 'likely');
});

test('só o host escolhe, e só no lobby', () => {
  const r = sala();
  assert.equal(code(() => r.engine.dispatch('bia', { type: 'setGame', input: impostor() })), 'not_host');

  r.engine.dispatch(r.host, { type: 'setGame', input: impostor() });
  r.engine.dispatch(r.host, { type: 'startMatch' });
  // Com a partida andando, trocar jogaria fora o que o grupo já jogou.
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'setGame', input: impostor() })), 'invalid_phase');
});

test('não dá para escolher "nenhum jogo" como se fosse um jogo', () => {
  const r = sala(['ana', 'bia', 'caio'], impostor());
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'setGame', input: vazia() })), 'bad_request');
  assert.equal(r.engine.snapshotFor(r.host).room.gameId, 'impostor', 'a sala perdeu o jogo que tinha');
});

test('sala sem jogo não aceita comando de jogo nenhum', () => {
  const r = sala();
  for (const cmd of [{ type: 'ackRole' }, { type: 'castVote', targetId: 'bia' }, { type: 'passBomb' }] as const) {
    assert.equal(code(() => r.engine.dispatch(r.host, cmd)), 'invalid_phase', `"${cmd.type}" passou numa sala sem jogo`);
  }
});

test('jogar de novo volta ao lobby mantendo o jogo escolhido', () => {
  // "Quem é Mais Provável" porque ele encerra a qualquer momento; o Impostor só acaba nas rodadas.
  const r = sala(['ana', 'bia', 'caio'], { gameId: 'likely', category: 'Aleatório', totalRounds: 0, maxPlayers: 8 });
  r.engine.dispatch(r.host, { type: 'startMatch' });
  r.engine.dispatch(r.host, { type: 'endMatch' });
  r.engine.dispatch(r.host, { type: 'playAgain' });

  assert.equal(r.engine.phase, 'lobby');
  // Quem já escolheu não precisa escolher de novo.
  assert.equal(r.view(r.host).kind, 'likely');
});
