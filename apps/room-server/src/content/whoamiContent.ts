import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

import { WHOAMI_CATEGORIES, sanitizeGeneratedIdentities, type Identity, type WhoamiContentRequest } from '@jogae/engine';

import type { Config } from '../config';

import { createClaude } from './claude';

/**
 * Geração de identidades do "Quem Sou Eu?" pela API do Claude.
 *
 * ## Por que gerar aqui vale mais do que na bomba
 *
 * Na bomba, cada carta era uma frase. Aqui cada identidade precisa de nome, emoji, categoria,
 * dificuldade, tipo, **aliases** e **duas dicas progressivas**. Na mão são 14 categorias × 12
 * identidades × 2 dicas, e as dicas são a parte caríssima — exatamente o que um modelo faz bem.
 *
 * ## Mas o banco local continua sendo o motor
 *
 * Identidade famosa não envelhece: Homem-Aranha é Homem-Aranha para sempre. Com 168 identidades e
 * a memória de "já vistos", um grupo de 8 pessoas joga quatro partidas inteiras sem repetir nada.
 * Então esta geração existe para três casos, não para o jogo normal: categoria única marcada, modo
 * Hardcore (que pede identidade específica) e grupo que já jogou muito.
 *
 * ## A otimização que mais importa é de QUANDO, não de como
 *
 * O app pede isto **no lobby**, enquanto as pessoas entram na sala — trinta a noventa segundos em
 * que ninguém está esperando nada. Na bomba eu tive que me contentar com "talvez chegue a tempo",
 * porque entre escolher as opções e acender o pavio não há tempo morto. Aqui há, e de sobra.
 */

const SISTEMA = `Você cria identidades secretas para o "Quem Sou Eu?", um jogo de festa brasileiro.

Como o jogo funciona: cada pessoa da roda recebe uma identidade que TODOS os outros veem e ela não. Ela faz perguntas de sim ou não ("sou uma pessoa real?", "apareço em filme?") até descobrir quem é. Se travar, pode pedir dica.

O critério NÚMERO UM é o reconhecimento. A identidade tem que ser conhecida por um brasileiro comum numa roda de amigos. Não é prova de cultura:
- BOM: Homem-Aranha, Pelé, Shrek, Geladeira, Pizza, Bob Esponja.
- RUIM: um personagem secundário de série cancelada, um cientista que só aparece em livro técnico, uma banda regional.

Sobre as DICAS — é a parte mais importante e a mais fácil de errar. Cada identidade leva duas dicas, nesta ordem:
- A primeira é uma característica, ainda vaga. Deixa a pessoa eliminar possibilidades, não acertar.
- A segunda é quase entrega: a marca registrada, o bordão, o detalhe que todo mundo lembra.

E a REGRA ABSOLUTA das dicas: **nenhuma dica pode conter o nome da identidade nem nenhum dos aliases**, em nenhuma forma. Nem parte do nome. Se a identidade é "Homem-Aranha", a dica não pode dizer "aranha", nem "teia de aranha", nem "Spider". Escreva "solto fios grudentos do pulso". Uma dica que entrega o nome não é uma dica fraca: é a rodada daquela pessoa estragada, e ela recebe a resposta justamente quando paga por uma pista.

Regras de forma:
- "name": como as pessoas chamam de verdade, 2 a 40 caracteres, sem ponto final.
- "aliases": outros jeitos de escrever o mesmo nome, porque o jogador DIGITA o chute. Nome em outro idioma, nome real do personagem, apelido, abreviação. Ex.: para Homem-Aranha, ["Spider-Man", "Peter Parker", "Aranha"]. Até 6. Lista vazia se o nome só tem um jeito de escrever.
- "kind": o que a identidade É — "pessoa" (pessoa real), "personagem" (fictício humano ou humanoide), "animal", "objeto", "lugar", "marca", "profissao", "comida". É dele que o jogo monta a primeira dica automaticamente, então precisa estar certo.
- "emoji": um emoji só, que represente a identidade.
- "hints": exatamente DUAS frases, cada uma de 28 a 130 caracteres, terminando em ponto.
- "difficulty": "facil" (criança reconhece), "medio" (adulto reconhece), "dificil" (precisa gostar do assunto).

Nunca use: pessoa privada ou anônima, identidade que humilha alguém, nazista ou ditador, criminoso, conteúdo sexual, drogas. É um jogo que roda na sala de casa, com criança por perto. Figura histórica entra pelo que construiu, não pelo que destruiu.

Escreva em português do Brasil. Fale sempre na primeira pessoa nas dicas, como se a identidade estivesse falando.`;

const DIFICULDADES = ['facil', 'medio', 'dificil'] as const;
const KINDS = ['pessoa', 'personagem', 'animal', 'objeto', 'lugar', 'marca', 'profissao', 'comida'] as const;

const IdentidadesSchema = z.object({
  identities: z.array(
    z.object({
      name: z.string(),
      emoji: z.string(),
      category: z.string(),
      difficulty: z.enum(DIFICULDADES),
      kind: z.enum(KINDS),
      aliases: z.array(z.string()),
      hints: z.array(z.string()),
    }),
  ),
});

export type IdentityGenerator = {
  generate(request: WhoamiContentRequest): Promise<{ identities: Identity[] }>;
};

/**
 * Pedir mais do que o grupo vai usar é de propósito: a portaria derruba identidade, e um lote com
 * folga ainda entrega o que foi pedido.
 */
const FOLGA = 1.5;

export function createIdentityGenerator(config: Config, registra: (event: string, data?: Record<string, unknown>) => void = () => {}): IdentityGenerator | null {
  const claude = createClaude(config);
  if (!claude) return null;

  const pedido = (request: WhoamiContentRequest): string => {
    const categorias = request.categories.length ? request.categories : [...WHOAMI_CATEGORIES];
    const linhas = [
      `Gere ${Math.ceil(request.count * FOLGA)} identidades novas.`,
      '',
      `Categorias permitidas (use exatamente estes nomes no campo "category", e distribua entre elas): ${categorias.join(' · ')}`,
      `Dificuldades permitidas (campo "difficulty"): ${request.difficulties.join(' · ')}`,
    ];
    if (request.avoidNames.length) {
      // O grupo já viu estas. Mandar a lista é mais barato e mais confiável do que esperar
      // originalidade espontânea — o modelo cai nos mesmos nomes óbvios a cada chamada.
      linhas.push('', 'Este grupo JÁ VIU as identidades abaixo. Não repita nenhuma delas:', ...request.avoidNames.map((n) => `- ${n}`));
    }
    return linhas.join('\n');
  };

  return {
    async generate(request) {
      const inicio = Date.now();
      try {
        const res = await claude.client.messages.parse({
          ...claude.comum,
          output_config: { ...claude.comum.output_config, format: zodOutputFormat(IdentidadesSchema) },
          system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: pedido(request) }],
        });

        const doModelo = res.parsed_output?.identities ?? [];
        const aceitas = sanitizeGeneratedIdentities(doModelo, { categories: request.categories, difficulties: request.difficulties });
        registra('identities_generated', { pediu: request.count, modelo: doModelo.length, passou: aceitas.length, ms: Date.now() - inicio });
        return { identities: aceitas.slice(0, request.count) };
      } catch (e) {
        // Falhar aqui é inconveniente, não grave: o app segue com as 168 do banco e o grupo joga.
        registra('identities_failed', { error: String(e), ms: Date.now() - inicio });
        return { identities: [] };
      }
    },
  };
}
