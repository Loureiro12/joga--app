/**
 * A regra dos anúncios é a parte que erra feio: um anúncio na hora errada não incomoda um
 * usuário, estraga a noite de um grupo inteiro. Por isso ela mora num módulo puro — e por isso
 * estes testes existem.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AD_COOLDOWN_MS, AD_FIRST_AFTER_MATCHES, ADS_NEVER_IN, canShowAd, type AdGate } from '../src/features/ads/adPolicy';

const AGORA = 1_700_000_000_000;

/** Um grupo que já jogou o bastante, respondeu o consentimento e não assina nada. */
const base = (over: Partial<AdGate> = {}): AdGate => ({
  now: AGORA,
  lastShownAt: null,
  matchesPlayed: AD_FIRST_AFTER_MATCHES,
  gameId: 'impostor',
  isPremium: false,
  consentResolved: true,
  ...over,
});

test('o caso normal: partida acabou, grupo já jogou algumas, anúncio pode entrar', () => {
  assert.deepEqual(canShowAd('fim-de-partida', base()), { show: true });
});

test('as primeiras partidas são limpas', () => {
  for (let jogadas = 0; jogadas < AD_FIRST_AFTER_MATCHES; jogadas++) {
    const decisao = canShowAd('fim-de-partida', base({ matchesPlayed: jogadas }));
    assert.equal(decisao.show, false, `a ${jogadas + 1}ª partida mostrou anúncio`);
  }
  // A primeira impressão do app não pode ser um anúncio: quem está experimentando desiste.
  assert.equal(canShowAd('fim-de-partida', base({ matchesPlayed: AD_FIRST_AFTER_MATCHES })).show, true);
});

test('duas partidas curtas seguidas não rendem dois anúncios', () => {
  const agoraMesmo = canShowAd('fim-de-partida', base({ lastShownAt: AGORA - 1000 }));
  assert.equal(agoraMesmo.show, false);

  const depoisDoIntervalo = canShowAd('fim-de-partida', base({ lastShownAt: AGORA - AD_COOLDOWN_MS - 1 }));
  assert.equal(depoisDoIntervalo.show, true);
});

test('Entre Nós nunca mostra anúncio, nem com todo o resto liberado', () => {
  // O casal acabou de falar de coisa pessoal. Nenhuma receita paga o que um anúncio quebraria ali.
  assert.ok(ADS_NEVER_IN.includes('entre-nos'));
  const decisao = canShowAd('fim-de-partida', base({ gameId: 'entre-nos' }));
  assert.equal(decisao.show, false);
  assert.match(decisao.show === false ? decisao.reason : '', /entre-nos/);
});

test('assinante não vê anúncio — a chave já existe antes de o premium existir', () => {
  // Hoje `isPremium` é sempre falso. Quando o premium entrar, "sem anúncios" funciona daqui,
  // sem tocar em nenhuma tela.
  assert.equal(canShowAd('fim-de-partida', base({ isPremium: true })).show, false);
});

test('sem resposta ao consentimento, nada é mostrado', () => {
  // LGPD e a própria exigência do AdMob: perguntar vem antes de servir.
  assert.equal(canShowAd('fim-de-partida', base({ consentResolved: false })).show, false);
});

test('a decisão sempre explica o "não"', () => {
  const recusas: AdGate[] = [
    base({ isPremium: true }),
    base({ consentResolved: false }),
    base({ gameId: 'entre-nos' }),
    base({ matchesPlayed: 0 }),
    base({ lastShownAt: AGORA }),
  ];
  for (const gate of recusas) {
    const d = canShowAd('fim-de-partida', gate);
    assert.equal(d.show, false);
    assert.ok(d.show === false && d.reason.length > 0, 'recusa sem motivo não ajuda ninguém a depurar');
  }
});
