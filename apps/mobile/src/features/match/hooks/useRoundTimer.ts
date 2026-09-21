import type { RoundTimer } from '@jogae/engine';
import { useEffect, useState } from 'react';

/**
 * Segundos restantes do cronômetro, contados no aparelho.
 * O servidor só manda snapshot quando o cronômetro muda de estado (iniciar, pausar, zerar);
 * entre um e outro, a contagem é local, a partir do instante em que o snapshot chegou.
 * Usar o instante de CHEGADA (e não um horário absoluto do servidor) dispensa relógios sincronizados.
 */
export function useRoundTimer(timer: RoundTimer | undefined): number {
  const [remaining, setRemaining] = useState(timer?.remainingSec ?? 0);

  useEffect(() => {
    if (!timer) return;
    setRemaining(timer.remainingSec);
    if (!timer.running) return;
    const receivedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - receivedAt) / 1000);
      setRemaining(Math.max(0, timer.remainingSec - elapsed));
    }, 250);
    return () => clearInterval(interval);
    // `timer` muda de identidade a cada snapshot: é exatamente quando queremos re-basear a contagem.
  }, [timer]);

  return remaining;
}
