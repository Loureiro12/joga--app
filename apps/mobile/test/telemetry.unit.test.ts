/**
 * A telemetria, na parte que tem regra.
 *
 * Dois assuntos, e os dois falham em silêncio se estiverem errados — que é o que torna o teste
 * valioso aqui:
 *
 * 1. **Privacidade.** Um evento que leve e-mail, nome ou código de sala não dá erro: ele sobe, e
 *    passa a existir num painel da Google para sempre. A defesa principal é o tipo `TelemetryEvent`
 *    (não há campo onde um nome caiba); `sanitizeParams` é a segunda, para o acidente.
 * 2. **Os limites do GA4.** O Firebase **descarta sem avisar** evento com nome inválido ou texto
 *    longo demais. Não há erro, não há log: o evento simplesmente nunca aparece, e você descobre
 *    semanas depois olhando um gráfico vazio.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decideCollection, describeCollection, type TelemetryGate } from '../src/features/telemetry/consent';
import {
  GA4_LIMITS,
  isValidEventName,
  looksPersonal,
  sanitizeParams,
  toAnalyticsEvent,
  toScreenName,
  toUserProperties,
  type TelemetryEvent,
} from '../src/features/telemetry/events';

/* ─────────────────────────── privacidade ─────────────────────────── */

test('parâmetro que parece dado pessoal é descartado', () => {
  const { params, descartados } = sanitizeParams({ metodo: 'email', email: 'ana@teste.com', telefone: '+5511999999999' });
  assert.deepEqual(params, { metodo: 'email' });
  assert.deepEqual(descartados.sort(), ['email', 'telefone']);
});

test('o detector de dado pessoal pega e-mail, telefone e CPF', () => {
  for (const valor of ['ana@teste.com', '+5511999999999', 'meu CPF é esse', 'x'.repeat(GA4_LIMITS.paramValue + 1)]) {
    assert.equal(looksPersonal(valor), true, `deveria recusar: ${valor.slice(0, 30)}`);
  }
  for (const valor of ['email', 'google', 'bomba-relogio', 'fim-de-partida', 'consentimento pendente']) {
    assert.equal(looksPersonal(valor), false, `não deveria recusar: ${valor}`);
  }
});

test('o nome da tela nunca carrega código de sala nem nome de usuário', () => {
  // `/j/4827` é o link de convite de uma sala e `/u/andre` é o perfil de uma pessoa. Sem isto, o
  // painel de telas do Analytics viraria uma lista de salas ativas e de nomes de usuário.
  assert.equal(toScreenName('/j/4827'), 'j_id');
  assert.ok(!toScreenName('/j/4827').includes('4827'), 'o código da sala foi para o nome da tela');
  assert.ok(!toScreenName('/u/andre').includes('andre'), 'o nome de usuário foi para o nome da tela');
  assert.ok(!toScreenName('/game/bomba-relogio').includes('bomba'), 'o segmento dinâmico não foi trocado por marcador');
});

test('propriedade de usuário com dado pessoal não entra', () => {
  // Pior que um evento: propriedade de usuário fica colada na pessoa para sempre no painel.
  assert.deepEqual(toUserProperties({ backend: 'ana@teste.com' }), {});
  assert.deepEqual(toUserProperties({ backend: 'supabase', premium: false }), { backend: 'supabase', premium: 'nao' });
});

/* ─────────────────────────── os limites do GA4 ─────────────────────────── */

test('nome de evento inválido é recusado em vez de descartado em silêncio', () => {
  for (const nome of ['', '1comeca_com_numero', 'com-hifen', 'com espaço', 'x'.repeat(GA4_LIMITS.eventName + 1)]) {
    assert.equal(isValidEventName(nome), false, `deveria recusar: "${nome}"`);
  }
  for (const nome of ['partida_iniciada', 'login', 'anuncio_mostrado']) {
    assert.equal(isValidEventName(nome), true, `deveria aceitar: "${nome}"`);
  }
});

