/**
 * Teste de fumaça do site: sobe o build (dist/server/entry.mjs) contra uma API de salas falsa e
 * confere o que quebra em silêncio em produção — Content-Type dos .well-known, Open Graph dos convites,
 * os três estados da página de convite, 404, noindex e escape de HTML.   npm run check
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- API de salas falsa: 4827 existe, 5555 tem host malicioso, 7777 está em jogo, 0404 não existe, 0500 quebra
const fakeApi = createServer((req, res) => {
  const code = req.url.split('/').pop();
  const room = (over) => JSON.stringify({ code, gameId: 'impostor', status: 'open', host: { name: 'André', initial: 'A', color: '#7C3AED' }, count: 3, players: [{ initial: 'A', color: '#7C3AED' }, { initial: 'C', color: '#FACC15' }, { initial: 'L', color: '#22C55E' }], ...over });
  res.setHeader('content-type', 'application/json');
  if (code === '4827') return res.end(room({}));
  if (code === '7777') return res.end(room({ status: 'playing' }));
  if (code === '5555') return res.end(room({ host: { name: '"><script>alert(1)</script>', initial: '<', color: 'red;background:url(x)' }, players: [{ initial: '"', color: 'javascript:1' }] }));
  if (code === '0500') return (res.statusCode = 500), res.end('{}');
  res.statusCode = 404;
  res.end('{"error":"not_found"}');
});
await new Promise((r) => fakeApi.listen(0, r));
const apiUrl = `http://127.0.0.1:${fakeApi.address().port}`;

async function startSite(env) {
  const port = 4400 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/robots.txt')).ok) return { base, stop: () => child.kill(), log: () => log };
    } catch {}
    await sleep(100);
  }
  child.kill();
  throw new Error('o site não subiu:\n' + log);
}

const get = async (base, path) => {
  const res = await fetch(base + path, { redirect: 'manual' });
  return { status: res.status, type: res.headers.get('content-type') ?? '', cache: res.headers.get('cache-control') ?? '', body: await res.text() };
};
const meta = (html, prop) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];
let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed++;
  console.log('  ✓', name);
};

const site = await startSite({ ROOM_API_URL: apiUrl, APPLE_TEAM_ID: 'ABCDE12345', ANDROID_SHA256_FINGERPRINTS: 'AA:BB, CC:DD' });
try {
  await check('páginas estáticas respondem 200 em HTML, em pt-BR, com título e descrição', async () => {
    for (const path of ['/', '/privacidade', '/termos', '/excluir-conta']) {
      const page = await get(site.base, path);
      assert.equal(page.status, 200, path);
      assert.match(page.type, /text\/html/, path);
      assert.ok(page.body.includes('<html lang="pt-BR"'), `${path} sem lang="pt-BR"`);
      assert.ok(page.body.match(/<title>[^<]{10,}<\/title>/), `${path} sem <title>`);
      assert.ok((meta(page.body, 'description') ?? '').length > 50, `${path} sem description`);
      assert.ok(meta(page.body, 'og:image')?.endsWith('/og/default.png'), `${path} sem og:image padrão`);
      assert.ok(!page.body.includes('name="robots"'), `${path} não pode ter noindex`);
    }
  });

  await check('landing: um <h1>, JSON-LD de app, FAQ em <details> e nenhuma tag de script de terceiros', async () => {
    const { body } = await get(site.base, '/');
    assert.equal(body.match(/<h1/g)?.length, 1);
    assert.equal(JSON.parse(body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@type'], 'SoftwareApplication');
    assert.equal(body.match(/<details/g)?.length, 5);
    assert.ok(!/<script[^>]+src="https?:/.test(body), 'sem Plausible configurado não pode haver script externo');
    assert.ok(body.includes('Em breve na'), 'sem URL de loja o botão diz "Em breve"');
  });

  await check('apple-app-site-association: 200, application/json, sem redirect, com o App ID certo', async () => {
    const file = await get(site.base, '/.well-known/apple-app-site-association');
    assert.equal(file.status, 200);
    assert.match(file.type, /^application\/json/);
    const details = JSON.parse(file.body).applinks.details[0];
    assert.deepEqual(details.appIDs, ['ABCDE12345.app.jogae']);
    assert.deepEqual(details.components, [{ '/': '/j/*' }, { '/': '/u/*' }]);
  });

  await check('assetlinks.json: pacote do app e todos os fingerprints', async () => {
    const file = await get(site.base, '/.well-known/assetlinks.json');
    assert.match(file.type, /^application\/json/);
    const [entry] = JSON.parse(file.body);
    assert.equal(entry.target.package_name, 'app.jogae');
    assert.deepEqual(entry.target.sha256_cert_fingerprints, ['AA:BB', 'CC:DD']);
  });

  await check('convite de sala existente: código e host no Open Graph, noindex, sem cache compartilhado', async () => {
    const page = await get(site.base, '/j/4827');
    assert.equal(page.status, 200);
    assert.equal(meta(page.body, 'og:title'), 'Você foi convidado para a sala 4827');
    assert.equal(meta(page.body, 'og:description'), 'André te chamou para jogar Impostor no Jogaê');
    assert.ok(meta(page.body, 'og:image')?.endsWith('/og/convite.png'));
    assert.match(meta(page.body, 'robots'), /noindex/);
    assert.match(page.cache, /no-store/);
    assert.ok(page.body.includes('André te convidou') && page.body.includes('2 jogadores já entraram'));
    assert.ok(page.body.includes('href="jogae://j/4827"'), 'link para abrir o app');
  });

  await check('convite: partida em andamento, sala encerrada e API fora do ar têm textos diferentes', async () => {
    assert.ok((await get(site.base, '/j/7777')).body.includes('a partida já começou'));
    const gone = await get(site.base, '/j/0404');
    assert.equal(gone.status, 200, 'sala encerrada nunca é um 404 seco: o objetivo é converter');
    assert.ok(gone.body.includes('já terminou') && !gone.body.includes('te convidou'));
    assert.ok(!gone.body.includes('Você entrou') && !gone.body.includes('Três jeitos de entrar'), 'sala encerrada não mostra lobby nem instruções de entrada');
    const unknown = await get(site.base, '/j/0500');
    assert.equal(unknown.status, 200);
    assert.ok(unknown.body.includes('Você foi convidado') && !unknown.body.includes('já terminou'), 'sem resposta do servidor NÃO afirmamos que a sala acabou');
  });

  await check('convite: nome e cor vindos da API não viram HTML nem CSS', async () => {
    const { body } = await get(site.base, '/j/5555');
    // O nome tenta fechar o atributo com aspas e abrir uma tag. Dentro de atributo, < e > são inofensivos;
    // o que NÃO pode acontecer é a aspa escapar do atributo, nem a tag aparecer crua num nó de texto.
    assert.ok(!body.includes('"><script>alert(1)'), 'a aspa do nome fechou um atributo');
    assert.ok(body.includes('content="&#34;><script>alert(1)</script> te chamou'), 'em atributo a aspa vira &#34; e o valor continua dentro das aspas');
    assert.ok(body.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; te convidou'), 'em texto, tudo escapado');
    assert.ok(!body.includes('url(x)') && !body.includes('javascript:1'), 'cor da API injetou CSS');
  });

  await check('códigos e usernames inválidos dão 404 de verdade', async () => {
    for (const path of ['/j/123', '/j/12345', '/j/abcd', '/u/ab', '/u/Com-Maiuscula', '/u/' + 'x'.repeat(21), '/nao-existe']) {
      assert.equal((await get(site.base, path)).status, 404, path);
    }
  });

  await check('convite de amizade: @username no Open Graph e link jogae://u/', async () => {
    const page = await get(site.base, '/u/vini.costa_1');
    assert.equal(page.status, 200);
    assert.equal(meta(page.body, 'og:title'), '@vini.costa_1 te chamou para o Jogaê');
    assert.ok(page.body.includes('href="jogae://u/vini.costa_1"'));
    assert.match(meta(page.body, 'robots'), /noindex/);
  });

  await check('robots.txt esconde os convites; sitemap.xml lista só as páginas públicas', async () => {
    const robots = await get(site.base, '/robots.txt');
    assert.ok(robots.body.includes('Disallow: /j/') && robots.body.includes('Disallow: /u/') && robots.body.includes('Sitemap: '));
    const sitemap = await get(site.base, '/sitemap.xml');
    assert.match(sitemap.type, /xml/);
    assert.equal(sitemap.body.match(/<loc>/g).length, 4);
    assert.ok(!sitemap.body.includes('/j/') && !sitemap.body.includes('/u/'));
  });
} finally {
  site.stop();
}

const bare = await startSite({ ROOM_API_URL: apiUrl, APPLE_TEAM_ID: '', ANDROID_SHA256_FINGERPRINTS: '' });
try {
  await check('sem Team ID / fingerprint os .well-known saem válidos e vazios (nunca um JSON quebrado)', async () => {
    assert.deepEqual(JSON.parse((await get(bare.base, '/.well-known/apple-app-site-association')).body), { applinks: { apps: [], details: [] } });
    assert.deepEqual(JSON.parse((await get(bare.base, '/.well-known/assetlinks.json')).body), []);
  });
} finally {
  bare.stop();
  fakeApi.close();
}

console.log(`\nSITE OK — ${passed} verificações\n`);
