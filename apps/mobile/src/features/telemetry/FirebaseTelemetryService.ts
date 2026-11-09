import { features } from '@/core/config/features';
import { logger } from '@/core/logging/logger';

import { decideCollection, describeCollection, type TelemetryDecision } from './consent';
import { toAnalyticsEvent, toScreenName, toUserProperties, type ScreenName, type TelemetryEvent, type TelemetryUserProps } from './events';
import { loadFirebaseSdk, type FirebaseSdk } from './sdk';
import type { TelemetryService } from './TelemetryService';

/**
 * Firebase de verdade: Analytics, Crashlytics e Performance.
 *
 * ## Por que tudo aqui é defensivo
 *
 * O SDK é nativo e depende de dois arquivos que vêm do console do Firebase
 * (`google-services.json` e `GoogleService-Info.plist`). Sem eles o módulo não existe — e o app
 * **tem** de continuar funcionando. Telemetria é a última coisa que pode derrubar um jogo de
 * festa: ninguém perde a noite porque o Analytics caiu.
 *
 * Então: toda chamada vai dentro de um `tentar`, o SDK é carregado preguiçosamente, e qualquer
 * falha vira uma linha de log em desenvolvimento e silêncio em produção.
 *
 * ## A ordem importa
 *
 * `start()` é a primeira coisa que o app chama, antes dos outros serviços. É isso que faz o
 * Crashlytics capturar uma falha que aconteça na subida do Supabase ou do AdMob — se ele subisse
 * por último, justamente as falhas mais graves (as de inicialização) não seriam registradas.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Quantas migalhas guardar antes de o app quebrar. Além disso, o relatório fica ilegível. */
const MAX_MIGALHAS = 30;

export class FirebaseTelemetryService implements TelemetryService {
  private sdk: FirebaseSdk | null = null;
  private decisao: TelemetryDecision = { analytics: false, performance: false, crashes: false };
  /** Lê o interruptor de Ajustes sem importar o store (evita ciclo de import na subida). */
  private readonly optedIn: () => boolean;
  /** Traces abertos, para o encerramento ser idempotente. */
  private readonly traces = new Map<string, any>();
  /** As últimas ações antes de o app quebrar. É o rastro que explica a pilha. */
  private readonly migalhas: string[] = [];

  constructor(optedIn: () => boolean) {
    this.optedIn = optedIn;
  }

  /** Engole qualquer falha do SDK: telemetria nunca pode ser a causa de um app quebrado. */
  private tentar(onde: string, fn: () => unknown): void {
    try {
      const r = fn();
      if (r instanceof Promise) void r.catch((e: unknown) => logger.line(`📊 ${onde} falhou: ${String(e)}`));
    } catch (e) {
      logger.line(`📊 ${onde} falhou: ${String(e)}`);
    }
  }

  async start(): Promise<void> {
    this.sdk = loadFirebaseSdk();
    if (!this.sdk) {
      logger.line('📊 Firebase ausente (Expo Go, web ou build sem os arquivos de configuração)');
      return;
    }
    this.applyConsent();
  }

  /**
   * Aplica a decisão de coleta nos três produtos.
   *
   * Chamado na subida e a cada vez que o usuário mexe no interruptor. **Desligar de verdade**
   * importa: `setAnalyticsCollectionEnabled(false)` para o SDK de enviar, e não só de registrar.
   */
  applyConsent(): void {
    if (!this.sdk) return;
    const antes = this.decisao;
    this.decisao = decideCollection({ flagOn: features.telemetry, nativeAvailable: true, optedIn: this.optedIn() });
    const { analytics, crashlytics, perf } = this.sdk;

    this.tentar('consentimento', () => analytics().setAnalyticsCollectionEnabled(this.decisao.analytics));
    this.tentar('consentimento', () => {
      perf().dataCollectionEnabled = this.decisao.performance;
      perf().instrumentationEnabled = this.decisao.performance;
    });
    this.tentar('consentimento', () => crashlytics().setCrashlyticsCollectionEnabled(this.decisao.crashes));

    if (antes.analytics !== this.decisao.analytics || antes.crashes !== this.decisao.crashes) {
      logger.line(`📊 coletando: ${describeCollection(this.decisao)}`);
    }
  }

