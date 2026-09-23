/**
 * Log de desenvolvimento: o que o app pede à rede e por onde a pessoa anda.
 *
 * Duas regras que valem para tudo aqui:
 *
 * 1. **Só em desenvolvimento.** Em produção o logger é desligado inteiro — nada de custo em
 *    release e, principalmente, nada de dado de usuário indo parar no console de um aparelho
 *    de verdade (no Android, `adb logcat` mostra isso para qualquer app instalado).
 * 2. **Nunca imprime segredo.** Token, senha e chave são apagados antes de virar texto, mesmo
 *    em dev — um print de tela ou um vídeo de bug não podem vazar a sessão de ninguém.
 */

/** `__DEV__` é injetado pelo Metro; em Node (testes, scripts) ele não existe. */
const isDev = (): boolean => (typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production');

/** `EXPO_PUBLIC_LOG=off` silencia sem precisar mexer no código (útil ao gravar a tela). */
const silenced = process.env.EXPO_PUBLIC_LOG === 'off';

let enabled = isDev() && !silenced;

/** O destino das linhas. Existe para os testes conseguirem ler o que foi impresso. */
let sink: (line: string) => void = (line) => console.log(line);

export const logger = {
  get enabled() {
    return enabled;
  },
  /** Liga/desliga em tempo de execução. Em produção continua desligado, dê o que der. */
  setEnabled(value: boolean) {
    enabled = value && isDev();
  },
  /** Troca o destino (testes). Devolve o anterior. */
  setSink(next: (line: string) => void) {
    const previous = sink;
    sink = next;
    return previous;
  },
  line(text: string) {
    if (enabled) sink(text);
  },
};

/** Parâmetros de URL e campos que nunca podem aparecer no console. */
const SECRETS = /^(token|access_token|refresh_token|id_token|code|code_verifier|apikey|api_key|key|password|secret|authorization)$/i;

/**
 * `code` é ambíguo no Jogaê: na volta do OAuth é o código do PKCE, que vale uma sessão inteira;
 * nos parâmetros de tela é o código da sala — quatro dígitos que a pessoa grita na mesa e que
 * são exatamente o que se quer ver no log. Só o de sala escapa da tesoura.
 */
const isRoomCode = (key: string, value: unknown) => key.toLowerCase() === 'code' && typeof value === 'string' && /^\d{4}$/.test(value);

/**
 * Encurta a URL para caber numa linha: só caminho e query, com os segredos apagados.
 * O host sai porque é sempre o mesmo e rouba a largura que importa.
 */
export function shortUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const chave of [...url.searchParams.keys()]) {
      if (SECRETS.test(chave) && !isRoomCode(chave, url.searchParams.get(chave))) url.searchParams.set(chave, '…');
    }
    const query = decodeURIComponent(url.searchParams.toString());
    // Um `select=` do PostgREST passa fácil de 200 caracteres e quebra a linha em várias:
    // o começo já diz o que foi pedido, e o resto só atrapalha a leitura no terminal.
    const curta = query.length > 90 ? `${query.slice(0, 90)}…` : query;
    return url.pathname + (curta ? `?${curta}` : '');
  } catch {
    // URL relativa ou malformada: devolve como veio, sem deixar de logar.
    return raw;
  }
}

/** Tira segredos de um objeto antes de imprimir. Não recursivo de propósito: log é resumo. */
export function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return `[${value.length} itens]`;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactField(k, v)]));
}

function redactField(key: string, value: unknown): unknown {
  if (SECRETS.test(key) && !isRoomCode(key, value)) return '…';
  if (Array.isArray(value)) return `[${value.length} itens]`;
  return typeof value === 'object' && value !== null ? '{…}' : value;
}

const ms = (start: number) => `${Math.round(Date.now() - start)}ms`;
/** Alinha o método para as linhas ficarem em colunas legíveis. */
const pad = (text: string, size: number) => text.padEnd(size).slice(0, size);

/** Uma requisição HTTP que terminou. `status` 0 significa que nem chegou a responder. */
export function logHttp(method: string, url: string, status: number, startedAt: number, detail?: string) {
  if (!enabled) return;
  const falhou = status === 0 || status >= 400;
  const icone = falhou ? '🔴' : '🌐';
  logger.line(`${icone} ${pad(method.toUpperCase(), 6)} ${shortUrl(url)} → ${status || 'sem resposta'} (${ms(startedAt)})${detail ? ` ${detail}` : ''}`);
}

/** Uma mensagem do WebSocket das salas. `dir` é a direção vista do app. */
export function logWs(dir: 'envia' | 'recebe', summary: string) {
  if (!enabled) return;
  logger.line(`🔌 ${dir === 'envia' ? '→' : '←'} ${summary}`);
}

/** Troca de tela. `params` só entra quando tem algo que ajude a entender o destino. */
export function logScreen(path: string, params?: Record<string, unknown>) {
  if (!enabled) return;
  const extra = params && Object.keys(params).length ? ` ${JSON.stringify(redact(params))}` : '';
  logger.line(`🧭 tela   ${path}${extra}`);
}