test('os prefixos que o Firebase reserva são recusados', () => {
  // Evento com esses prefixos é rejeitado pelo SDK, e sem mensagem nenhuma no app.
  for (const nome of ['firebase_algo', 'google_algo', 'ga_algo', 'FIREBASE_algo']) {
    assert.equal(isValidEventName(nome), false, `"${nome}" usa prefixo reservado`);
  }
});

test('parâmetro além do teto de 25 é descartado, não sobe pela metade', () => {
  const muitos = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`p${i}`, i]));
  const { params, descartados } = sanitizeParams(muitos);
  assert.equal(Object.keys(params).length, GA4_LIMITS.paramsPerEvent);
  assert.equal(descartados.length, 40 - GA4_LIMITS.paramsPerEvent);
});

test('nome de parâmetro inválido é descartado', () => {
  const { params, descartados } = sanitizeParams({ ok: 1, 'com-hifen': 2, '1numero': 3, ['x'.repeat(50)]: 4 });
  assert.deepEqual(params, { ok: 1 });
  assert.equal(descartados.length, 3);
});

test('o nome da tela cabe no limite do GA4', () => {
  const longo = '/' + Array.from({ length: 20 }, (_, i) => `segmento${i}`).join('/');
  assert.ok(toScreenName(longo).length <= GA4_LIMITS.eventName);
});

/* ─────────────────────────── forma dos valores ─────────────────────────── */

test('nulo e indefinido não viram parâmetro', () => {
  const { params } = sanitizeParams({ a: null, b: undefined, c: 0, d: false, e: '' });
  // `0` e `false` são valores de verdade e têm de passar; string vazia, não.
  assert.deepEqual(params, { c: 0, d: false });
});

test('número infinito ou NaN é descartado em vez de virar lixo no painel', () => {
  const { params, descartados } = sanitizeParams({ ok: 1.239, inf: Infinity, nan: NaN });
  assert.deepEqual(params, { ok: 1.24 });
  assert.deepEqual(descartados.sort(), ['inf', 'nan']);
});

test('objeto e lista não viram parâmetro', () => {
  const { params, descartados } = sanitizeParams({ lista: [1, 2], objeto: { a: 1 }, ok: 'x' });
  assert.deepEqual(params, { ok: 'x' });
  assert.deepEqual(descartados.sort(), ['lista', 'objeto']);
});

/* ─────────────────────────── o catálogo ─────────────────────────── */

test('um evento do catálogo sai pronto, sem o campo `name` entre os parâmetros', () => {
  const pronto = toAnalyticsEvent({ name: 'partida_iniciada', gameId: 'bomb', players: 4, rounds: 3 });
  assert.ok(pronto);
  assert.equal(pronto.payload.name, 'partida_iniciada');
  assert.deepEqual(pronto.payload.params, { gameId: 'bomb', players: 4, rounds: 3 });
  assert.ok(!('name' in pronto.payload.params), 'o nome do evento vazou para os parâmetros');
});

test('evento sem parâmetro nenhum é válido', () => {
  const pronto = toAnalyticsEvent({ name: 'sala_entrou' });
  assert.ok(pronto);
  assert.deepEqual(pronto.payload.params, {});
});

