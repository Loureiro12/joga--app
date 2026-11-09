/**
 * Quem pode coletar o quê, e por quê.
 *
 * Puro de propósito: é a regra que a política de privacidade do site descreve em português, e as
 * duas têm de dizer a mesma coisa. Mudar uma sem a outra é o jeito mais fácil de o app passar a
 * fazer algo que o texto legal nega.
 *
 * ## Os três produtos não têm o mesmo peso, e por isso não têm a mesma regra
 *
 * **Analytics e Performance medem comportamento**: que telas a pessoa abre, quanto tempo cada
 * coisa leva, qual jogo ela escolhe. É disso que uma pessoa pode legitimamente não querer
 * participar, então é isso que o interruptor de Ajustes controla — e é isso que a LGPD e o GDPR
 * esperam que seja opcional e reversível.
 *
 * **Crashlytics registra o app quebrando.** Não traça comportamento, não alimenta anúncio, não
 * sai da Google para ninguém: é o que permite descobrir que a Bomba-Relógio derruba o app em
 * certo aparelho Android. Fica sempre ligado, e a política diz isso com essas palavras — chamar o
 * interruptor de "ajudar a melhorar o app" e deixar o relatório de erro de fora dele seria
 * enganoso, então o interruptor se chama "dados de uso" e o texto explica o resto.
 *
 * Se um dia o relatório de erro passar a carregar algo além de pilha, aparelho e versão, esta
 * decisão precisa ser revista — e o teste que acompanha este arquivo é o lugar de olhar primeiro.
 */

export type TelemetryGate = {
  /** A flag do build. Desligada, nada sobe — nem Crashlytics. */
  flagOn: boolean;
  /**
   * O módulo nativo existe? Na web e no Expo Go, não.
   *
   * Não é detalhe de implementação: é a razão de o app nunca poder *assumir* que tem telemetria.
   * O harness de navegador do projeto roda em cima da web.
   */
  nativeAvailable: boolean;
  /** O usuário aceitou compartilhar dados de uso (Ajustes). Padrão: sim. */
  optedIn: boolean;
};

export type TelemetryDecision = {
  analytics: boolean;
  performance: boolean;
  crashes: boolean;
};

export function decideCollection(gate: TelemetryGate): TelemetryDecision {
  if (!gate.flagOn || !gate.nativeAvailable) return { analytics: false, performance: false, crashes: false };
  return { analytics: gate.optedIn, performance: gate.optedIn, crashes: true };
}

/** Em texto, para a tela de Ajustes e para o log de desenvolvimento dizerem a mesma coisa. */
export function describeCollection(d: TelemetryDecision): string {
  if (!d.crashes) return 'telemetria desligada';
  return d.analytics ? 'uso, desempenho e erros' : 'só relatórios de erro';
}
