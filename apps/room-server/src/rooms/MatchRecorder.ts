import type { MatchRecord } from '@jogae/engine';

import type { Config } from '../config';

/** Para onde vai o boletim de uma partida que terminou. */
export interface MatchRecorder {
  record(match: MatchRecord): Promise<void>;
}

export class NullMatchRecorder implements MatchRecorder {
  async record() {}
}

type Log = (event: string, data?: Record<string, unknown>) => void;

/**
 * Grava no Supabase chamando a função `record_match` com a service role.
 * A função é idempotente (a chave é o `matchId`), então repetir depois de um timeout é seguro —
 * por isso dá para tentar de novo sem medo de duplicar a partida.
 */
export class SupabaseMatchRecorder implements MatchRecorder {
  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly log: Log,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly retryDelaysMs: number[] = [1000, 4000, 15000],
  ) {}

  async record(match: MatchRecord): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/rpc/record_match`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: this.serviceRoleKey, authorization: `Bearer ${this.serviceRoleKey}` },
          body: JSON.stringify({ record: match }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return void this.log('match_recorded', { matchId: match.matchId, players: match.players.length, fresh: await res.json().catch(() => null) });
        // 4xx é erro nosso (payload, permissão): tentar de novo não resolve.
        if (res.status >= 400 && res.status < 500) return void this.log('match_record_rejected', { matchId: match.matchId, status: res.status, body: (await res.text()).slice(0, 300) });
        throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined) return void this.log('match_record_failed', { matchId: match.matchId, error: String(e) });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

export function createMatchRecorder(config: Config, log: Log): MatchRecorder {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) return new SupabaseMatchRecorder(config.supabaseUrl, config.supabaseServiceRoleKey, log);
  log('match_recorder_disabled', { reason: 'SUPABASE_SERVICE_ROLE_KEY não definida: partidas não entram no histórico' });
  return new NullMatchRecorder();
}