test('todo evento do catálogo tem nome aceitável para o GA4', () => {
  // A lista é escrita à mão no tipo; este teste é o que garante que nenhum nome novo entre com
  // hífen, espaço ou prefixo reservado e passe a ser descartado sem ninguém notar.
  const todos: TelemetryEvent[] = [
    { name: 'sala_criada', gameId: 'none', players: 12 },
    { name: 'sala_entrou' },
    { name: 'jogo_escolhido', gameId: 'whoami' },
    { name: 'partida_iniciada', gameId: 'bomb', players: 4, rounds: 3 },
    { name: 'partida_terminada', gameId: 'bomb', players: 4, rounds: 3, segundos: 120, completou: true },
    { name: 'anuncio_mostrado', placement: 'fim-de-partida' },
    { name: 'anuncio_pulado', placement: 'fim-de-partida', motivo: 'consentimento pendente' },
    { name: 'login', metodo: 'google' },
    { name: 'conta_criada', metodo: 'email' },
    { name: 'convite_enviado', canal: 'link' },
    { name: 'opcoes_mudadas', gameId: 'impostor' },
  ];
  for (const e of todos) {
    assert.ok(isValidEventName(e.name), `"${e.name}" não serve para o GA4`);
    const pronto = toAnalyticsEvent(e);
    assert.ok(pronto, `"${e.name}" não virou evento`);
    assert.deepEqual(pronto.descartados, [], `"${e.name}" perdeu parâmetros: ${pronto.descartados.join(', ')}`);
  }
});

/* ─────────────────────────── consentimento ─────────────────────────── */

const gate = (over: Partial<TelemetryGate> = {}): TelemetryGate => ({ flagOn: true, nativeAvailable: true, optedIn: true, ...over });

test('o caso normal: tudo ligado', () => {
  assert.deepEqual(decideCollection(gate()), { analytics: true, performance: true, crashes: true });
});

test('recusar dados de uso desliga uso e desempenho, e mantém relatório de erro', () => {
  // É a decisão que a política de privacidade descreve com essas palavras. As duas têm de dizer a
  // mesma coisa: mudar uma sem a outra faria o app negar no texto o que faz no código.
  assert.deepEqual(decideCollection(gate({ optedIn: false })), { analytics: false, performance: false, crashes: true });
});

test('sem módulo nativo não há coleta nenhuma — nem relatório de erro', () => {
  // É o caso da web e do Expo Go. O harness de navegador do projeto roda em cima da web.
  assert.deepEqual(decideCollection(gate({ nativeAvailable: false })), { analytics: false, performance: false, crashes: false });
});

test('a flag do build desliga tudo, inclusive o relatório de erro', () => {
  assert.deepEqual(decideCollection(gate({ flagOn: false })), { analytics: false, performance: false, crashes: false });
  // E desligada vence o resto: não existe combinação que colete com a flag em falso.
  assert.deepEqual(decideCollection(gate({ flagOn: false, optedIn: true, nativeAvailable: true })), { analytics: false, performance: false, crashes: false });
});

test('a descrição em texto bate com a decisão', () => {
  // A tela de Ajustes e o log de desenvolvimento leem daqui, para dizerem a mesma coisa.
  assert.equal(describeCollection(decideCollection(gate())), 'uso, desempenho e erros');
  assert.equal(describeCollection(decideCollection(gate({ optedIn: false }))), 'só relatórios de erro');
  assert.equal(describeCollection(decideCollection(gate({ nativeAvailable: false }))), 'telemetria desligada');
});

test('o simulado registra o nome normalizado, não o caminho cru', async () => {
  // O log do simulado existe para mostrar o que SERIA enviado. Imprimindo o caminho cru, o código
  // da sala apareceria no terminal e ninguém notaria que o de verdade normaliza — ou que parou de.
  const { logger } = await import('../src/core/logging/logger');
  const { MockTelemetryService } = await import('../src/features/telemetry/TelemetryService');

  const linhas: string[] = [];
  const antes = logger.setSink((l) => linhas.push(l));
  const ligado = logger.enabled;
  logger.setEnabled(true);
  try {
    new MockTelemetryService().screen('/j/4827');
  } finally {
    logger.setSink(antes);
    logger.setEnabled(ligado);
  }
  assert.ok(
    linhas.some((l) => l.includes('j_id')),
    `esperava o nome normalizado; saiu: ${linhas.join(' | ')}`,
  );
  assert.ok(!linhas.some((l) => l.includes('4827')), 'o código da sala apareceu no log');
});

