import { useEffect, useRef } from 'react';

import { playSound, preloadSounds, releaseSounds } from '@/core/audio/sounds';

import type { BombPhase } from '@jogae/engine';

/**
 * O som da Bomba-Relógio.
 *
 * **Vale aqui a mesma regra da animação: nada pode dizer quanto tempo falta.** Um tique-taque que
 * acelerasse junto com o pavio seria um cronômetro sonoro, e o grupo aprenderia a contar as
 * batidas. Por isso este hook recebe só a fase e o contador de sustos — nunca o instante da
 * explosão — e sorteia o próprio ritmo, em ondas de calmaria e agitação.
 *
 * O "tempo acabando" toca **apenas no susto falso**, e é a melhor peça do jogo: o grupo ouve o
 * som de fim, o coração dispara, e nada acontece.
 */

/** Batida calma e batida nervosa, e quanto dura cada onda antes de o ritmo mudar de novo. */
const CALMO_MS = 820;
const AGITADO_MS = 380;
const ONDA_MIN_MS = 2500;
const ONDA_MAX_MS = 5000;

export function useBombSound(phase: BombPhase, alarmCount: number) {
  const sustos = useRef(alarmCount);

  useEffect(() => {
    // Deixa tudo decodificado antes da primeira batida, senão o tique engasga no começo.
    preloadSounds(['tick', 'tock', 'explosao', 'tempoAcabando']);
    return releaseSounds;
  }, []);

  // O tique-taque só existe com a bomba acesa.
  useEffect(() => {
    if (phase !== 'armed') return;
    let vivo = true;
    let batida: ReturnType<typeof setInterval> | undefined;
    let troca: ReturnType<typeof setTimeout> | undefined;
    let tac = false;

    const onda = () => {
      if (!vivo) return;
      clearInterval(batida);
      const periodo = Math.random() < 0.45 ? AGITADO_MS : CALMO_MS;
      batida = setInterval(() => {
        // Alterna tick e tock: é o que soa como relógio, em vez de um bipe repetido.
        playSound(tac ? 'tock' : 'tick', 0.6);
        tac = !tac;
      }, periodo);
      troca = setTimeout(onda, ONDA_MIN_MS + Math.random() * (ONDA_MAX_MS - ONDA_MIN_MS));
    };

    onda();
    return () => {
      vivo = false;
      clearInterval(batida);
      clearTimeout(troca);
    };
  }, [phase]);

  // Susto: o som de fim, na hora em que nada vai acontecer.
  useEffect(() => {
    if (alarmCount === sustos.current) return;
    sustos.current = alarmCount;
    if (alarmCount > 0) playSound('tempoAcabando');
  }, [alarmCount]);

  useEffect(() => {
    if (phase === 'exploded') playSound('explosao');
  }, [phase]);
}
