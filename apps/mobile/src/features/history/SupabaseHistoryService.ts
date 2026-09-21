import type { SupabaseClient } from '@supabase/supabase-js';

import type { AchievementKey, HistoryEntry, HistoryService, PlayerStats } from './HistoryService';

type MatchRow = {
  id: string;
  game_id: string;
  category: string;
  player_count: number;
  ended_at: string;
  // A RLS de match_players só devolve a MINHA linha de cada partida.
  match_players: { position: number; points: number; won: boolean }[];
};

/** Lê o histórico gravado pelo servidor de salas. A RLS garante que só vêm as partidas do usuário logado. */
export class SupabaseHistoryService implements HistoryService {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(): Promise<HistoryEntry[]> {
    const { data, error } = await this.supabase
      .from('matches')
      .select('id, game_id, category, player_count, ended_at, match_players!inner(position, points, won)')
      .order('ended_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data as MatchRow[]).map((m) => ({
      id: m.id,
      gameId: m.game_id,
      endedAt: m.ended_at,
      players: m.player_count,
      wordCategory: m.category,
      position: m.match_players[0].position,
      points: m.match_players[0].points,
      won: m.match_players[0].won,
    }));
  }

  async stats(): Promise<PlayerStats> {
    const { data, error } = await this.supabase.rpc('get_my_stats').maybeSingle<{ matches: number; wins: number; favorite_game_id: string | null }>();
    if (error) throw new Error(error.message);
    return { matches: data?.matches ?? 0, wins: data?.wins ?? 0, favoriteGameId: data?.favorite_game_id ?? null };
  }

  async achievements(): Promise<AchievementKey[]> {
    const { data, error } = await this.supabase.from('achievements').select('key').order('unlocked_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map((a) => a.key as AchievementKey);
  }
}
