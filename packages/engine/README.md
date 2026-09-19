# @jogae/engine

Tipos do domínio (`Room`, `Player`, `RoomSnapshot`…) e regras puras dos jogos (`createImpostorRound`, `resolveImpostorRound`, `botVote`).

É o contrato entre o app e o servidor de salas: os dois importam daqui, então não existe "versão do protocolo" para sincronizar. TypeScript puro, sem I/O e sem dependências de runtime.

```bash
npm test -w @jogae/engine
npm run typecheck -w @jogae/engine
```
