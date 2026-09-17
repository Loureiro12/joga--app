import { wait } from '@/core/utils/format';

export type HistoryEntry = {
  id: string;
  gameId: string;
  /** Rótulo do grupo: "Esta semana", "Agosto"… (no backend real, derivado da data). */
  period: string;
  when: string;
  players: number;
  wordCategory?: string;
  position: number;
  points: number;
};

export type PlayerStats = { matches: number; wins: number; friends: number; favoriteGameId: string };

export interface HistoryService {
  list(): Promise<HistoryEntry[]>;
  stats(): Promise<PlayerStats>;
}

const ENTRIES: HistoryEntry[] = [
  { id: 'h1', gameId: 'impostor', period: 'Esta semana', when: 'Ontem', players: 5, wordCategory: 'Comidas', position: 1, points: 1250 },
  { id: 'h2', gameId: 'desafio-secreto', period: 'Esta semana', when: 'Sábado', players: 7, position: 3, points: 860 },
  { id: 'h3', gameId: 'mais-provavel', period: 'Esta semana', when: 'Sexta', players: 4, position: 2, points: 720 },
  { id: 'h4', gameId: 'impostor', period: 'Semana passada', when: 'Dom', players: 6, wordCategory: 'Filmes', position: 4, points: 540 },
  { id: 'h5', gameId: 'bomba-relogio', period: 'Semana passada', when: 'Sáb', players: 8, position: 1, points: 1400 },
  { id: 'h6', gameId: 'impostor', period: 'Semana passada', when: 'Qui', players: 4, wordCategory: 'Lugares', position: 2, points: 910 },
  { id: 'h7', gameId: 'casal-perfeito', period: 'Agosto', when: '28 ago', players: 4, position: 1, points: 1100 },
  { id: 'h8', gameId: 'desafio-secreto', period: 'Agosto', when: '21 ago', players: 6, position: 5, points: 410 },
];

export class MockHistoryService implements HistoryService {
  async list() {
    await wait(500);
    return ENTRIES;
  }
  async stats() {
    return { matches: 32, wins: 8, friends: 14, favoriteGameId: 'impostor' };
  }
}
