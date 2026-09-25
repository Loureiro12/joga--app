import { Platform } from 'react-native';

import { logger } from '@/core/logging/logger';

import type { AdsService } from './AdsService';
import { canShowAd, type AdPlacement } from './adPolicy';
import { adsState } from './adsStore';

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

/** Ids de teste do próprio Google. Servem anúncio falso, sem risco de clique inválido. */
const TESTE = {
  android: 'ca-app-pub-3940256099942544/1033173712',
  ios: 'ca-app-pub-3940256099942544/4411468910',
};

const unidadeIntersticial = (): string => {
  const real = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL;
  // Em dev, o id real é ignorado de propósito. Um clique seu num anúncio de verdade derruba a conta.
  if (!real || __DEV__) return Platform.OS === 'ios' ? TESTE.ios : TESTE.android;
  return real;
};

/**
 * `require` em vez de `import`: o módulo pode não existir (Expo Go, web, build sem o plugin),
 * e nesse caso o app precisa seguir funcionando sem anúncio nenhum.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
function carregarSdk(): any | null {
  try {
    return require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
}

export class GoogleAdsService implements AdsService {
  private sdk: any = null;
  private anuncio: any = null;
  private carregando = false;

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
   * Consentimento (LGPD/GDPR) e, no iOS, o pedido de rastreamento.
   *
   * Sem resposta do usuário a política não mostra nada — é ela que garante que nenhum anúncio
   * aparece antes de o app ter perguntado.
   */
  private async resolverConsentimento(): Promise<void> {
    const { AdsConsent } = this.sdk;
    try {
      const info = await AdsConsent.requestInfoUpdate();
      if (info.isConsentFormAvailable) await AdsConsent.showFormIfRequired();
    } catch (e) {
      logger.line(`📺 consentimento não concluído: ${String(e)}`);
    } finally {
      // Mesmo sem formulário (fora da UE, por exemplo) o fluxo está resolvido: segue com
      // anúncio não personalizado, que é o padrão sem consentimento explícito.
      adsState.setConsentResolved(true);
    }
  }

  /** Um intersticial fica carregado na manga: pedir na hora deixaria a tela esperando. */
  private precarregar(): void {
    if (!this.sdk || this.carregando) return;
    const { InterstitialAd, AdEventType } = this.sdk;
    this.carregando = true;
    const anuncio = InterstitialAd.createForAdRequest(unidadeIntersticial(), { requestNonPersonalizedAdsOnly: true });
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
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
