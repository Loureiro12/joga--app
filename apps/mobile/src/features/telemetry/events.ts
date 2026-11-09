/**
 * O catálogo de eventos de telemetria, e a régua que eles têm de passar.
 *
 * ## A regra que este arquivo existe para impor
 *
 * **Nenhum evento pode levar dado pessoal.** Nem nome, nem e-mail, nem código de sala, nem a
 * pergunta que apareceu na tela, nem o palpite que alguém escreveu. Só id de jogo, enum e contagem.
 *
 * E isso não é uma recomendação escrita num comentário: é o tipo `TelemetryEvent` abaixo. Não
 * existe forma de uma tela mandar o nome de um jogador para o Analytics, porque não há campo onde
 * ele caiba. O `sanitize` é a segunda linha — ele derruba o que escapar, e tem teste.
 *
 * ## Os limites do GA4, que falham em silêncio
 *
 * O Firebase **descarta sem avisar** evento com nome longo demais, parâmetro além de 25, texto
 * acima de 100 caracteres. Não há erro, não há log: o evento simplesmente nunca aparece no painel,
 * e você descobre semanas depois olhando um gráfico vazio. Por isso os limites moram aqui, como
 * código verificável, e não na memória de quem for adicionar o próximo evento.
 */

/** Limites do GA4. Passar deles não dá erro: o evento é descartado em silêncio. */
export const GA4_LIMITS = {
  eventName: 40,
  paramName: 40,
  paramValue: 100,
  paramsPerEvent: 25,
  userPropertyName: 24,
  userPropertyValue: 36,
} as const;

/**
 * Prefixos que o Firebase reserva. Um evento com esses nomes é recusado.
 */
const RESERVED_PREFIXES = ['firebase_', 'google_', 'ga_'];

/**
 * Os eventos que o app manda. Lista fechada, de propósito.
 *
 * Cada um responde a uma pergunta que alguém de fato vai fazer:
 * - "as pessoas terminam as partidas que começam?" → `partida_iniciada` vs `partida_terminada`
 * - "qual jogo pega?" → `gameId` em todos
 * - "o anúncio está aparecendo onde deveria?" → `anuncio_mostrado` / `anuncio_pulado`
 * - "a sala é fácil de entrar?" → `sala_criada` vs `sala_entrou`
 *
 * Um evento que não responde a nenhuma pergunta é ruído que se paga em bateria e em tempo de
 * análise. Quando um deixar de ser olhado, o lugar dele é fora desta lista.
 */
export type TelemetryEvent =
  /** Sala aberta. `players` é o teto escolhido, não quem entrou. */
  | { name: 'sala_criada'; gameId: string; players: number }
  /** Entrou numa sala pelo código. Sem parâmetro: na hora de entrar a sala pode não ter jogo, e o
   * código dela nunca sai do aparelho — ele identifica um grupo. */
  | { name: 'sala_entrou' }
  /** Host escolheu o jogo de uma sala que já existia. */
  | { name: 'jogo_escolhido'; gameId: string }
  | { name: 'partida_iniciada'; gameId: string; players: number; rounds: number }
  /**
   * Partida encerrada. `completou` separa quem chegou ao fim de quem saiu no meio — é a métrica
   * que mais diz sobre um jogo de festa.
   */
  | { name: 'partida_terminada'; gameId: string; players: number; rounds: number; segundos: number; completou: boolean }
  | { name: 'anuncio_mostrado'; placement: string; gameId?: string }
  /** `motivo` vem da política de anúncios, que já devolve texto curto e fechado. */
  | { name: 'anuncio_pulado'; placement: string; motivo: string }
  /** Login e criação de conta: `metodo` é 'email' | 'google' | 'apple'. */
  | { name: 'login'; metodo: string }
  | { name: 'conta_criada'; metodo: string }
  /** Convite de sala compartilhado. `canal` é 'link' | 'qr' | 'codigo'. */
  | { name: 'convite_enviado'; canal: string }
  /** O grupo mexeu nas opções antes de começar — diz se a tela de preparação está sendo usada. */
  | { name: 'opcoes_mudadas'; gameId: string };

/** Nome de tela, para o `screen_view`. */
export type ScreenName = string;

/**
 * As propriedades de usuário. Também lista fechada, e por um motivo mais sério: propriedade de
 * usuário fica colada na pessoa para sempre no painel, então errar aqui é pior do que errar num
 * evento.
 */
export type TelemetryUserProps = {
  /** 'supabase' | 'mock' — separa quem está num build de verdade de quem está em dev. */
  backend?: string;
  /** Assina? É o corte que explica quase toda diferença de comportamento. */
  premium?: boolean;
  /** O usuário aceitou compartilhar dados de uso. Útil para saber quanto da base está medida. */
  telemetria?: boolean;
};

