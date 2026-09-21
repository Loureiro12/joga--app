/** Configuração lida do ambiente uma única vez, com validação — falha cedo se algo estiver errado. */
export type AuthMode = 'supabase' | 'dev' | 'supabase+dev';

export type Config = {
  port: number;
  env: 'development' | 'test' | 'production';
  /**
   * `supabase`: só tokens reais. `dev`: só tokens `dev:<id>` (testes, bots).
   * `supabase+dev`: os dois — para jogar no celular com login real e encher a sala com bots.
   */
  authMode: AuthMode;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** Chave SECRETA (service role). Só o servidor a conhece; é o que permite gravar o histórico. */
  supabaseServiceRoleKey: string | null;
  /** Pasta onde o estado das salas é gravado para sobreviver a reinícios. `null` = só memória. */
  storeDir: string | null;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(source.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT inválida: ${source.PORT}`);

  const env = source.NODE_ENV ?? 'development';
  if (env !== 'development' && env !== 'test' && env !== 'production') throw new Error(`NODE_ENV inválido: ${env}`);

  const supabaseUrl = source.SUPABASE_URL?.replace(/\/$/, '') || null;
  const supabaseAnonKey = source.SUPABASE_ANON_KEY || null;
  const authMode = (source.AUTH_MODE ?? (supabaseUrl ? 'supabase' : 'dev')) as AuthMode;
  if (!['supabase', 'dev', 'supabase+dev'].includes(authMode)) throw new Error(`AUTH_MODE inválido: ${authMode}`);
  if (authMode !== 'dev' && (!supabaseUrl || !supabaseAnonKey)) throw new Error('AUTH_MODE com supabase exige SUPABASE_URL e SUPABASE_ANON_KEY');
  // Token de dev é "confie em mim, eu sou o usuário X": jamais em produção.
  if (env === 'production' && authMode !== 'supabase') throw new Error('Em produção AUTH_MODE tem que ser "supabase"');

  return { port, env, authMode, supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY || null, storeDir: source.ROOM_STORE_DIR || null };
}
