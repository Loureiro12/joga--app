/**
 * @jogae/engine — a única fonte de verdade do protocolo e das regras.
 *
 * Regras deste pacote:
 *  - TypeScript puro: sem React, React Native, Node ou qualquer I/O. Roda igual no app (Metro),
 *    no servidor de salas (Node) e em edge functions (Deno).
 *  - Sem estado global e sem relógio próprio: tempo e aleatoriedade entram por parâmetro, para ser testável.
 *  - É consumido como fonte (`main` aponta para `src/`), sem etapa de build.
 */
export * from './types';
export * from './games/bomb';
export * from './games/impostor';
export * from './games/likely';
export * from './room/protocol';
export * from './room/RoomEngine';
