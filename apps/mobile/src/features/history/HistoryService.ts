import { wait } from '@/core/utils/format';

export type HistoryEntry = {
  id: string;
  gameId: string;
  /** ISO 8601. "Ontem", "Esta semana" etc. são calculados na tela (ver `historyDates.ts`). */
  endedAt: string;
  players: number;
  wordCategory?: string;
  /** Colocação com empate: 1, 1, 3… */
  position: number;
  points: number;
  won: boolean;
};

export type PlayerStats = { matches: number; wins: number; favoriteGameId: string | null };

export type AchievementKey = 'ten_matches' | 'master_of_disguise' | 'king_of_the_group';

/** Só leitura: quem grava o histórico é o servidor de salas, no fim de cada partida. */
export interface HistoryService {
  list(): Promise<HistoryEntry[]>;
  stats(): Promise<PlayerStats>;
  achievements(): Promise<AchievementKey[]>;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const MOCK: Omit<HistoryEntry, 'won'>[] = [
  { id: 'h1', gameId: 'impostor', endedAt: daysAgo(1), players: 5, wordCategory: 'Comidas', position: 1, points: 1250 },
  { id: 'h2', gameId: 'desafio-secreto', endedAt: daysAgo(3), players: 7, position: 3, points: 860 },
  { id: 'h3', gameId: 'mais-provavel', endedAt: daysAgo(4), players: 4, position: 2, points: 720 },
  { id: 'h4', gameId: 'impostor', endedAt: daysAgo(8), players: 6, wordCategory: 'Filmes', position: 4, points: 540 },
  { id: 'h5', gameId: 'bomba-relogio', endedAt: daysAgo(9), players: 8, position: 1, points: 1400 },
  { id: 'h6', gameId: 'impostor', endedAt: daysAgo(11), players: 4, wordCategory: 'Lugares', position: 2, points: 910 },
  { id: 'h7', gameId: 'casal-perfeito', endedAt: daysAgo(24), players: 4, position: 1, points: 1100 },
  { id: 'h8', gameId: 'desafio-secreto', endedAt: daysAgo(31), players: 6, position: 5, points: 410 },
];

export class MockHistoryService implements HistoryService {
  async list(): Promise<HistoryEntry[]> {
    await wait(500);
    return MOCK.map((h) => ({ ...h, won: h.position === 1 }));
  }
  async stats(): Promise<PlayerStats> {
    return { matches: 32, wins: 8, favoriteGameId: 'impostor' };
  }
  async achievements(): Promise<AchievementKey[]> {
    return ['master_of_disguise', 'ten_matches', 'king_of_the_group'];
  }
}
