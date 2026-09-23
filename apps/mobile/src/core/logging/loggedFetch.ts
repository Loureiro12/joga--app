import { logHttp, logger } from './logger';

/**
 * Envolve o `fetch` para registrar toda requisição que sai do app.
 *
 * Vai como `global.fetch` do cliente Supabase, então pega tudo de uma vez — login, perfil,
 * histórico, amigos e qualquer RPC — sem precisar instrumentar cada serviço na mão. Instrumentar
 * um a um deixaria buracos toda vez que alguém escrevesse uma chamada nova.
 *
 * O corpo nunca é impresso: em `/auth/v1/token` ele carrega a senha, e nos outros ele é grande
 * demais para caber numa linha. Quando a resposta é erro, o motivo devolvido pelo servidor entra,
 * porque é justamente o que se procura quando algo quebra.
 */
export function loggedFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    if (!logger.enabled) return base(input, init);

    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const startedAt = Date.now();

    try {
      const response = await base(input, init);
      // O corpo só pode ser lido uma vez: clona para não roubar a resposta de quem pediu.
      const motivo = response.ok ? undefined : await errorSummary(response);
      logHttp(method, url, response.status, startedAt, motivo);
      return response;
    } catch (error) {
      // Sem rede, DNS errado, servidor fora: não há status, e é o caso mais confuso de depurar.
      logHttp(method, url, 0, startedAt, String((error as Error)?.message ?? error));
      throw error;
    }
  };
}

/** Resumo do erro devolvido pelo servidor, curto o bastante para caber na linha. */
async function errorSummary(response: Response): Promise<string | undefined> {
  try {
    const texto = await response.clone().text();
    if (!texto) return undefined;
    const json = JSON.parse(texto) as Record<string, unknown>;
    const motivo = json.message ?? json.error_description ?? json.error ?? json.msg;
    return typeof motivo === 'string' ? `· ${motivo.slice(0, 120)}` : `· ${texto.slice(0, 120)}`;
  } catch {
    return undefined;
  }
}
