import { useEffect, useRef } from 'react';

import { crossfadeLoop, fadeOutLoop, playLoop, playSound, preloadSounds, releaseSounds, stopLoop } from '@/core/audio/sounds';

import type { BombPhase } from '@jogae/engine';

/**
 * O som da Bomba-Relógio.
 *
 * **Vale aqui a mesma regra da animação: nada pode dizer quanto tempo falta.** Um fundo que
 * acelerasse junto com o pavio seria um cronômetro sonoro, e o grupo aprenderia a ler as batidas.
 * Por isso este hook recebe só a fase e o contador de sustos — nunca o instante da explosão.
 *
 * A aceleração acontece depois de um tempo **de rodada corrida**, e não de tempo restante. É a
 * diferença entre "já faz um tempo que isso está na sua mão" (que todo mundo percebe sozinho) e
 * "falta pouco" (que ninguém pode saber). O instante exato é sorteado dentro de uma janela, para
 * ninguém decorar nem mesmo esse número.
 *
 * O "tempo acabando" toca **apenas no susto falso**, e é a melhor peça do jogo: o grupo ouve o
 * som de fim, o coração dispara, e nada acontece.
 */

/** Janela em que a tensão passa para a versão rápida, contada desde que a bomba acendeu. */
const ESCALADA_MIN_MS = 10_000;
const ESCALADA_MAX_MS = 16_000;
/** Troca de laço com emenda curta: no talho, o jogador ouve o corte em vez da tensão. */
const CROSSFADE_MS = 250;
/** No desarme o silêncio chega aos poucos — faz parte do alívio. */
const ALIVIO_MS = 500;
/** Fundo, não primeiro plano: tem de incomodar sem cobrir a mesa falando. */
const VOLUME = 0.55;

const LACOS = ['tensao', 'tensaoRapido'] as const;
const pararTudo = () => LACOS.forEach(stopLoop);

export function useBombSound(phase: BombPhase, alarmCount: number) {
  const sustos = useRef(alarmCount);

  useEffect(() => {
    // Os três carregados antes da rodada: decodificar na hora atrasaria justo a explosão.
    preloadSounds(['tensao', 'tensaoRapido', 'explosao', 'tempoAcabando']);
    return () => {
      pararTudo();
      releaseSounds();
    };
  }, []);

  useEffect(() => {
    if (phase === 'armed') {
      playLoop('tensao', VOLUME);
      const quando = ESCALADA_MIN_MS + Math.random() * (ESCALADA_MAX_MS - ESCALADA_MIN_MS);
      const subir = setTimeout(() => crossfadeLoop('tensao', 'tensaoRapido', CROSSFADE_MS, VOLUME), quando);
      return () => clearTimeout(subir);
    }

    if (phase === 'exploded') {
      // Sem fade, de propósito: o corte seco seguido do estrondo é o que dá o impacto.
      pararTudo();
      playSound('explosao');
      return;
    }

    if (phase === 'disarmed') {
      LACOS.forEach((laco) => fadeOutLoop(laco, ALIVIO_MS));
      return;
    }

    // Entre rodadas e no fim da partida: silêncio.
    pararTudo();
  }, [phase]);

  // Susto: o som de fim, na hora em que nada vai acontecer.
  useEffect(() => {
    if (alarmCount === sustos.current) return;
    sustos.current = alarmCount;
    if (alarmCount > 0) playSound('tempoAcabando');
  }, [alarmCount]);
}
