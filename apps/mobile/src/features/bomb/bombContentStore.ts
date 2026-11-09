import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { logger } from '@/core/logging/logger';
import { persistStorage } from '@/core/utils/storage';

import { services } from '@/services';

import {
  MEMORIA_VAZIA,
  PEDIDO,
  absorver,
  assinatura,
  avoidTexts,
  contentFor,
  remember,
  shouldPrefetch,
  type Memoria,
  type Opcoes,
} from './contentMemory';

import { EMPTY_BOMB_CONTENT, type BombContent, type BombState } from '@jogae/engine';

/**
 * O encanamento da memória de conteúdo: disco, rede e o estado reativo da tela.
 *
 * As decisões estão em `contentMemory.ts`, puro e testado — mesmo corte de `adPolicy.ts` ×
 * `adsStore.ts`. Aqui fica só o que não dá para testar sem um aparelho.
 *
 * ## A regra que manda em tudo: a rodada nunca espera
 *
 * `contentFor` é síncrona e devolve o que já está na mão. Quem busca é `prefetch`, que roda em
 * segundo plano enquanto o grupo ainda escolhe as opções, e falha em silêncio. Rede ruim,
 * servidor fora, chave sem crédito, avião — em todos esses casos o jogo é exatamente o que era
 * antes desta feature existir. Uma tela de "gerando desafios…" entre o grupo e a bomba seria uma
 * piora, não uma melhora.
 */

export const useBombContentStore = create<Memoria>()(
  persist((): Memoria => MEMORIA_VAZIA, {
    name: 'jogae.bomb.content',
    storage: persistStorage,
    partialize: ({ seenIds, challenges, themes }) => ({ seenIds, challenges, themes }),
  }),
);

/** Última busca por configuração, e se há uma em curso. Controle de rede, não estado de tela. */
const buscas = new Map<string, number>();
let buscando = false;

export const bombContent = {
  /** O conteúdo para esta partida, agora. Chamada no instante em que a partida é criada. */
  contentFor(opcoes: Opcoes): BombContent {
    const memoria = useBombContentStore.getState();
    if (!memoria.seenIds.length && !memoria.challenges.length && !memoria.themes.length) return EMPTY_BOMB_CONTENT;
    return contentFor(memoria, opcoes);
  },

  /**
   * Busca conteúdo novo em segundo plano, se fizer sentido.
   *
   * Chamada da tela de preparação a cada mudança de opção. Ninguém a espera: se der certo, a
   * próxima partida tem mais carta; se não, ninguém percebe.
   */
  async prefetch(opcoes: Opcoes, bankCount: number): Promise<void> {
    const chave = assinatura(opcoes);
    const memoria = useBombContentStore.getState();
    if (!shouldPrefetch(memoria, opcoes, bankCount, { buscando, ultimaBusca: buscas.get(chave) ?? null, agora: Date.now() })) return;

    buscas.set(chave, Date.now());
    buscando = true;
    try {
      const novo = await services.bombContent.generate({
        variant: opcoes.variant,
        categories: opcoes.categories,
        difficulties: opcoes.difficulties,
        count: PEDIDO,
        avoidTexts: avoidTexts(memoria, opcoes),
      });

      const depois = absorver(useBombContentStore.getState(), novo);
      if (depois === memoria) return;
      useBombContentStore.setState(depois);
      logger.line(`🤖 conteúdo da bomba: +${novo.challenges.length} desafios, +${novo.themes.length} temas`);
    } catch (e) {
      // Em silêncio, de propósito. Sem conteúdo gerado o jogo é o que sempre foi.
      logger.line(`🤖 conteúdo da bomba falhou (segue com o banco local): ${String(e)}`);
    } finally {
      buscando = false;
    }
  },

  /**
   * Guarda o que a partida usou.
   *
   * No fim, e não a cada rodada: uma partida abandonada no meio não deveria queimar cartas que o
   * grupo mal viu.
   */
  remember(match: BombState): void {
    useBombContentStore.setState((s) => remember(s, match.usedChallengeIds));
  },
};
