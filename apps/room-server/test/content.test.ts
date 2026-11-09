import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_CONTENT_COUNT, type BombContentRequest } from '@jogae/engine';

import type { ContentGenerator } from '../src/content/bombContent';
import { startServer } from './helpers';

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
