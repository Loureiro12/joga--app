import type { RoomPhase } from '@jogae/engine';

/**
 * Em que fases existe partida para abandonar.
 *
 * Fora daqui o menu de saída não aparece: no lobby a própria tela tem "Fechar", e com a partida
 * encerrada não há o que largar. Mora num arquivo próprio, sem nada de React, por dois motivos:
 * a lista de fases cresce a cada jogo novo — e uma fase esquecida vira uma tela sem saída — e
 * assim o teste consegue percorrer todas sem carregar a interface.
 */
export const hasMatchToLeave = (phase: RoomPhase) => phase !== 'lobby' && phase !== 'finished' && phase !== 'closed';
