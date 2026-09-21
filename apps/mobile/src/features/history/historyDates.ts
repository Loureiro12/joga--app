/**
 * Rótulos de data do Histórico, como no design: "Ontem · Sábado · Dom · 28 ago" e os grupos
 * "Esta semana · Semana passada · Agosto". Feito à mão (sem Intl) para sair igual em qualquer motor JS.
 */
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** A semana começa na segunda. */
const startOfWeek = (d: Date) => {
  const day = startOfDay(d);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
};
const DAY = 86_400_000;

/** 0 = esta semana, 1 = semana passada, 2+ = mais antigo. */
function weeksAgo(date: Date, now: Date): number {
  return Math.round((startOfWeek(now).getTime() - startOfWeek(date).getTime()) / (7 * DAY));
}

export function periodLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const weeks = weeksAgo(date, now);
  if (weeks <= 0) return 'Esta semana';
  if (weeks === 1) return 'Semana passada';
  return date.getFullYear() === now.getFullYear() ? MONTHS[date.getMonth()] : `${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

export function whenLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  const weeks = weeksAgo(date, now);
  if (weeks === 0) return WEEKDAYS[date.getDay()];
  if (weeks === 1) return WEEKDAYS_SHORT[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3).toLowerCase()}`;
}
