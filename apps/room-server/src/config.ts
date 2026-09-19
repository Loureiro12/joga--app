/** Configuração lida do ambiente uma única vez, com validação — falha cedo se algo estiver errado. */
export type Config = { port: number; env: 'development' | 'test' | 'production' };

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(source.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT inválida: ${source.PORT}`);
  const env = source.NODE_ENV ?? 'development';
  if (env !== 'development' && env !== 'test' && env !== 'production') throw new Error(`NODE_ENV inválido: ${env}`);
  return { port, env };
}
