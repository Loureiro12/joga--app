import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

import {
  ALPHABET_CATEGORIES,
  ALPHABET_RULES,
  BOMB_CATEGORIES,
  sanitizeGeneratedChallenges,
  sanitizeGeneratedThemes,
  type BombContentRequest,
} from '@jogae/engine';

import type { Config } from '../config';

/**
 * Geração de conteúdo da Bomba-Relógio pela API do Claude.
 *
 * Mora no servidor por um motivo só: **a chave**. Qualquer `EXPO_PUBLIC_*` do Expo vai dentro do
 * bundle, e um bundle é um arquivo que qualquer pessoa baixa da loja e abre. Então o app pede, o
 * servidor gera, e a chave nunca sai daqui.
 *
 * ## O que este módulo NÃO faz
 *
 * Não decide se a carta é boa. Isso é do `sanitizeGenerated*` no motor — puro, testável e usado
 * aqui como portaria. O prompt abaixo é a primeira linha; a portaria é a que vale. Um lote que
 * volta pela metade é um lote menor, e o app tem o banco local para completar.
 *
 * Também não guarda nada: sem cache, sem banco, sem fila. Quem lembra é o aparelho do grupo, que
 * é quem sabe o que *aquela* turma já viu. Um cache aqui serviria o mesmo tema para todo mundo.
 */

/* ──────────────────────────── o prompt ──────────────────────────── */

/**
 * Os critérios do banco local, ditos ao modelo.
 *
 * Vale a pena ler junto com o comentário de `packages/engine/src/games/bomb-challenges.ts`: é o
 * mesmo texto, em outra voz. Quando um critério mudar lá, muda aqui — e é por isso que a portaria
 * existe, para a divergência entre os dois não chegar à mesa de ninguém.
 */
const SISTEMA_CLASSICO = `Você escreve desafios para o "Bomba-Relógio", um jogo de festa brasileiro.

Como o jogo funciona: um celular passa de mão em mão numa roda. O desafio é lido em voz alta UMA vez, e cada pessoa da roda precisa dar uma resposta NOVA antes de passar o celular adiante. Quem está com ele quando a bomba estoura, perde.

O critério NÚMERO UM é a quantidade de respostas possíveis. Uma roda de 8 pessoas pode dar 20 ou 30 respostas no mesmo desafio antes da rodada acabar.
- RUIM: "Diga um dia da semana." (só 7 respostas, a roda trava)
- RUIM: "Diga uma estação do ano." (só 4)
- BOM: "Diga algo que existe numa cozinha." (dezenas)
- BOM: "Diga uma marca de carro." (dezenas)

Regras de forma, sem exceção:
- Uma frase só, no imperativo, começando por "Diga ", "Cite " ou "Fale ", terminando em ponto.
- No máximo 70 caracteres. Sem interrogação, exclamação, dois-pontos, ponto e vírgula ou aspas.
- SEM NOME PRÓPRIO, em nenhuma posição: nada de pessoa real, marca, obra, país, cidade ou evento. Maiúscula só na primeira letra da frase. O jogador pode RESPONDER uma marca; a pergunta não entrega nenhuma.
- A resposta tem que sair em 2 ou 3 segundos. Nada de conta, data, ordem ou memória longa.

Assuntos proibidos: saúde física ou mental, aparência ou peso, raça, etnia, religião, orientação sexual, identidade de gênero, crime, violência, morte, armas, drogas, bebida pesada, sexo, dinheiro ou dívida, política partidária. É um jogo que roda na sala da casa, com criança por perto.

O campo "pool" é sua estimativa honesta de respostas distintas: "alto" = dezenas, "medio" = cerca de 15. Não escreva desafio com menos que isso.

Escreva em português do Brasil, na linguagem falada. Prefira o desafio que faz a roda rir ou hesitar ao desafio que testa conhecimento.`;

const SISTEMA_ALFABETO = `Você cria temas para o "Bomba-Relógio: Alfabeto", um jogo de festa brasileiro.

Como funciona: a roda recebe um TEMA e uma grade de letras na tela. Tocar uma letra é o que passa o celular para a próxima pessoa — e antes de tocar, ela precisa dizer em voz alta algo do tema que comece com aquela letra. Cada letra só serve uma vez, então a rodada vai apertando até sobrar letra difícil.

O critério NÚMERO UM é a letra: só entre no campo "letters" a letra que tem resposta que um brasileiro comum diz em voz alta em 3 segundos, SEM PENSAR. Uma letra sem resposta óbvia trava a rodada e mata a brincadeira.
- Tema "Frutas": A (abacaxi), B (banana), C (caju) entram. E, H, N, S não entram — não há fruta óbvia.
- K, W, X e Y só entram se existir resposta de verdade mesmo.

Regras de forma:
- "name": o tema em 3 a 22 caracteres, sem ponto final. Substantivo no plural, como se alguém falasse: "Coisas de praia", "Profissões", "Doces".
- "letters": só maiúsculas de A a Z, em ordem, sem separador. No MÍNIMO ${ALPHABET_RULES.minLetters} letras — tema com menos que isso não é jogável.
- "emoji": um emoji só, que represente o tema.
- Sem nome próprio no tema: nada de marca, pessoa, obra ou lugar específico.

Assuntos proibidos: saúde física ou mental, aparência ou peso, raça, etnia, religião, orientação sexual, identidade de gênero, crime, violência, morte, armas, drogas, bebida pesada, sexo, dinheiro ou dívida, política partidária.

A dificuldade mede quantas respostas o tema comporta POR LETRA, não o quanto a pessoa precisa saber: "Animais" é fácil, "Games" é difícil.

Escreva em português do Brasil.`;