/* ─────────────────────────── o bundle da web ─────────────────────────── */

/**
 * Os pacotes `@react-native-firebase/*` tocam a ponte nativa no topo do módulo. Basta um deles ser
 * avaliado no navegador para a página morrer com tela branca antes de qualquer tela — foi o que
 * aconteceu com o SDK de anúncios, e aqui o risco é quatro vezes maior.
 *
 * O `sdk.web.ts` é o que os mantém fora do bundle. Ele parece um arquivo inútil de três linhas, e
 * é exatamente por isso que precisa de um teste explicando o contrário.
 */
test('nenhum SDK do Firebase entra no bundle da web', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const base = new URL('../src/features/telemetry/', import.meta.url);
  const PACOTES = ['@react-native-firebase/app', '@react-native-firebase/analytics', '@react-native-firebase/crashlytics', '@react-native-firebase/perf'];

  // Comentários falam dos pacotes o tempo todo; o que não pode é código importá-los.
  const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const web = semComentarios(await readFile(new URL('sdk.web.ts', base), 'utf8'));
  for (const pacote of PACOTES) assert.ok(!web.includes(pacote), `a versão web do carregador voltou a tocar em ${pacote}`);
  assert.match(web, /export const loadFirebaseSdk/, 'o Metro precisa do mesmo nome exportado nos dois arquivos');

  const nativo = await readFile(new URL('sdk.ts', base), 'utf8');
  for (const pacote of ['analytics', 'crashlytics', 'perf']) {
    assert.ok(nativo.includes(`require('@react-native-firebase/${pacote}')`), `o carregador nativo parou de carregar ${pacote}`);
  }

  // E só o par sdk.ts/sdk.web.ts pode citar os pacotes: qualquer outro import os traria de volta.
  for (const arquivo of await readdir(base)) {
    if (arquivo.startsWith('sdk.')) continue;
    const src = semComentarios(await readFile(new URL(arquivo, base), 'utf8'));
    for (const pacote of PACOTES) assert.ok(!src.includes(pacote), `${arquivo} importa ${pacote} direto e quebraria a web`);
  }
});

/* ─────────────────────────── a configuração nativa ─────────────────────────── */

/**
 * O detalhe que custa um build quebrado.
 *
 * O Firebase Apple SDK 13+ só existe em Swift Package Manager, e o SPM exige frameworks
 * dinâmicos — que **não convivem** com o SDK do Google Mobile Ads, que é estático. O app já
 * publica anúncios, então o caminho é o contrário: ficar na última versão do Firebase distribuída
 * em CocoaPods (iOS 12.19.3, do `@react-native-firebase` 26.4.1) e pedir `disableSPM`.
 *
 * Por isso as versões são FIXAS, sem `^`: subir para a 27 troca o build do iOS por um erro de
 * `pod install` que não diz o que fazer.
 */
test('o Firebase fica no caminho CocoaPods, porque o AdMob não convive com SPM', async () => {
  const { readFile } = await import('node:fs/promises');
  const appJson = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  const plugin = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === '@react-native-firebase/app');
  assert.ok(plugin, 'o plugin do @react-native-firebase/app saiu do app.json');
  assert.equal(plugin[1]?.ios?.disableSPM, true, 'sem disableSPM o pod install falha: o SPM do Firebase não convive com o AdMob estático');

  const firebase = Object.entries(pkg.dependencies).filter(([k]) => k.startsWith('@react-native-firebase/'));
  assert.equal(firebase.length, 4, 'esperava app, analytics, crashlytics e perf');
  for (const [nome, versao] of firebase) {
    assert.match(String(versao), /^\d+\.\d+\.\d+$/, `${nome} está com faixa de versão; aqui a versão precisa ser fixa`);
    assert.ok(String(versao).startsWith('26.'), `${nome} está na ${versao}: a 27 exige SPM e quebra o build do iOS com AdMob`);
  }

  // Sem os dois arquivos de configuração o build nativo falha; o app.json tem de apontar para eles.
  assert.equal(appJson.expo.android.googleServicesFile, './google-services.json');
  assert.equal(appJson.expo.ios.googleServicesFile, './GoogleService-Info.plist');
});

