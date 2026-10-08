import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { routeForSnapshot } from '../matchRoute';
import { useSnapshot } from '../store/matchStore';

/**
 * Navegação dirigida pelo servidor: quando a fase (ou a rodada) muda, todos os
 * celulares trocam de tela juntos — host e convidados usam o mesmo caminho.
 * Transições locais dentro da mesma fase (Resultado → Placar) são feitas pela própria tela.
 */
export function useMatchNavigator() {
  const snapshot = useSnapshot();
  const target = snapshot ? routeForSnapshot(snapshot) : null;
  const key = snapshot ? `${target}#${snapshot.room.roundIndex}` : null;
  const pathname = usePathname();

  useEffect(() => {
    if (target && target !== pathname) router.replace(target);
    // `key` inclui a rodada: role_reveal da rodada 2 precisa re-navegar mesmo vindo do placar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
