/** 1250 → "1.250" */
export const formatPoints = (n: number) => n.toLocaleString('pt-BR');

/** 75 → "1:15" */
export const formatClock = (totalSeconds: number) =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Saudação da Home por horário. */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
