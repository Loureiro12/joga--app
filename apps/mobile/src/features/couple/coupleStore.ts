import { create } from 'zustand';

import { createCoupleSession, deepen, endSession, nextCard, swapCard, type CoupleSettings, type CoupleState } from '@jogae/engine';

/**
 * "Entre Nós" roda inteiro neste aparelho: um casal, um celular, sem sala e sem conta.
 *
 * Nada é persistido, e aqui isso é mais do que simplicidade: o casal acabou de conversar sobre
 * coisas pessoais, e guardar essa sessão sem ninguém pedir seria uma quebra de confiança. Se um
 * dia houver "guardar descobertas", tem de ser uma ação explícita deles.
 */
type CoupleStoreState = {
  /** Os nomes em edição, antes de a sessão existir. */
  names: [string, string];
  session: CoupleState | null;
};

export const useCoupleStore = create<CoupleStoreState>(() => ({ names: ['', ''], session: null }));

export const useCoupleSession = () => useCoupleStore((s) => s.session);
export const useCoupleNames = () => useCoupleStore((s) => s.names);

export const coupleActions = {
  setName(index: 0 | 1, value: string) {
    useCoupleStore.setState((s) => {
      const names: [string, string] = [...s.names];
      names[index] = value.slice(0, 16);
      return { names };
    });
  },
  start(settings: Omit<CoupleSettings, 'names'>) {
    const { names } = useCoupleStore.getState();
    useCoupleStore.setState({ session: createCoupleSession({ ...settings, names }) });
  },
  next() {
    useCoupleStore.setState((s) => (s.session ? { session: nextCard(s.session) } : s));
  },
  /** A pergunta não coube. Sem pedir motivo, sem gastar a vez. */
  swap() {
    useCoupleStore.setState((s) => (s.session ? { session: swapCard(s.session) } : s));
  },
  deepen() {
    useCoupleStore.setState((s) => (s.session ? { session: deepen(s.session) } : s));
  },
  end() {
    useCoupleStore.setState((s) => (s.session ? { session: endSession(s.session) } : s));
  },
  leave() {
    useCoupleStore.setState({ session: null });
  },
  reset() {
    useCoupleStore.setState({ names: ['', ''], session: null });
  },
};