  track(event: TelemetryEvent): void {
    if (!this.sdk || !this.decisao.analytics) return;
    const pronto = toAnalyticsEvent(event);
    if (!pronto) return logger.line(`📊 evento recusado: "${event.name}" não serve para o GA4`);
    if (pronto.descartados.length) logger.line(`📊 ${event.name}: parâmetros descartados — ${pronto.descartados.join(', ')}`);
    this.tentar(`evento ${event.name}`, () => this.sdk!.analytics().logEvent(pronto.payload.name, pronto.payload.params));
    // A mesma troca de tela vira migalha no relatório de erro: é o rastro que explica a pilha.
    this.breadcrumb(event.name);
  }

  screen(name: ScreenName): void {
    const limpo = toScreenName(name);
    if (this.sdk && this.decisao.analytics) {
      this.tentar('tela', () => this.sdk!.analytics().logScreenView({ screen_name: limpo, screen_class: limpo }));
    }
    // Migalha mesmo com o Analytics desligado: ela fica no relatório de erro, que é sempre ligado.
    this.breadcrumb(`tela ${limpo}`);
  }

  /**
   * Identifica a pessoa pelo **id da conta**, nunca por e-mail ou nome.
   *
   * O id do Supabase é um UUID: ele liga os eventos de uma mesma pessoa entre sessões sem dizer
   * quem ela é. Mandar e-mail aqui seria enviar dado pessoal para o Analytics, o que a política de
   * privacidade nega — e o `looksPersonal` de `events.ts` existe justamente para pegar o acidente.
   */
  identify(userId: string | null): void {
    if (!this.sdk) return;
    this.tentar('identificação', () => this.sdk!.analytics().setUserId(this.decisao.analytics ? userId : null));
    // No Crashlytics o id entra sempre: é o que permite responder "esse travamento é de quem
    // escreveu reclamando?" sem nunca guardar o e-mail dessa pessoa.
    this.tentar('identificação', () => this.sdk!.crashlytics().setUserId(userId ?? ''));
  }

  setUserProps(props: TelemetryUserProps): void {
    if (!this.sdk) return;
    const limpo = toUserProperties(props);
    if (this.decisao.analytics) {
      for (const [chave, valor] of Object.entries(limpo)) {
        this.tentar('propriedade', () => this.sdk!.analytics().setUserProperty(chave, valor));
      }
    }
    // No relatório de erro elas viram chaves: "era premium?", "estava no backend simulado?".
    this.tentar('propriedade', () => this.sdk!.crashlytics().setAttributes(limpo));
  }

  recordError(error: unknown, contexto: string): void {
    if (!this.sdk || !this.decisao.crashes) return;
    const erro = error instanceof Error ? error : new Error(String(error));
    this.tentar('erro', () => {
      this.sdk!.crashlytics().log(contexto);
      this.sdk!.crashlytics().recordError(erro, contexto);
    });
  }

  breadcrumb(mensagem: string): void {
    if (!this.sdk || !this.decisao.crashes) return;
    this.migalhas.push(mensagem);
    if (this.migalhas.length > MAX_MIGALHAS) this.migalhas.shift();
    this.tentar('migalha', () => this.sdk!.crashlytics().log(mensagem));
  }

  /**
   * Um trace de desempenho.
   *
   * Encerramento idempotente de propósito: num jogo de festa a pessoa sai da tela no meio das
   * coisas, e um trace que exigisse encerramento disciplinado acumularia objeto nativo aberto até
   * a sessão acabar. Chamar duas vezes, ou nunca, não quebra nada.
   */
  startTrace(name: string): () => void {
    if (!this.sdk || !this.decisao.performance) return () => {};
    const chave = `${name}:${Date.now()}:${this.traces.size}`;
    // A vaga é reservada ANTES de abrir o trace nativo, que é assíncrono. Sem isso, a tela que
    // encerra rápido tiraria a chave antes de ela existir, e o trace ficaria aberto para sempre.
    this.traces.set(chave, null);
    this.tentar(`trace ${name}`, async () => {
      const trace = await this.sdk!.perf().startTrace(name);
      // Encerrou antes de o trace nativo abrir? Então ele nasce e morre aqui.
      if (this.traces.has(chave)) this.traces.set(chave, trace);
      else void trace.stop();
    });

    let encerrado = false;
    return () => {
      if (encerrado) return;
      encerrado = true;
      const trace = this.traces.get(chave);
      this.traces.delete(chave);
      if (trace) this.tentar(`trace ${name}`, () => trace.stop());
    };
  }
}
