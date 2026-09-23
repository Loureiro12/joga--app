import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { logScreen } from './logger';

/**
 * Registra cada tela em que a pessoa entra. Montado uma vez no layout raiz.
 *
 * Fica ligado ao `pathname` do expo-router em vez de a cada tela chamar um log próprio: assim
 * nenhuma tela nova precisa lembrar de nada, e redirecionamentos (como o do fluxo de partida,
 * que troca de tela sozinho) também aparecem.
 */
export function useScreenLogger() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    // O expo-router reavalia os params sem a rota mudar; só a troca de tela interessa.
    if (pathname === anterior.current) return;
    anterior.current = pathname;
    logScreen(pathname, params);
  }, [pathname, params]);
}
