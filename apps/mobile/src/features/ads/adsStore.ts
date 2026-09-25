import AsyncStorage from '@react-native-async-storage/async-storage';

import { usePremiumStore } from '@/features/premium/premiumStore';

import type { AdGate } from './adPolicy';

/**
 * O pouco que a política precisa lembrar entre uma sessão e outra: quantas partidas o grupo já
 * jogou e quando foi o último anúncio.
 *
 * Fica fora do zustand de propósito. Isto é lido no meio de uma navegação, uma vez, e nenhuma
 * tela renderiza a partir daqui — um store reativo só serviria para causar render à toa.
 */
const CHAVE = 'jogae.ads';

type Persistido = { matchesPlayed: number; lastShownAt: number | null };

let memoria: Persistido = { matchesPlayed: 0, lastShownAt: null };
let consentResolved = false;

const salvar = () => void AsyncStorage.setItem(CHAVE, JSON.stringify(memoria)).catch(() => {});

export const adsState = {
  /** Lê o que ficou da última sessão. Falha em silêncio: sem isto, o app só mostra menos anúncio. */
  async load(): Promise<void> {
    try {
      const bruto = await AsyncStorage.getItem(CHAVE);
      if (!bruto) return;
      const lido = JSON.parse(bruto) as Partial<Persistido>;
      memoria = {
        matchesPlayed: Number.isFinite(lido.matchesPlayed) ? Number(lido.matchesPlayed) : 0,
        lastShownAt: typeof lido.lastShownAt === 'number' ? lido.lastShownAt : null,
      };
    } catch {
      /* dado corrompido: começa do zero */
    }
  },

  setConsentResolved(value: boolean) {
    consentResolved = value;
  },

  /** Uma partida terminou. É o contador que segura o anúncio nas primeiras vezes. */
  countMatch() {
    memoria = { ...memoria, matchesPlayed: memoria.matchesPlayed + 1 };
    salvar();
  },

  markShown(at: number) {
    memoria = { ...memoria, lastShownAt: at };
    salvar();
  },

  gate(gameId: string | undefined): AdGate {
    return {
      now: Date.now(),
      lastShownAt: memoria.lastShownAt,
      matchesPlayed: memoria.matchesPlayed,
      gameId,
      // Hoje sempre `false`. Quando o premium entrar, "sem anúncios" já funciona daqui.
      isPremium: usePremiumStore.getState().isPremium,
      consentResolved,
    };
  },

  /** Só para teste: devolve o estado ao zero. */
  reset() {
    memoria = { matchesPlayed: 0, lastShownAt: null };
    consentResolved = false;
  },
};
