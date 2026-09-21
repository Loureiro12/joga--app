import type { Config } from './config';

export type TokenVerifier = (token: string) => Promise<string | null>;

const DEV_TOKEN = /^dev:([A-Za-z0-9_-]{1,64})$/;

/**
 * Descobre de quem é o token. Devolve o id do usuário, ou `null` se o token não vale.
 *
 * Tokens do Supabase são conferidos perguntando ao próprio Auth (`GET /auth/v1/user`): uma chamada
 * por CONEXÃO (não por mensagem), funciona com qualquer esquema de assinatura do projeto e ainda
 * recusa usuário apagado ou sessão revogada — o que validar o JWT localmente não pega.
 */
export function createTokenVerifier(config: Config, fetchImpl: typeof fetch = fetch): TokenVerifier {
  const allowDev = config.authMode !== 'supabase';
  const allowSupabase = config.authMode !== 'dev';

  return async (token) => {
    const dev = DEV_TOKEN.exec(token);
    if (dev) return allowDev ? `dev-${dev[1]}` : null;
    if (!allowSupabase) return null;
    try {
      const res = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
        headers: { authorization: `Bearer ${token}`, apikey: config.supabaseAnonKey! },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const user = (await res.json()) as { id?: unknown };
      return typeof user.id === 'string' ? user.id : null;
    } catch {
      return null;
    }
  };
}
