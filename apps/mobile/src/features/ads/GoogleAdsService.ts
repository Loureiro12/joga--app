import { AppState, Platform } from 'react-native';

import { logger } from '@/core/logging/logger';

import type { TelemetryService } from '@/features/telemetry/TelemetryService';

import type { AdsService } from './AdsService';
import { canShowAd, type AdPlacement } from './adPolicy';
import { interstitialUnitId } from './adUnits';
import { adsState } from './adsStore';
import { loadAdsSdk } from './sdk';

/**
 * O AdMob de verdade.
 *
 * O SDK é **nativo**: não existe no Expo Go nem na web, e só entra no build depois de o config
 * plugin ser adicionado com um app id real. Por isso ele é carregado por `require` preguiçoso —
 * sem o módulo, este serviço vira um nada que não quebra nada, e o app continua rodando no Expo
 * Go como sempre rodou.
 *
 * Os ids vêm do ambiente, nunca do código: os de teste são o padrão, e é isso que impede o erro
 * mais caro de todos — servir anúncio de verdade em desenvolvimento e o AdMob banir a conta por
 * clique inválido.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const carregarSdk = (): any | null => loadAdsSdk() as any;

/** Respiro depois de o app ficar ativo. A splash sai, a primeira tela assenta, aí sim o prompt. */
const ASSENTAR_MS = 700;
/** Teto de espera. Se o app nunca ficar ativo, seguimos sem anúncio em vez de travar para sempre. */
const ESPERA_MAX_MS = 10_000;

/**
 * Espera o app estar de fato em primeiro plano.
 *
 * O iOS **só mostra o prompt do ATT com o app em estado `active`**. Chamado antes disso — e o
 * `useEffect` do layout raiz dispara com a splash ainda na tela — `requestTrackingPermissionsAsync`
 * volta em silêncio, sem mostrar nada. Foi assim que a revisão da Apple não encontrou o pedido.
 */
function esperarAppAtivo(): Promise<void> {
  if (AppState.currentState === 'active') return new Promise((r) => setTimeout(r, ASSENTAR_MS));
  return new Promise((resolve) => {
    const concluir = () => {
      clearTimeout(limite);
      sub.remove();
      setTimeout(resolve, ASSENTAR_MS);
    };
    const limite = setTimeout(() => {
      sub.remove();
      resolve();
    }, ESPERA_MAX_MS);
    const sub = AppState.addEventListener('change', (estado) => estado === 'active' && concluir());
  });
}

export class GoogleAdsService implements AdsService {
  /**
   * A telemetria chega pelo construtor, e não por import.
   *
   * `services/index.ts` importa esta classe; importar `@/services` de volta aqui fecharia um ciclo
   * que só quebra no build nativo — que é onde é mais caro descobrir.
   */
  constructor(private readonly telemetry: TelemetryService) {}

  private sdk: any = null;
  private anuncio: any = null;
  private carregando = false;
  /** O usuário consentiu com anúncio personalizado (UMP e, no iOS, também o ATT)? */
  private personalizado = false;
  /** Existe formulário para rever o consentimento? Só onde a lei exige — hoje, a UE. */
  private podeReverConsentimento = false;

  async start(): Promise<void> {
    const sdk = carregarSdk();
    if (!sdk) {
      logger.line('📺 SDK de anúncios ausente — o app segue sem anúncio');
      return;
    }
    this.sdk = sdk;

    try {
      // Ordem obrigatória: primeiro o app ativo, senão o prompt do ATT não aparece; depois o
      // consentimento; só então o SDK inicializa e passa a poder pedir anúncio.
      await esperarAppAtivo();
      await this.resolverConsentimento();
      await this.pedirRastreamento();
      await sdk.default().initialize();
      this.precarregar();
    } catch (e) {
      // Falha de anúncio nunca pode derrubar a subida do app.
      logger.line(`📺 falha ao iniciar anúncios: ${String(e)}`);
    }
  }

