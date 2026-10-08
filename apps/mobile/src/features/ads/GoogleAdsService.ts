import { Platform } from 'react-native';

import { logger } from '@/core/logging/logger';

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

export class GoogleAdsService implements AdsService {
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
      await this.resolverConsentimento();
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

    if (Platform.OS === 'ios' && podePedir) await this.pedirRastreamento();
    adsState.setConsentResolved(podePedir);
    if (!podePedir) logger.line('📺 sem consentimento para pedir anúncio');
  }

  /**
   * O aviso da Apple. Recusar não tira o anúncio — tira só a personalização, e o app segue igual.
   * É por isso que a recusa aqui não mexe no `consentResolved`.
   */
  private async pedirRastreamento(): Promise<void> {
    try {
      const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      const { status } = await requestTrackingPermissionsAsync();
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
    if (!decisao.show) return logger.line(`📺 sem anúncio em "${placement}": ${decisao.reason}`);
    if (!this.anuncio) {
      // Sem anúncio carregado o app não espera: a pessoa segue, e a próxima vez terá um pronto.
      this.precarregar();
      return logger.line(`📺 sem anúncio em "${placement}": nada carregado`);
    }
    try {
      adsState.markShown(Date.now());
      await this.anuncio.show();
      logger.line(`📺 anúncio em "${placement}"`);
    } catch (e) {
      logger.line(`📺 falha ao mostrar: ${String(e)}`);
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
