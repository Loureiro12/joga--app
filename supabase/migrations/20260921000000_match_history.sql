-- Passo 4: histórico de partidas, estatísticas e conquistas.
-- Quem escreve é só o servidor de salas (service role), pela função record_match().
-- O app apenas lê — e cada jogador só enxerga as partidas em que jogou.

create table public.matches (
  -- Gerado pelo servidor de salas no início da partida: regravar a mesma partida não duplica.
  id               uuid primary key,
  room_code        text not null,
  game_id          text not null,
  category         text not null,
  total_rounds     int  not null check (total_rounds between 1 and 50),
  player_count     int  not null check (player_count between 1 and 50),
  impostors_caught int  not null default 0 check (impostors_caught >= 0),
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  created_at       timestamptz not null default now(),
  constraint matches_time_order check (ended_at >= started_at)
);

create table public.match_players (
  match_id       uuid not null references public.matches (id) on delete cascade,
  -- Posição na lista do boletim; é a chave porque user_id pode ser nulo.
  seat           int  not null,
  -- Nulo para bots de dev e para quem excluiu a conta: o histórico DOS OUTROS não fica com buraco,
  -- e quem excluiu deixa de ter qualquer partida ligada a si.
  user_id        uuid references auth.users (id) on delete set null,
  -- Nome e cor como eram no dia da partida.
  name           text not null,
  color          text not null,
  position       int  not null check (position >= 1),
  points         int  not null check (points >= 0),
  won            boolean not null,
  times_impostor int  not null default 0 check (times_impostor >= 0),
  times_escaped  int  not null default 0 check (times_escaped >= 0 and times_escaped <= times_impostor),
  primary key (match_id, seat)
);

create index match_players_user_idx on public.match_players (user_id, match_id);
create unique index match_players_one_seat_per_user on public.match_players (match_id, user_id) where user_id is not null;
create index matches_ended_at_idx on public.matches (ended_at desc);

create table public.achievements (
  user_id     uuid not null references auth.users (id) on delete cascade,
  key         text not null check (key in ('ten_matches', 'master_of_disguise', 'king_of_the_group')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.matches is 'Partidas que chegaram ao fim. Gravadas pelo servidor de salas.';
comment on table public.match_players is 'Boletim de cada jogador em cada partida.';
comment on table public.achievements is 'Conquistas desbloqueadas; recalculadas a partir do histórico a cada partida gravada.';

-- ---------------------------------------------------------------- RLS: o app só lê o que é seu

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.achievements enable row level security;

revoke all on public.matches, public.match_players, public.achievements from anon, authenticated;
grant select on public.matches, public.match_players, public.achievements to authenticated;

create policy "vejo só as minhas linhas do boletim"
  on public.match_players for select to authenticated
  using (user_id = (select auth.uid()));

-- Usa a policy acima por baixo: "partidas em que tenho uma linha de boletim".
create policy "vejo só as partidas em que joguei"
  on public.matches for select to authenticated
  using (exists (select 1 from public.match_players mp where mp.match_id = matches.id));

create policy "vejo só as minhas conquistas"
  on public.achievements for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- conquistas

-- Recalcula a partir do histórico. Critérios (decididos em 2026-09-20):
--   ten_matches        → 10 partidas jogadas até o fim
--   master_of_disguise → escapou como impostor 3 vezes, somando todas as partidas
--   king_of_the_group  → venceu 5 partidas
create or replace function public.refresh_achievements(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.achievements (user_id, key)
  select target, earned.key
  from (
    select count(*) as played, coalesce(sum(times_escaped), 0) as escaped, count(*) filter (where won) as wins
    from public.match_players where user_id = target
  ) totals
  cross join lateral (values
    ('ten_matches',        totals.played  >= 10),
    ('master_of_disguise', totals.escaped >= 3),
    ('king_of_the_group',  totals.wins    >= 5)
  ) as earned(key, unlocked)
  where earned.unlocked
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------- gravação (só o servidor de salas)

-- Recebe o MatchRecord do @jogae/engine em JSON e grava tudo numa transação.
-- Idempotente: chamar duas vezes com a mesma partida devolve false e não altera nada.
create or replace function public.record_match(record jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_id uuid := (record ->> 'matchId')::uuid;
  player   jsonb;
  seat_no  int := 0;
  uid      uuid;
  inserted int;
begin
  insert into public.matches (id, room_code, game_id, category, total_rounds, player_count, impostors_caught, started_at, ended_at)
  values (
    match_id,
    record ->> 'roomCode',
    record ->> 'gameId',
    record ->> 'category',
    (record ->> 'totalRounds')::int,
    jsonb_array_length(record -> 'players'),
    (record ->> 'impostorsCaught')::int,
    to_timestamp((record ->> 'startedAt')::double precision / 1000),
    to_timestamp((record ->> 'endedAt')::double precision / 1000)
  )
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  for player in select * from jsonb_array_elements(record -> 'players') loop
    seat_no := seat_no + 1;
    -- Só vira vínculo quem é usuário de verdade e ainda existe: bot de dev e conta apagada ficam nulos.
    uid := null;
    if (player ->> 'playerId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select u.id into uid from auth.users u where u.id = (player ->> 'playerId')::uuid;
    end if;

    insert into public.match_players (match_id, seat, user_id, name, color, position, points, won, times_impostor, times_escaped)
    values (
      match_id, seat_no, uid,
      left(player ->> 'name', 24), player ->> 'color',
      (player ->> 'position')::int, (player ->> 'points')::int, (player ->> 'won')::boolean,
      (player ->> 'timesImpostor')::int, (player ->> 'timesEscaped')::int
    );

    if uid is not null then
      perform public.refresh_achievements(uid);
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.record_match(jsonb) from public, anon, authenticated;
revoke all on function public.refresh_achievements(uuid) from public, anon, authenticated;
grant execute on function public.record_match(jsonb) to service_role;

-- ---------------------------------------------------------------- leitura agregada para o Perfil / Histórico

create or replace function public.get_my_stats()
returns table (matches int, wins int, favorite_game_id text)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::int,
    (count(*) filter (where mp.won))::int,
    (select m2.game_id
       from public.match_players mp2 join public.matches m2 on m2.id = mp2.match_id
      where mp2.user_id = (select auth.uid())
      group by m2.game_id order by count(*) desc, max(m2.ended_at) desc limit 1)
  from public.match_players mp
  where mp.user_id = (select auth.uid());
$$;

revoke all on function public.get_my_stats() from public, anon;
grant execute on function public.get_my_stats() to authenticated;
