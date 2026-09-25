import { router } from 'expo-router';

import { routes } from '@/core/navigation/routes';
import { services } from '@/services';

/**
 * Sair de uma partida que acabou, com a chance de um anúncio no caminho.
 *
 * A ordem aqui não é detalhe. **Primeiro sai da sala, depois o anúncio**: fosse o contrário, o
 * jogador ficaria ocupando a vaga dele na sala enquanto assiste, e o resto do grupo esperando
 * por alguém que já foi embora.
 *
 * É o único lugar do app que dispara intersticial — ver `adPolicy.ts` para o porquê.
 */
export async function exitAfterMatch(gameId: string | undefined, sair: () => void | Promise<void>): Promise<void> {
  await sair();
  void services.ads.maybeShow('fim-de-partida', gameId);
}

/** Atalho para os jogos locais, que não têm sala para deixar. */
export function exitLocalMatch(gameId: string, limpar: () => void): void {
  void exitAfterMatch(gameId, () => {
    limpar();
    router.replace(routes.explore);
  });
}
