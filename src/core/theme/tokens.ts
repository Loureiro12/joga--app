/**
 * Design tokens — fonte única de verdade para cores, raios e espaçamentos.
 * Valores vêm de design_handoff_jogae/README.md ("Design Tokens").
 */
export const colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  accent: '#FACC15',
  background: '#0F0F13',
  surface: '#19191F',
  surfaceLight: '#27272F',
  text: '#FAFAFA',
  muted: '#A1A1AA',
  mutedDark: '#52525B',
  mutedOnLight: '#71717A',
  success: '#22C55E',
  danger: '#EF4444',
  resultWin: '#166534',
  resultLose: '#7F1D1D',
  impostorBg: '#1A0F14',
  scrim: 'rgba(15,15,19,0.82)',
  scrimLight: 'rgba(15,15,19,0.6)',
  scrimOffline: 'rgba(15,15,19,0.7)',
  /** Superfícies translúcidas sobre fundos coloridos. */
  overlayDark: 'rgba(15,15,19,0.35)',
  overlayDarker: 'rgba(15,15,19,0.45)',
  overlayDarkSoft: 'rgba(15,15,19,0.3)',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;

/** Cores disponíveis para avatar de jogador (ordem do seletor em Editar perfil). */
export const playerColors = [
  '#FACC15',
  '#7C3AED',
  '#22C55E',
  '#EF4444',
  '#A78BFA',
  '#27272F',
] as const;

const LIGHT_BACKGROUNDS = new Set(['#FACC15', '#22C55E', '#A78BFA', '#FAFAFA']);

/** Texto sobre amarelo/verde/lilás/branco é escuro; sobre roxo/vermelho/escuros é claro. */
export function onColor(bg: string): string {
  return LIGHT_BACKGROUNDS.has(bg.toUpperCase()) ? colors.background : colors.text;
}

export const radii = {
  cardLg: 28,
  card: 24,
  cardSm: 22,
  list: 20,
  input: 16,
  button: 18,
  segmentItem: 13,
  pill: 99,
} as const;

export const spacing = {
  screenX: 20,
  screenBottom: 24,
  blockGap: 18,
  blockGapLg: 22,
  listGap: 8,
  chipGap: 8,
} as const;

export const shadows = {
  secretCard: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 16,
  },
  toast: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 12,
  },
} as const;
