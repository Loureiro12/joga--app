import { services } from '@/services';

import { logger } from './logger';

/**
 * O que acontece com um erro que ninguém pegou.
 *
 * Sem isto, um erro de JavaScript em produção some: o React Native mostra a tela vermelha só em
 * desenvolvimento, e em produção o app ou fecha ou fica numa tela quebrada sem ninguém saber.
 * O Crashlytics captura travamento **nativo** por conta própria, mas erro de JavaScript é outra
 * camada — ele precisa ser entregue de dentro do JS, e é isto que este arquivo faz.
 *
 * Chamado uma vez, no layout raiz, depois de os serviços subirem.
 */

type HandlerGlobal = (error: unknown, isFatal?: boolean) => void;
type ComErrorUtils = { ErrorUtils?: { getGlobalHandler?: () => HandlerGlobal; setGlobalHandler?: (h: HandlerGlobal) => void } };

let instalado = false;

export function installGlobalErrorReporting(): void {
  if (instalado) return;
  instalado = true;

  const utils = (globalThis as unknown as ComErrorUtils).ErrorUtils;
  if (!utils?.setGlobalHandler) return;

  // O handler anterior é o do React Native, e ele é que mostra a tela vermelha em dev e encerra o
  // app no fatal. Substituí-lo sem chamar de volta trocaria "o app quebrou e eu vi" por "o app
  // ficou estranho e ninguém soube".
  const anterior = utils.getGlobalHandler?.();

  utils.setGlobalHandler((error, isFatal) => {
    try {
      services.telemetry.recordError(error, isFatal ? 'erro fatal de JavaScript' : 'erro de JavaScript');
      logger.line(`💥 ${isFatal ? 'fatal' : 'erro'}: ${String(error)}`);
    } catch {
      /* reportar não pode piorar a situação */
    }
    anterior?.(error, isFatal);
  });
}