test('os plugins de Crashlytics e Performance estão no app.json', async () => {
  // Analytics funciona só com o pacote; Crashlytics e Performance precisam dos plugins do Gradle,
  // e sem eles o relatório simplesmente nunca chega — sem erro nenhum no caminho.
  const { readFile } = await import('node:fs/promises');
  const appJson = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
  const nomes = appJson.expo.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
  for (const esperado of ['@react-native-firebase/crashlytics', '@react-native-firebase/perf', '@react-native-firebase/analytics']) {
    assert.ok(nomes.includes(esperado), `${esperado} não está nos plugins`);
  }
  // A ordem importa: o plugin do app é quem copia os arquivos e aplica o google-services.
  assert.ok(nomes.indexOf('@react-native-firebase/app') < nomes.indexOf('@react-native-firebase/crashlytics'), 'o plugin do app tem de vir primeiro');
});

/**
 * A política de privacidade e o código têm de dizer a mesma coisa.
 *
 * O texto legal mora noutro pacote (`apps/site`), onde nenhum teste do app chega — e é justamente
 * o tipo de arquivo que fica para trás quando o código muda. Uma política que afirma algo que o
 * app não faz é risco de recusa na loja e de reclamação na LGPD; o contrário é pior ainda.
 *
 * Este teste não julga a redação. Ele cobra as três promessas que o código sustenta: que há um
 * interruptor para dados de uso, que ele fica em Configurações, e que relatório de erro é uma
 * coisa separada e sempre ligada.
 */
test('a política de privacidade descreve a mesma divisão que o código aplica', async () => {
  const { readFile } = await import('node:fs/promises');
  const legal = await readFile(new URL('../../site/src/data/legal.ts', import.meta.url), 'utf8');

  const secao = legal.slice(legal.indexOf('Medição e relatórios de erro'));
  assert.ok(secao.length > 200, 'a seção de medição saiu da política');

  // O caminho exato que a tela de Ajustes oferece.
  assert.ok(secao.includes('Configurações → Dados de uso'), 'a política não aponta para o interruptor que existe no app');

  // E a divisão: erro sempre ligado, uso opcional. É o que `decideCollection` faz.
  assert.ok(/sempre ligado/.test(secao), 'a política não diz que o relatório de erro fica sempre ligado');
  assert.ok(/OPCIONAL|opcional/.test(secao), 'a política não diz que os dados de uso são opcionais');
  const decisao = decideCollection({ flagOn: true, nativeAvailable: true, optedIn: false });
  assert.equal(decisao.crashes, true, 'a política promete relatório de erro sempre ligado, e o código desligou');
  assert.equal(decisao.analytics, false, 'a política promete que recusar desliga os dados de uso, e o código manteve');

  // E o que a política jura que nunca sai do aparelho.
  for (const promessa of ['seu nome', 'seu e-mail', 'código das suas salas']) {
    assert.ok(secao.includes(promessa), `a política deixou de prometer que não envia "${promessa}"`);
  }
});

test('a tela de Ajustes oferece o interruptor que a política promete', async () => {
  const { readFile } = await import('node:fs/promises');
  const tela = await readFile(new URL('../src/features/settings/SettingsScreen.tsx', import.meta.url), 'utf8');
  assert.ok(tela.includes('"Dados de uso"') || tela.includes("'Dados de uso'") || tela.includes('title="Dados de uso"'), 'o interruptor de dados de uso saiu da tela de Ajustes');
  assert.ok(tela.includes('applyConsent'), 'mexer no interruptor parou de aplicar a decisão na hora');
});
