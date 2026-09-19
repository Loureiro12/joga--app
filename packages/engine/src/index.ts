/**
 * @jogae/engine — a única fonte de verdade do protocolo e das regras.
 *
 * Regras deste pacote:
 *  - TypeScript puro: sem React, React Native, Node ou qualquer I/O. Roda igual no app (Metro),
 *    no servidor de salas (Node) e em edge functions (Deno).
 *  - Sem estado global e sem relógio: aleatoriedade entra por parâmetro (`rng`), para ser testável.
 *  - É consumido como fonte (`main` aponta para `src/`), sem etapa de build.
 */
export * from './types';
export * from './games/impostor';
