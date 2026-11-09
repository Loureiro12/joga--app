import { create } from 'zustand';

import { adsState } from '@/features/ads/adsStore';

import { bombContent } from './bombContentStore';

import {
  armBomb,
  bombTick,
  createBombMatch,
  endMatch,
  nextRound,
  passBomb,
  sanitizeBombSettings,
  useLetter,
  type BombPlayer,
  type BombSettings,
  type BombState,
} from '@jogae/engine';

/**
 * A Bomba-Relógio roda inteira neste aparelho: um celular passando de mão em mão, sem sala,
 * sem conta e sem servidor. Por isso o estado vive aqui, e não no `matchStore` (que espelha
 * o servidor de salas).
 *
 * Nada é persistido de propósito: a partida acontece com todo mundo junto, na mesma mesa.
 * Recuperar uma partida velha ao reabrir o app só confundiria quem está na frente dele.
 *
 * A única coisa que atravessa o fim da partida é o CONTEÚDO (`bombContentStore`): o que o grupo
 * já viu, para não ver de novo, e as cartas geradas para ele. Partida é do momento; baralho não.
 */
type BombStoreState = {
  /** Lista em edição na tela de preparação, antes de a partida existir. */
  roster: BombPlayer[];
  match: BombState | null;
};

export const useBombStore = create<BombStoreState>(() => ({ roster: [], match: null }));

export const useBombMatch = () => useBombStore((s) => s.match);
export const useBombRoster = () => useBombStore((s) => s.roster);

/** Paleta do app; a cor é só para distinguir as pessoas na tela. */
const COLORS = ['#7C3AED', '#FACC15', '#22C55E', '#EF4444', '#A78BFA', '#27272F'];

/**
 * A partida acabou agora? Então ela conta para o ritmo dos anúncios — e as cartas que ela usou
 * entram na memória do grupo, para a próxima partida não repetir.
 *
 * No fim, e não a cada rodada: uma partida abandonada no meio não deveria queimar cartas que o
 * grupo mal viu.
 */
function contando(antes: BombState, depois: BombState): BombState {
  if (antes.phase !== 'finished' && depois.phase === 'finished') {
    adsState.countMatch();
    bombContent.remember(depois);
  }
  return depois;
}

export const bombActions = {
  addPlayer(name: string) {
    const clean = name.trim().slice(0, 16);
    if (!clean) return;
    useBombStore.setState((s) => ({
      roster: [...s.roster, { id: `p${Date.now()}${s.roster.length}`, name: clean, color: COLORS[s.roster.length % COLORS.length] }],
    }));
  },
  removePlayer(id: string) {
    useBombStore.setState((s) => ({ roster: s.roster.filter((p) => p.id !== id) }));
  },
  resetRoster() {
    useBombStore.setState({ roster: [], match: null });
  },

  start(settings: Partial<BombSettings>) {
    const { roster } = useBombStore.getState();
    const limpas = sanitizeBombSettings(settings);
    useBombStore.setState({ match: createBombMatch(roster, limpas, Date.now(), Math.random, bombContent.contentFor(limpas)) });
  },

  /** "Estou pronto": só aqui a bomba começa a contar. */
  arm() {
    useBombStore.setState((s) => (s.match ? { match: armBomb(s.match, Date.now()) } : s));
  },
  pass() {
    useBombStore.setState((s) => (s.match ? { match: passBomb(s.match, Date.now()) } : s));
  },
  /** Alfabeto: tocar a letra é o que passa a bomba. Toque inválido devolve o mesmo estado. */
  useLetter(letter: string) {
    useBombStore.setState((s) => {
      if (!s.match) return s;
      const next = useLetter(s.match, letter, Date.now());
      return next === s.match ? s : { match: next };
    });
  },
  /** Chamado a cada quadro pela tela da rodada; devolve o mesmo objeto quando nada mudou. */
  tick() {
    useBombStore.setState((s) => {
      if (!s.match) return s;
      const next = bombTick(s.match, Date.now());
      return next === s.match ? s : { match: next };
    });
  },
  nextRound() {
    useBombStore.setState((s) => (s.match ? { match: contando(s.match, nextRound(s.match)) } : s));
  },
  endMatch() {
    useBombStore.setState((s) => (s.match ? { match: contando(s.match, endMatch(s.match)) } : s));
  },
  /** Mesma turma, partida nova. */
  playAgain(settings: Partial<BombSettings>) {
    const { match } = useBombStore.getState();
    if (!match) return;
    const limpas = sanitizeBombSettings(settings);
    // `contentFor` é lido de novo: se a busca de fundo chegou durante a partida anterior, a
    // próxima já joga com as cartas novas — e a memória do que acabou de ser usado também entrou.
    useBombStore.setState({ match: createBombMatch(match.players, limpas, Date.now(), Math.random, bombContent.contentFor(limpas)) });
  },
  leave() {
    useBombStore.setState({ match: null });
  },
};
