import { create } from 'zustand';

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
    useBombStore.setState({ match: createBombMatch(roster, sanitizeBombSettings(settings), Date.now()) });
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
    useBombStore.setState((s) => (s.match ? { match: nextRound(s.match) } : s));
  },
  endMatch() {
    useBombStore.setState((s) => (s.match ? { match: endMatch(s.match) } : s));
  },
  /** Mesma turma, partida nova. */
  playAgain(settings: Partial<BombSettings>) {
    const { match } = useBombStore.getState();
    if (!match) return;
    useBombStore.setState({ match: createBombMatch(match.players, sanitizeBombSettings(settings), Date.now()) });
  },
  leave() {
    useBombStore.setState({ match: null });
  },
};
