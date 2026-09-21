import assert from 'node:assert/strict';
import { test } from 'node:test';

import { periodLabel, whenLabel } from '../src/features/history/historyDates';

// Quarta-feira, 16 de setembro de 2026, 21h (horário local).
const NOW = new Date(2026, 8, 16, 21, 0);
const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).toISOString();

test('quando: hoje, ontem, dia da semana, abreviado na semana passada, e data depois disso', () => {
  assert.equal(whenLabel(at(2026, 9, 16, 9), NOW), 'Hoje');
  assert.equal(whenLabel(at(2026, 9, 15, 23), NOW), 'Ontem');
  assert.equal(whenLabel(at(2026, 9, 14), NOW), 'Segunda', 'mesma semana (que começa na segunda)');
  assert.equal(whenLabel(at(2026, 9, 13), NOW), 'Dom', 'domingo já é da semana passada');
  assert.equal(whenLabel(at(2026, 9, 8), NOW), 'Ter');
  assert.equal(whenLabel(at(2026, 8, 28), NOW), '28 ago');
  assert.equal(whenLabel(at(2026, 3, 5), NOW), '5 mar');
});

test('"ontem" é por dia do calendário, não por 24 horas', () => {
  const justAfterMidnight = new Date(2026, 8, 16, 0, 10);
  assert.equal(whenLabel(at(2026, 9, 15, 23), justAfterMidnight), 'Ontem');
});

test('grupos: esta semana, semana passada, mês, e mês com ano quando é de outro ano', () => {
  assert.equal(periodLabel(at(2026, 9, 14), NOW), 'Esta semana');
  assert.equal(periodLabel(at(2026, 9, 13), NOW), 'Semana passada');
  assert.equal(periodLabel(at(2026, 9, 7), NOW), 'Semana passada');
  assert.equal(periodLabel(at(2026, 9, 6), NOW), 'Setembro', 'mais de uma semana atrás, ainda no mês corrente');
  assert.equal(periodLabel(at(2026, 8, 28), NOW), 'Agosto');
  assert.equal(periodLabel(at(2025, 12, 31), NOW), 'Dezembro de 2025');
});

test('virada de ano no meio da semana não quebra o agrupamento', () => {
  const friday = new Date(2027, 0, 1, 12); // sexta, 1º de janeiro de 2027
  assert.equal(periodLabel(at(2026, 12, 29), friday), 'Esta semana');
  assert.equal(whenLabel(at(2026, 12, 29), friday), 'Terça');
});