  /**
   * Consentimento, em duas perguntas que são de donos diferentes.
   *
   * 1. **UMP** (LGPD/GDPR): quem decide é o Google, pela região do usuário. Fora da Europa
   *    normalmente não há formulário nenhum — e aí `canRequestAds` já vem verdadeiro.
   * 2. **ATT** (só iOS): a permissão da Apple para usar o identificador de anúncio. Sem ela, o
   *    iOS serve só anúncio genérico, que paga bem menos. Vem DEPOIS do UMP porque é essa a
   *    ordem que o Google recomenda: o formulário dele é que explica para que serve.
   *
   * Quem manda no fim é o `canRequestAds` do UMP, e não "o formulário apareceu": é o sinal que
   * o próprio Google criou para dizer "pode pedir anúncio". Recusa vira ausência de anúncio,
   * em vez de anúncio servido assim mesmo.
   */
  private async resolverConsentimento(): Promise<void> {
    const { AdsConsent } = this.sdk;
    let podePedir = false;
    try {
      const info = await AdsConsent.gatherConsent();
      podePedir = Boolean(info?.canRequestAds);
      this.personalizado = info?.status === 'OBTAINED';
      this.podeReverConsentimento = info?.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (e) {
      logger.line(`📺 consentimento não concluído: ${String(e)}`);
    }

    adsState.setConsentResolved(podePedir);
    if (!podePedir) logger.line('📺 sem consentimento para pedir anúncio');
  }

  /**
   * O aviso da Apple. Recusar não tira o anúncio — tira só a personalização, e o app segue igual.
   * É por isso que a recusa aqui não mexe no `consentResolved`.
   *
   * **Pedido sempre no iOS**, e nunca atrás de uma condição. Antes ele só saía quando o UMP
   * dizia que dava para pedir anúncio; bastava uma falha de rede naquele instante para o prompt
   * jamais aparecer — e um app que declara rastreamento sem nunca pedir permissão é recusa certa
   * na revisão da App Store (Guideline 2.1).
   */
  private async pedirRastreamento(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    try {
      const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      // Já respondido alguma vez? O sistema não mostra de novo; não insistimos à toa.
      const atual = await getTrackingPermissionsAsync();
      const { status } = atual.canAskAgain ? await requestTrackingPermissionsAsync() : atual;
      logger.line(`📺 ATT: ${status}`);
      if (status !== 'granted') this.personalizado = false;
    } catch (e) {
      logger.line(`📺 ATT não concluído: ${String(e)}`);
      this.personalizado = false;
    }
  }

  /** Um intersticial fica carregado na manga: pedir na hora deixaria a tela esperando. */
  private precarregar(): void {
    if (!this.sdk || this.carregando) return;
    const { InterstitialAd, AdEventType } = this.sdk;
    this.carregando = true;
    // Só pede genérico quando NÃO há consentimento. Pedir genérico sempre seria pagar o custo de
    // perguntar e jogar fora a resposta.
    const anuncio = InterstitialAd.createForAdRequest(interstitialUnitId(), { requestNonPersonalizedAdsOnly: !this.personalizado });
    anuncio.addAdEventListener(AdEventType.LOADED, () => {
      this.anuncio = anuncio;
      this.carregando = false;
    });
    anuncio.addAdEventListener(AdEventType.ERROR, () => {
      this.anuncio = null;
      this.carregando = false;
    });
    anuncio.addAdEventListener(AdEventType.CLOSED, () => {
      // Fechou: já prepara o próximo, senão a segunda vez não teria o que mostrar.
      this.anuncio = null;
      this.precarregar();
    });
    anuncio.load();
  }

  hasPrivacyOptions(): boolean {
    return this.podeReverConsentimento;
  }

  async openPrivacyOptions(): Promise<void> {
    try {
      const info = await this.sdk?.AdsConsent?.showPrivacyOptionsForm();
      // A resposta pode ter mudado: o próximo anúncio já sai do jeito novo.
      this.personalizado = info?.status === 'OBTAINED';
      adsState.setConsentResolved(Boolean(info?.canRequestAds));
    } catch (e) {
      logger.line(`📺 opções de privacidade não abriram: ${String(e)}`);
    }
  }

  async maybeShow(placement: AdPlacement, gameId: string | undefined): Promise<void> {
    const decisao = canShowAd(placement, adsState.gate(gameId));
    if (!decisao.show) {
      // O motivo vai para o Analytics porque é a única forma de responder, do lado de fora, "por
      // que o anúncio não aparece?". Ele vem da política, que devolve texto curto e fechado.
      this.telemetry.track({ name: 'anuncio_pulado', placement, motivo: decisao.reason });
      return logger.line(`📺 sem anúncio em "${placement}": ${decisao.reason}`);
    }
    if (!this.anuncio) {
      // Sem anúncio carregado o app não espera: a pessoa segue, e a próxima vez terá um pronto.
      this.precarregar();
      this.telemetry.track({ name: 'anuncio_pulado', placement, motivo: 'nada carregado' });
      return logger.line(`📺 sem anúncio em "${placement}": nada carregado`);
    }
    try {
      adsState.markShown(Date.now());
      await this.anuncio.show();
      this.telemetry.track({ name: 'anuncio_mostrado', placement, gameId });
      logger.line(`📺 anúncio em "${placement}"`);
    } catch (e) {
      this.telemetry.recordError(e, 'anúncio: falha ao mostrar');
      logger.line(`📺 falha ao mostrar: ${String(e)}`);
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
