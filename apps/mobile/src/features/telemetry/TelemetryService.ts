import { logger } from '@/core/logging/logger';

import { describeCollection, type TelemetryDecision } from './consent';
import { toAnalyticsEvent, toScreenName, toUserProperties, type ScreenName, type TelemetryEvent, type TelemetryUserProps } from './events';

/**
 * A fronteira entre o app e o Firebase.
 *
 * O app inteiro fala só com esta interface — nenhuma tela importa `@react-native-firebase/*`.
 * Isso mantém três coisas verdadeiras ao mesmo tempo: o SDK nativo fica fora da web e do Expo Go,
 * o catálogo de eventos fica num lugar só e testável, e trocar de provedor de telemetria um dia
 * é trocar uma classe.
 *
 * **Nenhum método desta interface lança, e nenhum é esperado por uma tela.** Telemetria que
 * derruba o app, ou que faz o usuário esperar, custa mais do que vale.
 */
export interface TelemetryService {
  /**
   * Sobe o SDK e aplica a decisão de coleta. Chamado primeiro na subida do app, antes do resto —
   * é o que permite ao Crashlytics capturar uma falha que aconteça na própria inicialização.
   */
  start(): Promise<void>;
  /** Reaplica a decisão de coleta. Chamado quando o usuário mexe no interruptor de Ajustes. */
  applyConsent(): void;
  /** Um evento do catálogo. */
  track(event: TelemetryEvent): void;
  /** Troca de tela. O nome já vem normalizado por `toScreenName`. */
  screen(name: ScreenName): void;
  /** Quem é o usuário, de forma pseudônima: o id da conta, nunca e-mail nem nome. */
  identify(userId: string | null): void;
  setUserProps(props: TelemetryUserProps): void;
  /**
   * Um erro que não derrubou o app, mas não deveria ter acontecido.
   *
   * `contexto` é texto curto e fixo do código ("sala: reconexão"), nunca conteúdo de usuário.
   */
  recordError(error: unknown, contexto: string): void;
  /** Uma migalha no relatório de erro: o que o app estava fazendo quando quebrou. */
  breadcrumb(mensagem: string): void;
  /**
   * Mede quanto algo demorou. Devolve a função que encerra a medição.
   *
   * Chamar o encerramento duas vezes, ou nunca, não quebra nada — num app de festa o usuário sai
   * da tela no meio das coisas, e um trace que exigisse encerramento disciplinado vazaria memória.
   */
  startTrace(name: string): () => void;
}

/**
 * O que roda na web, no Expo Go e em qualquer build sem Firebase configurado.
 *
 * Não é um vazio: em desenvolvimento ele imprime cada evento no terminal. É assim que se confere
 * *quais* eventos o app manda e *com que parâmetros*, sem painel, sem build nativo e sem poluir o
 * Analytics de verdade com dado de teste — que é o erro que mais atrapalha um painel novo.
 */
export class MockTelemetryService implements TelemetryService {
  async start(): Promise<void> {
    logger.line('📊 telemetria simulada (sem SDK nativo)');
  }

  applyConsent(): void {}

  track(event: TelemetryEvent): void {
    const pronto = toAnalyticsEvent(event);
    if (!pronto) return logger.line(`📊 evento recusado: "${event.name}" não serve para o GA4`);
    const { payload, descartados } = pronto;
    const corpo = Object.entries(payload.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    logger.line(`📊 ${payload.name}${corpo ? ` · ${corpo}` : ''}${descartados.length ? ` · descartados: ${descartados.join(',')}` : ''}`);
  }

  /**
   * Normaliza antes de registrar, igual ao serviço de verdade.
   *
   * Parece detalhe e não é: o log do simulado existe para mostrar **o que seria enviado**. Se ele
   * imprimisse o caminho cru, `/j/4827` apareceria no terminal com o código da sala e ninguém
   * notaria que o de verdade manda `j_id` — ou, pior, que um dia parou de normalizar.
   */
  screen(name: ScreenName): void {
    logger.line(`📊 tela ${toScreenName(name)}`);
  }

  identify(userId: string | null): void {
    logger.line(`📊 usuário ${userId ? 'identificado' : 'anônimo'}`);
  }

  setUserProps(props: TelemetryUserProps): void {
    const limpo = toUserProperties(props);
    logger.line(`📊 propriedades ${JSON.stringify(limpo)}`);
  }

  recordError(error: unknown, contexto: string): void {
    logger.line(`📊 erro registrado em "${contexto}": ${String(error)}`);
  }

  breadcrumb(mensagem: string): void {
    logger.line(`📊 · ${mensagem}`);
  }

  startTrace(name: string): () => void {
    const inicio = Date.now();
    return () => logger.line(`📊 ${name} levou ${Date.now() - inicio}ms`);
  }
}

/** Para o log dizer a mesma coisa que a política de privacidade. */
export const describeDecision = describeCollection;
export type { TelemetryDecision };