/* ──────────────────────────── os esquemas ──────────────────────────── */

const DIFICULDADES = ['facil', 'medio', 'dificil'] as const;

const DesafiosSchema = z.object({
  challenges: z.array(
    z.object({
      text: z.string(),
      category: z.string(),
      difficulty: z.enum(DIFICULDADES),
      pool: z.enum(['alto', 'medio']),
    }),
  ),
});

const TemasSchema = z.object({
  themes: z.array(
    z.object({
      name: z.string(),
      emoji: z.string(),
      category: z.string(),
      difficulty: z.enum(DIFICULDADES),
      letters: z.string(),
    }),
  ),
});

/* ──────────────────────────── o gerador ──────────────────────────── */

export type GeneratedContent = { challenges: unknown[]; themes: unknown[] };

export type ContentGenerator = {
  generate(request: BombContentRequest): Promise<{ challenges: ReturnType<typeof sanitizeGeneratedChallenges>; themes: ReturnType<typeof sanitizeGeneratedThemes> }>;
};

/**
 * Pedir mais do que o grupo vai usar é de propósito: a portaria derruba cartas, e um lote que
 * chega com folga ainda entrega o que foi pedido. 1,6x é o que a observação mostrou bastar.
 */
const FOLGA = 1.6;

/** O modelo não pode demorar mais que isso: o app desiste e usa o banco local, o que já é aceitável. */
const TIMEOUT_MS = 25_000;

const log = (fn: (event: string, data?: Record<string, unknown>) => void) => fn;

export function createContentGenerator(config: Config, registrar: (event: string, data?: Record<string, unknown>) => void = () => {}): ContentGenerator | null {
  if (!config.anthropicApiKey) return null;
  const registra = log(registrar);
  const client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  const pedido = (request: BombContentRequest) => {
    const categorias = request.categories.length ? request.categories : [...(request.variant === 'alfabeto' ? ALPHABET_CATEGORIES : BOMB_CATEGORIES)];
    const quantas = Math.ceil(request.count * FOLGA);
    const linhas = [
      `Gere ${quantas} ${request.variant === 'alfabeto' ? 'temas' : 'desafios'} novos.`,
      '',
      `Categorias permitidas (use exatamente estes nomes no campo "category", e distribua entre elas): ${categorias.join(' · ')}`,
      `Dificuldades permitidas (campo "difficulty"): ${request.difficulties.join(' · ')}`,
    ];
    if (request.avoidTexts.length) {
      // O grupo já viu estas. Mandar a lista é mais barato e mais confiável do que esperar que o
      // modelo seja criativo por conta própria — ele tende a cair nos mesmos lugares-comuns.
      linhas.push('', 'Este grupo JÁ VIU as cartas abaixo. Não repita nenhuma delas, e nem variação próxima:', ...request.avoidTexts.map((t) => `- ${t}`));
    }
    return linhas.join('\n');
  };

  /**
   * Esforço baixo, sem raciocínio estendido: escrever uma lista curta de frases simples não é
   * tarefa difícil, e esforço alto aqui só custaria tempo de espera. A qualidade vem do prompt e
   * da portaria, não de o modelo pensar mais.
   */
  const comum = { model: 'claude-opus-5-5', max_tokens: 4000, output_config: { effort: 'low' as const } };

  return {
    async generate(request) {
      const inicio = Date.now();
      const opcoes = { categories: request.categories, difficulties: request.difficulties };
      try {
        if (request.variant === 'alfabeto') {
          const res = await client.messages.parse({
            ...comum,
            output_config: { ...comum.output_config, format: zodOutputFormat(TemasSchema) },
            system: [{ type: 'text', text: SISTEMA_ALFABETO, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: pedido(request) }],
          });
          const temas = sanitizeGeneratedThemes(res.parsed_output?.themes ?? [], opcoes);
          registra('content_generated', { variant: 'alfabeto', pediu: request.count, modelo: res.parsed_output?.themes?.length ?? 0, passou: temas.length, ms: Date.now() - inicio });
          return { challenges: [], themes: temas.slice(0, request.count) };
        }

        const res = await client.messages.parse({
          ...comum,
          output_config: { ...comum.output_config, format: zodOutputFormat(DesafiosSchema) },
          system: [{ type: 'text', text: SISTEMA_CLASSICO, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: pedido(request) }],
        });
        const desafios = sanitizeGeneratedChallenges(res.parsed_output?.challenges ?? [], opcoes);
        registra('content_generated', { variant: 'classico', pediu: request.count, modelo: res.parsed_output?.challenges?.length ?? 0, passou: desafios.length, ms: Date.now() - inicio });
        return { challenges: desafios.slice(0, request.count), themes: [] };
      } catch (e) {
        // Falhar aqui é inconveniente, não grave: o app segue com o banco local e o grupo joga.
        registra('content_failed', { variant: request.variant, error: String(e), ms: Date.now() - inicio });
        return { challenges: [], themes: [] };
      }
    },
  };
}