export type AnalyticsPayload = { name: string; params: Record<string, string | number | boolean> };

/** Nome de evento aceitável para o GA4: começa com letra, só letra/dígito/underscore. */
export const isValidEventName = (name: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) && name.length <= GA4_LIMITS.eventName && !RESERVED_PREFIXES.some((p) => name.toLowerCase().startsWith(p));

/**
 * Parece dado pessoal?
 *
 * É uma rede grossa, e é assim que tem de ser: a defesa real é o tipo `TelemetryEvent`, que não
 * tem campo onde um nome caiba. Isto aqui pega o acidente — alguém que um dia acrescente um campo
 * novo e cole um e-mail nele sem perceber.
 */
export const looksPersonal = (valor: string): boolean => /@|\+55|\bcpf\b/i.test(valor) || valor.length > GA4_LIMITS.paramValue;

/**
 * Filtra os parâmetros de um evento.
 *
 * Descarta em silêncio o que não serve, e **nunca lança**: telemetria que derruba a tela é pior do
 * que telemetria nenhuma. O que é descartado aparece no log de desenvolvimento, que é onde isso
 * precisa ser visto.
 */
export function sanitizeParams(bruto: Record<string, unknown>): { params: Record<string, string | number | boolean>; descartados: string[] } {
  const params: Record<string, string | number | boolean> = {};
  const descartados: string[] = [];

  for (const [chave, valor] of Object.entries(bruto)) {
    if (valor === undefined || valor === null) continue;
    if (chave === 'name') continue;
    if (Object.keys(params).length >= GA4_LIMITS.paramsPerEvent) {
      descartados.push(chave);
      continue;
    }
    if (chave.length > GA4_LIMITS.paramName || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(chave)) {
      descartados.push(chave);
      continue;
    }
    if (typeof valor === 'number') {
      if (!Number.isFinite(valor)) descartados.push(chave);
      else params[chave] = Math.round(valor * 100) / 100;
      continue;
    }
    if (typeof valor === 'boolean') {
      params[chave] = valor;
      continue;
    }
    if (typeof valor === 'string') {
      const limpo = valor.trim();
      if (!limpo || looksPersonal(limpo)) descartados.push(chave);
      else params[chave] = limpo;
      continue;
    }
    descartados.push(chave);
  }
  return { params, descartados };
}

/** Traduz um evento do app para o formato do GA4. `null` quando o nome não serve. */
export function toAnalyticsEvent(event: TelemetryEvent): { payload: AnalyticsPayload; descartados: string[] } | null {
  if (!isValidEventName(event.name)) return null;
  const { params, descartados } = sanitizeParams(event as unknown as Record<string, unknown>);
  return { payload: { name: event.name, params }, descartados };
}

/**
 * Filtra as propriedades de usuário.
 *
 * Os limites são mais apertados que os de evento (24 e 36 caracteres), e o Firebase também
 * descarta em silêncio. Booleano vira `'sim'`/`'nao'`: o GA4 só guarda texto em propriedade.
 */
export function toUserProperties(props: TelemetryUserProps): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null) continue;
    if (chave.length > GA4_LIMITS.userPropertyName) continue;
    const texto = typeof valor === 'boolean' ? (valor ? 'sim' : 'nao') : String(valor).trim();
    if (!texto || looksPersonal(texto) || texto.length > GA4_LIMITS.userPropertyValue) continue;
    out[chave] = texto;
  }
  return out;
}

/**
 * O caminho do expo-router vira nome de tela.
 *
 * Duas coisas acontecem aqui. A primeira é cosmética: `/match/whoami-end` fica `match_whoami_end`,
 * porque o GA4 não aceita barra nem hífen. A segunda importa de verdade — **o caminho pode conter
 * dado da sala**: `/j/4827` é um código de sala, e `/u/andre` é um nome de usuário. Esses trechos
 * são trocados por um marcador, senão o painel de telas viraria uma lista de códigos e perfis.
 */
export function toScreenName(pathname: string): string {
  const partes = pathname
    .split('/')
    .filter(Boolean)
    // `(tabs)` e `(auth)` são grupos de rota do expo-router, não telas.
    .filter((p) => !/^\(.*\)$/.test(p))
    // Código de sala (4 dígitos) e username viram marcador: identificam uma sala ou uma pessoa.
    // `id` e não `:id`: os dois-pontos cairiam na limpeza abaixo e virariam underscore duplicado.
    .map((p, i, lista) => (/^\d{4}$/.test(p) || (i > 0 && (lista[i - 1] === 'u' || lista[i - 1] === 'j' || lista[i - 1] === 'game')) ? 'id' : p));

  const nome = (partes.join('_') || 'inicio').replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return nome.slice(0, GA4_LIMITS.eventName) || 'inicio';
}
