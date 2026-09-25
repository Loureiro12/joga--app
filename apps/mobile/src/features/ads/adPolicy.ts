/**
 * Quando o Jogaê pode mostrar um anúncio — e, principalmente, quando não pode.
 *
 * Mora num arquivo próprio, sem React e sem SDK, por dois motivos: a regra é a parte que erra
 * feio (anúncio na hora errada estraga a noite de um grupo inteiro, não de um usuário), e assim
 * ela dá para testar sem carregar tela nem rede.
 *
 * A regra que vale acima de todas as outras:
 *
 * > **O anúncio só entra quando o grupo já se desfez.** Nunca durante uma partida, nunca entre
 * > rodadas — só depois que ela acabou e alguém está saindo para o catálogo.
 *
 * O motivo é que este app não é jogado sozinho. Em quatro jogos os celulares estão sincronizados
 * pelo servidor: uma tela cheia no meu aparelho enquanto os outros cinco avançam me devolve numa
 * tela diferente da de todo mundo. E na Bomba-Relógio seria pior que chato — o pavio é um
 * instante absoluto e continua queimando atrás do anúncio, então a pessoa perderia a rodada
 * por causa do app.
 */

/** Onde um anúncio pode aparecer. Cada valor é um ponto do código, não uma tela genérica. */
export type AdPlacement =
  /** Saindo da partida acabada para o catálogo. O único intersticial do app. */
  | 'fim-de-partida';

/**
 * Jogos que nunca mostram anúncio, por decisão de produto.
 *
 * O Entre Nós é uma conversa de casal sobre coisas pessoais. A tela seguinte ser um anúncio
 * destrói a confiança que o jogo inteiro depende de construir — e nenhuma receita paga isso.
 */
export const ADS_NEVER_IN: readonly string[] = ['entre-nos'];

/** Intervalo mínimo entre dois anúncios. Uma partida curta seguida da outra não rende dois. */
export const AD_COOLDOWN_MS = 3 * 60_000;

/** Quantas partidas o grupo joga antes do primeiro anúncio. A primeira experiência fica limpa. */
export const AD_FIRST_AFTER_MATCHES = 2;

export type AdGate = {
  now: number;
  /** Quando o último anúncio foi mostrado nesta instalação. `null` se nunca. */
  lastShownAt: number | null;
  /** Partidas terminadas desde que o app foi instalado. */
  matchesPlayed: number;
  /** Id do jogo no catálogo (`impostor`, `entre-nos`…). */
  gameId: string | undefined;
  /** Assinante não vê anúncio. Hoje sempre `false`; quando o premium entrar, é só ligar. */
  isPremium: boolean;
  /** O usuário já respondeu ao pedido de consentimento? Sem resposta, nada é mostrado. */
  consentResolved: boolean;
};

export type AdDecision = { show: true } | { show: false; reason: string };

/** Decide se cabe um anúncio agora. A razão do "não" volta junto, para o log de dev explicar. */
export function canShowAd(placement: AdPlacement, gate: AdGate): AdDecision {
  if (gate.isPremium) return { show: false, reason: 'assinante' };
  if (!gate.consentResolved) return { show: false, reason: 'consentimento pendente' };
  if (gate.gameId && ADS_NEVER_IN.includes(gate.gameId)) return { show: false, reason: `${gate.gameId} nunca mostra anúncio` };
  if (gate.matchesPlayed < AD_FIRST_AFTER_MATCHES) return { show: false, reason: `só a partir da ${AD_FIRST_AFTER_MATCHES}ª partida` };
  if (gate.lastShownAt !== null && gate.now - gate.lastShownAt < AD_COOLDOWN_MS) return { show: false, reason: 'ainda no intervalo' };
  void placement;
  return { show: true };
}
