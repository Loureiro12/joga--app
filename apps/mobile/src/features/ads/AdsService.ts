import { logger } from '@/core/logging/logger';

import { canShowAd, type AdPlacement } from './adPolicy';
import { adsState } from './adsStore';

/**
 * A fronteira entre o app e a rede de anúncios.
 *
 * O app inteiro fala só com esta interface. Isso mantém o SDK fora das telas (ele é nativo, não
 * roda no Expo Go nem na web) e deixa a política de exibição num lugar só, testável.
 */
export interface AdsService {
  /** Prepara o SDK e resolve o consentimento. Chamado uma vez, na subida do app. */
  start(): Promise<void>;
  /**
   * Mostra um anúncio **se a política deixar**. Nunca lança e nunca trava a navegação: o usuário
   * já está a caminho da próxima tela quando isto é chamado.
   */
  maybeShow(placement: AdPlacement, gameId: string | undefined): Promise<void>;
}

/**
 * O que roda enquanto não há conta no AdMob, no Expo Go e na web.
 *
 * Não é enfeite: é com ele que dá para conferir *onde* e *quando* o anúncio apareceria, sem
 * SDK nativo e sem risco de clique inválido. Em dev, a decisão sai no terminal.
 */
export class MockAdsService implements AdsService {
  async start(): Promise<void> {
    // Sem rede de anúncios não há o que perguntar: o consentimento se dá por resolvido para a
    // política não travar o resto. Quem resolve de verdade é o serviço do Google.
    adsState.setConsentResolved(true);
    logger.line('📺 anúncios simulados (sem SDK)');
  }

  async maybeShow(placement: AdPlacement, gameId: string | undefined): Promise<void> {
    const decisao = canShowAd(placement, adsState.gate(gameId));
    if (!decisao.show) return logger.line(`📺 sem anúncio em "${placement}": ${decisao.reason}`);
    adsState.markShown(Date.now());
    logger.line(`📺 anúncio em "${placement}" (simulado)`);
  }
}
