/**
 * O logger imprime dado de gente de verdade num console que qualquer app do aparelho consegue
 * ler (`adb logcat`, no Android). Estes testes existem para garantir as duas promessas que ele
 * faz: **nada de segredo** e **nada em produção**.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loggedFetch } from '../src/core/logging/loggedFetch';
import { logHttp, logScreen, logWs, logger, redact, shortUrl } from '../src/core/logging/logger';

/** Captura o que foi impresso durante o bloco. */
function capture(fn: () => void | Promise<void>) {
  const lines: string[] = [];
  const antes = logger.setSink((line) => lines.push(line));
  const restore = () => logger.setSink(antes);
  const result = fn();
  if (result instanceof Promise) return result.then(() => (restore(), lines));
  restore();
  return lines;
}

test('o código da sala não é segredo; o do OAuth é', () => {
  // Os dois se chamam `code`, e confundir os dois ou esconde o que ajuda, ou vaza a sessão.
  assert.equal(shortUrl('https://jogaeapp.com.br/j/4827?code=4827'), '/j/4827?code=4827');
  assert.ok(!shortUrl('https://jogaeapp.com.br/auth/callback?code=a3f9e1b7c2d4').includes('a3f9e1b7'), 'o código do PKCE vazou');

  const params = redact({ code: '4827' }) as Record<string, unknown>;
  assert.equal(params.code, '4827', 'o código da sala é o que se quer ver no log de tela');
  assert.equal((redact({ code: 'a3f9e1b7c2d4' }) as Record<string, unknown>).code, '…');
});

test('URL: o host sai, o caminho fica e os segredos viram reticências', () => {
  assert.equal(shortUrl('https://abc.supabase.co/rest/v1/matches?select=id,ended_at&limit=100'), '/rest/v1/matches?select=id,ended_at&limit=100');
  assert.equal(shortUrl('https://abc.supabase.co/auth/v1/user?apikey=sb_publishable_abc123'), '/auth/v1/user?apikey=…');

  // O retorno do OAuth carrega o código de troca da sessão: nunca pode aparecer.
  const callback = shortUrl('jogae://auth/callback?code=super-secreto&state=abc');
  assert.ok(!callback.includes('super-secreto'), 'o código do PKCE vazou');
  assert.ok(callback.includes('state=abc'), 'o que não é segredo continua servindo para depurar');

  // Entrada malformada não pode derrubar o app nem calar o log.
  assert.equal(shortUrl('não é uma url'), 'não é uma url');

  // Um `select=` do PostgREST passa de 200 caracteres e quebraria a linha em várias.
  const longa = shortUrl(`https://abc.supabase.co/rest/v1/matches?select=${'campo,'.repeat(40)}fim`);
  assert.ok(longa.length < 140, `linha longa demais: ${longa.length}`);
  assert.ok(longa.endsWith('…'), 'o corte precisa ficar visível');
  assert.ok(longa.startsWith('/rest/v1/matches?select=campo,'), 'o começo diz o que foi pedido');
});

test('redact apaga segredo e encolhe o resto', () => {
  const limpo = redact({ email: 'a@b.co', password: '123456', token: 'ey…', perfil: { nome: 'Ana' }, itens: [1, 2, 3] }) as Record<string, unknown>;
  assert.equal(limpo.password, '…');
  assert.equal(limpo.token, '…');
  assert.equal(limpo.email, 'a@b.co', 'o que não é segredo continua legível');
  assert.equal(limpo.perfil, '{…}', 'objeto aninhado vira resumo: log é uma linha, não um dump');
  assert.equal(limpo.itens, '[3 itens]');
  assert.equal(redact('texto'), 'texto');
  assert.equal(redact(null), null);
});

test('as linhas dizem o essencial: método, caminho, status e tempo', () => {
  const linhas = capture(() => {
    logHttp('post', 'https://abc.supabase.co/rest/v1/rpc/get_my_friends', 200, Date.now() - 120);
    logHttp('GET', 'https://abc.supabase.co/auth/v1/user', 401, Date.now(), '· invalid token');
    logHttp('GET', 'https://abc.supabase.co/rest/v1/matches', 0, Date.now(), 'Network request failed');
    logWs('envia', 'cmd castVote #7');
    logWs('recebe', 'snapshot voting · 5 jogadores');
    logScreen('/match/vote', { code: '4827' });
  }) as string[];

  assert.match(linhas[0], /POST\s+\/rest\/v1\/rpc\/get_my_friends → 200 \(\d+ms\)/);
  assert.ok(linhas[1].startsWith('🔴'), 'erro precisa saltar aos olhos no meio do log');
  assert.match(linhas[1], /401 .*· invalid token/);
  assert.match(linhas[2], /sem resposta/, 'falha de rede não tem status, e é o caso mais confuso');
  assert.match(linhas[3], /→ cmd castVote #7/);
  assert.match(linhas[4], /← snapshot voting/);
  assert.match(linhas[5], /🧭 tela\s+\/match\/vote \{"code":"4827"\}/);
});

test('desligado, não imprime nada', () => {
  logger.setEnabled(false);
  const linhas = capture(() => {
    logHttp('GET', 'https://x/y', 200, Date.now());
    logWs('envia', 'cmd startMatch');
    logScreen('/home');
  }) as string[];
  logger.setEnabled(true);
  assert.deepEqual(linhas, []);
});

test('o fetch instrumentado registra a chamada e devolve a resposta intacta', async () => {
  const corpo = JSON.stringify({ matches: 3 });
  const base = (async () => new Response(corpo, { status: 200 })) as typeof fetch;

  const linhas = (await capture(async () => {
    const resposta = await loggedFetch(base)('https://abc.supabase.co/rest/v1/matches?select=id');
    // Quem chamou precisa conseguir ler o corpo: o logger não pode consumi-lo.
    assert.equal(await resposta.text(), corpo);
  })) as string[];

  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /GET\s+\/rest\/v1\/matches\?select=id → 200/);
});

test('em erro, o motivo do servidor entra na linha — é o que se procura quando quebra', async () => {
  const base = (async () => new Response(JSON.stringify({ message: 'JWT expired' }), { status: 401 })) as typeof fetch;
  const linhas = (await capture(async () => {
    await loggedFetch(base)('https://abc.supabase.co/auth/v1/user', { method: 'GET' });
  })) as string[];
  assert.match(linhas[0], /401 .*· JWT expired/);
});

test('o corpo enviado nunca é impresso: em /auth/v1/token ele é a senha', async () => {
  const base = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  const linhas = (await capture(async () => {
    await loggedFetch(base)('https://abc.supabase.co/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: 'ana@exemplo.com', password: 'senha-secreta-123' }),
      headers: { authorization: 'Bearer token-secreto' },
    });
  })) as string[];

  assert.ok(!linhas[0].includes('senha-secreta-123'), 'a senha vazou para o console');
  assert.ok(!linhas[0].includes('token-secreto'), 'o token vazou para o console');
  assert.match(linhas[0], /POST\s+\/auth\/v1\/token/, 'a chamada em si continua aparecendo');
});

test('falha de rede é registrada e o erro continua subindo para quem chamou', async () => {
  const base = (async () => {
    throw new Error('Network request failed');
  }) as typeof fetch;

  const linhas = (await capture(async () => {
    await assert.rejects(loggedFetch(base)('https://abc.supabase.co/rest/v1/matches'), /Network request failed/);
  })) as string[];
  assert.match(linhas[0], /🔴.*sem resposta.*Network request failed/);
});
