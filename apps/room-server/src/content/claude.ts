import Anthropic from '@anthropic-ai/sdk';

import type { Config } from '../config';

/**
 * O cliente da API do Claude, compartilhado pelos geradores de conteúdo.
 *
 * Existe para o modelo e o esforço morarem num lugar só. São os dois parâmetros que se mexe junto
 * quando o custo incomoda, e deixá-los duplicados por gerador é garantir que um dia um deles fique
 * para trás sem ninguém notar.
 */

/** O modelo não pode demorar mais que isso: o app desiste e usa o banco local, o que já é aceitável. */
const TIMEOUT_MS = 25_000;

export type Claude = {
  client: Anthropic;
  /**
   * Esforço baixo, sem raciocínio estendido: escrever uma lista de frases curtas não é tarefa
   * difícil, e esforço alto aqui só custaria tempo de espera. A qualidade vem do prompt e da
   * portaria, não de o modelo pensar mais.
   */
  comum: { model: string; max_tokens: number; output_config: { effort: 'low' } };
};

/** `null` quando não há chave: é o estado normal em dev, e o jogo roda com o banco local. */
export function createClaude(config: Config): Claude | null {
  if (!config.anthropicApiKey) return null;
  return {
    client: new Anthropic({ apiKey: config.anthropicApiKey, timeout: TIMEOUT_MS, maxRetries: 1 }),
    comum: { model: 'claude-opus-5-5', max_tokens: 8000, output_config: { effort: 'low' } },
  };
}
