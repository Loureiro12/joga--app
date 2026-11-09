import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_CONTENT_COUNT, type BombContentRequest } from '@jogae/engine';

import type { ContentGenerator } from '../src/content/bombContent';
import { roomWith, sleep, startServer } from './helpers';

/**
 * O endpoint que gera conteúdo da Bomba-Relógio.
 *
 * O que se protege aqui não é a qualidade das cartas (isso é da portaria, no motor) — é a
 * **carteira**. Cada chamada bem-sucedida custa dinheiro de verdade na API da Anthropic, então
 * quem não está autenticado não gera, e quem está não gera sem limite.
 *
 * O gerador é injetado nos testes: nenhuma chamada de API sai daqui.
 */

/** Gerador de mentira: registra o que foi pedido e devolve o que mandarem. */
function spyGenerator(resposta: Awaited<ReturnType<ContentGenerator['generate']>> = { challenges: [], themes: [] }) {
  const pedidos: BombContentRequest[] = [];
  const generator: ContentGenerator = {
    async generate(request) {
      pedidos.push(request);
      return resposta;
    },
  };
  return { generator, pedidos };
}

const post = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/bomb/content`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const comToken = { authorization: 'Bearer dev:ana' };
const pedidoValido = { variant: 'classico', categories: ['Comida'], difficulties: ['facil'], count: 8, avoidTexts: [] };

test('sem token não gera: cada chamada custa dinheiro', async () => {
  const { generator, pedidos } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    const res = await post(server.base, pedidoValido);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'unauthenticated' });
    assert.equal(pedidos.length, 0, 'o gerador foi chamado sem autenticação');
  } finally {
    await server.close();
  }
});

test('token inválido também não gera', async () => {
  const { generator, pedidos } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    const res = await post(server.base, pedidoValido, { authorization: 'Bearer nao-sou-token' });
    assert.equal(res.status, 401);
    assert.equal(pedidos.length, 0);
  } finally {
    await server.close();
  }
});

test('com token, o pedido chega saneado ao gerador', async () => {
  const { generator, pedidos } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    const res = await post(
      server.base,
      { variant: 'classico', categories: ['Comida', 'Inventada'], difficulties: ['facil', 'impossivel'], count: 9_999, avoidTexts: ['Diga uma cor.', 42] },
      comToken,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { challenges: [], themes: [] });

    assert.equal(pedidos.length, 1);
    // O que chega da rede não chega cru: categoria inventada, dificuldade inventada e um `count`
    // absurdo são coisas que o gerador nunca vê.
    assert.deepEqual(pedidos[0].categories, ['Comida']);
    assert.deepEqual(pedidos[0].difficulties, ['facil']);
    assert.equal(pedidos[0].count, MAX_CONTENT_COUNT);
    assert.deepEqual(pedidos[0].avoidTexts, ['Diga uma cor.']);
  } finally {
    await server.close();
  }
});

test('as categorias do Alfabeto são outras, e o sanitizador sabe disso', async () => {
  const { generator, pedidos } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    // 'Comida' existe nas duas variantes; 'Games' só no clássico; 'Natureza' só no Alfabeto.
    await post(server.base, { variant: 'alfabeto', categories: ['Natureza', 'Games'], count: 4 }, comToken);
    assert.deepEqual(pedidos[0].categories, ['Natureza'], 'passou categoria que não é do Alfabeto');
    assert.equal(pedidos[0].variant, 'alfabeto');
  } finally {
    await server.close();
  }
});

test('corpo que não é JSON, ou pedido sem variante, para antes do gerador', async () => {
  const { generator, pedidos } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    assert.equal((await post(server.base, '{isso nao e json', comToken)).status, 400);
    assert.equal((await post(server.base, { count: 8 }, comToken)).status, 400);
    assert.equal((await post(server.base, { variant: 'xadrez' }, comToken)).status, 400);
    assert.equal(pedidos.length, 0);
  } finally {
    await server.close();
  }
});

test('corpo gigante é cortado antes de virar JSON', async () => {
  const { generator } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    const res = await post(server.base, { variant: 'classico', avoidTexts: [...'x'.repeat(1)].concat(Array.from({ length: 5_000 }, () => 'a'.repeat(100))) }, comToken);
    assert.equal(res.status, 413);
  } finally {
    await server.close();
  }
});

test('o limite por usuário existe, e é de carteira: 6 por 10 minutos', async () => {
  const { generator, pedidos } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    const status: number[] = [];
    for (let i = 0; i < 8; i++) status.push((await post(server.base, pedidoValido, comToken)).status);
    assert.deepEqual(status, [200, 200, 200, 200, 200, 200, 429, 429], `sequência de status: ${status.join(',')}`);
    assert.equal(pedidos.length, 6, 'o gerador foi chamado além do limite');

    // O limite é por usuário, não global: outra pessoa jogando ao mesmo tempo não é punida.
    const outra = await post(server.base, pedidoValido, { authorization: 'Bearer dev:bia' });
    assert.equal(outra.status, 200);
  } finally {
    await server.close();
  }
});

test('sem chave de API configurada, o endpoint diz que não tem — e o app segue com o banco local', async () => {
  // É o estado normal em dev, e o estado de sempre se a chave sair do ar. Não é erro de jogo:
  // quem recebe isto simplesmente joga com as 180 cartas que já estão no app.
  const server = await startServer({}, { contentGenerator: null });
  try {
    const res = await post(server.base, pedidoValido, comToken);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'content_unavailable' });
  } finally {
    await server.close();
  }
});

test('o endpoint não responde a GET nem em outro caminho', async () => {
  const { generator } = spyGenerator();
  const server = await startServer({}, { contentGenerator: generator });
  try {
    assert.equal((await fetch(`${server.base}/api/bomb/content`)).status, 404);
    assert.equal((await post(server.base, pedidoValido, comToken.authorization ? comToken : {})).status, 200);
  } finally {
    await server.close();
  }
});

test('o que o gerador devolve atravessa inteiro até o app', async () => {
  const carta = { id: 'ia-d-abc', category: 'Comida', difficulty: 'facil' as const, pool: 'alto' as const, text: 'Diga algo que combina com queijo.' };
  const { generator } = spyGenerator({ challenges: [carta], themes: [] });
  const server = await startServer({}, { contentGenerator: generator });
  try {
    const res = await post(server.base, pedidoValido, comToken);
    assert.deepEqual(await res.json(), { challenges: [carta], themes: [] });
  } finally {
    await server.close();
  }
});

/* ──────────────────── identidades do "Quem Sou Eu?" ──────────────────── */

import type { IdentityGenerator } from '../src/content/whoamiContent';

function spyIdentities(identities: Awaited<ReturnType<IdentityGenerator['generate']>>['identities'] = []) {
  const pedidos: Parameters<IdentityGenerator['generate']>[0][] = [];
  const generator: IdentityGenerator = {
    async generate(request) {
      pedidos.push(request);
      return { identities };
    },
  };
  return { generator, pedidos };
}

const postIdentidade = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/whoami/content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('identidades: sem token não gera', async () => {
  const { generator, pedidos } = spyIdentities();
  const server = await startServer({}, { identityGenerator: generator });
  try {
    assert.equal((await postIdentidade(server.base, { count: 8 })).status, 401);
    assert.equal(pedidos.length, 0, 'o gerador foi chamado sem autenticação');
  } finally {
    await server.close();
  }
});

test('identidades: o pedido chega saneado ao gerador', async () => {
  const { generator, pedidos } = spyIdentities();
  const server = await startServer({}, { identityGenerator: generator });
  try {
    const res = await postIdentidade(
      server.base,
      { categories: ['Animais', 'Inventada'], difficulties: ['facil', 'impossivel'], count: 9_999, avoidNames: ['Leão', 42] },
      comToken,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { identities: [] });
    assert.deepEqual(pedidos[0].categories, ['Animais']);
    assert.deepEqual(pedidos[0].difficulties, ['facil']);
    assert.deepEqual(pedidos[0].avoidNames, ['Leão']);
    assert.ok(pedidos[0].count <= 30);
  } finally {
    await server.close();
  }
});

test('identidades: corpo que não é JSON para antes do gerador', async () => {
  const { generator, pedidos } = spyIdentities();
  const server = await startServer({}, { identityGenerator: generator });
  try {
    assert.equal((await postIdentidade(server.base, '{isso nao e json', comToken)).status, 400);
    assert.equal(pedidos.length, 0);
  } finally {
    await server.close();
  }
});

test('identidades: corpo literalmente `null` é recusado, e a requisição responde', async () => {
  // `null` é JSON válido. Se o caminho comum usasse `null` como sinal de "erro já respondido", a
  // requisição ficaria pendurada para sempre — sem status, sem corpo, sem log.
  const { generator, pedidos } = spyIdentities();
  const server = await startServer({}, { identityGenerator: generator });
  try {
    const res = await postIdentidade(server.base, 'null', comToken);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'bad_request' });
    assert.equal(pedidos.length, 0);
  } finally {
    await server.close();
  }
});

test('identidades: o mesmo limite de carteira vale para os dois endpoints juntos', async () => {
  // O limite é por USUÁRIO, não por rota: alguém que gastou as seis gerações na bomba não ganha
  // outras seis no Quem Sou Eu?.
  const bomba = spyGenerator();
  const identidades = spyIdentities();
  const server = await startServer({}, { contentGenerator: bomba.generator, identityGenerator: identidades.generator });
  try {
    for (let i = 0; i < 6; i++) assert.equal((await post(server.base, pedidoValido, comToken)).status, 200);
    assert.equal((await postIdentidade(server.base, { count: 8 }, comToken)).status, 429);
    assert.equal(identidades.pedidos.length, 0);
  } finally {
    await server.close();
  }
});

test('identidades: sem chave de API, o app segue com as 168 do banco', async () => {
  const server = await startServer({}, { identityGenerator: null });
  try {
    const res = await postIdentidade(server.base, { count: 8 }, comToken);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'content_unavailable' });
  } finally {
    await server.close();
  }
});

test('identidades: o que o gerador devolve atravessa inteiro até o app', async () => {
  const identidade = {
    id: 'ia-tatu-bola',
    name: 'Tatu-bola',
    emoji: '🦔',
    category: 'Animais',
    difficulty: 'facil' as const,
    kind: 'animal' as const,
    aliases: ['Tatu'],
    hints: ['Me enrolo numa bola quando sinto perigo.', 'Fui mascote de uma Copa do Mundo.'] as [string, string],
  };
  const { generator } = spyIdentities([identidade]);
  const server = await startServer({}, { identityGenerator: generator });
  try {
    const res = await postIdentidade(server.base, { count: 4 }, comToken);
    assert.deepEqual(await res.json(), { identities: [identidade] });
  } finally {
    await server.close();
  }
});

/* ──────────────── a geração que acontece no lobby ──────────────── */

test('a sala pede identidades sozinha no lobby, sem ninguém esperar', async () => {
  // A otimização central deste jogo não é a chamada ser rápida: é ela acontecer onde ninguém
  // espera. O host cria a sala, manda o código, as pessoas entram — e a geração roda ali.
  const identidade = {
    name: 'Tatu-bola',
    emoji: '🦔',
    category: 'Animais',
    difficulty: 'facil',
    kind: 'animal',
    aliases: ['Tatu'],
    hints: ['Me enrolo numa bola fechada quando sinto perigo.', 'Fui o mascote de uma Copa do Mundo.'],
  };
  const pedidos: Parameters<IdentityGenerator['generate']>[0][] = [];
  const comIdentidade: IdentityGenerator = { generate: async (r) => (pedidos.push(r), { identities: [identidade] as never }) };

  const server = await startServer({}, { identityGenerator: comIdentidade });
  try {
    const { clients, host } = await roomWith(server.url, ['ana', 'bia', 'caio'], {
      gameId: 'whoami',
      category: 'Aleatório',
      totalRounds: 1,
      maxPlayers: 12,
      settings: { categories: ['Animais'], difficulties: ['facil'] },
    });
    // A geração é assíncrona: espera o snapshot que ela provoca.
    await sleep(120);
    assert.equal(pedidos.length, 1, 'a sala não pediu identidades no lobby');
    assert.deepEqual(pedidos[0].categories, ['Animais']);

    await host.cmd({ type: 'startMatch' });
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'guessing', 'rodada')));

    // A partida começa normalmente com o conteúdo entregue. QUAIS identidades saem no sorteio é
    // assunto do motor, e tem teste determinístico lá (`whoami-room.test.ts`) — aqui provar isso
    // dependeria de sorte: a gerada disputa a vaga com as do banco.
    const naMesa = (clients[0].snapshot!.game as { visibleIdentities: { name: string }[] }).visibleIdentities;
    assert.equal(naMesa.length, 2, 'o jogador não recebeu as identidades dos outros dois');
  } finally {
    await server.close();
  }
});

test('sem gerador, a sala do Quem Sou Eu? joga com o banco local e nada reclama', async () => {
  const server = await startServer({}, { identityGenerator: null });
  try {
    const { clients, host } = await roomWith(server.url, ['ana', 'bia', 'caio'], {
      gameId: 'whoami',
      category: 'Aleatório',
      totalRounds: 1,
      maxPlayers: 12,
    });
    await host.cmd({ type: 'startMatch' });
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'guessing', 'rodada')));
    const naMesa = (clients[0].snapshot!.game as { visibleIdentities: { name: string }[] }).visibleIdentities;
    assert.equal(naMesa.length, 2, 'o jogador não recebeu as identidades dos outros dois');
  } finally {
    await server.close();
  }
});
