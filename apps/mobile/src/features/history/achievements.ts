import type { AchievementKey } from './HistoryService';

/** Catálogo das conquistas. Os critérios vivem no banco (`refresh_achievements`); aqui é só apresentação. */
export const ACHIEVEMENTS: { key: AchievementKey; emoji: string; label: string; hint: string; featured?: boolean }[] = [
  { key: 'master_of_disguise', emoji: '🕵️', label: 'Mestre do disfarce', hint: 'Escape 3 vezes como impostor' },
  { key: 'ten_matches', emoji: '🔥', label: '10 partidas', hint: 'Jogue 10 partidas até o fim' },
  { key: 'king_of_the_group', emoji: '👑', label: 'Rei do grupo', hint: 'Vença 5 partidas', featured: true },
];
