import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { services } from '@/services';

import { logScreen } from './logger';

/**
 * Registra cada tela em que a pessoa entra. Montado uma vez no layout raiz.
 *
 * Fica ligado ao `pathname` do expo-router em vez de a cada tela chamar um log próprio: assim
 * nenhuma tela nova precisa lembrar de nada, e redirecionamentos (como o do fluxo de partida,
 * que troca de tela sozinho) também aparecem.
 *
 * É também o `screen_view` do Analytics e a migalha do relatório de erro. O caminho passa por
 * `toScreenName` antes de sair do aparelho, porque **ele pode conter dado da sala**: `/j/4827` é
 * um código de sala e `/u/andre` é um nome de usuário. Os dois viram marcador.
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
    services.telemetry.screen(pathname);
  }, [pathname, params]);
}
