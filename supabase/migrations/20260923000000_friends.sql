-- Passo 5b: amigos.
--
-- O produto promete "quem entrar pelo seu link vira amigo na hora": não há pedido nem aceite.
-- A amizade é mútua e nasce quando alguém abre `jogaeapp.com.br/u/{username}` — o app chama
-- `add_friend_by_username`. Ninguém escreve nas tabelas direto; tudo passa por função.

-- ---------------------------------------------------------------------------------------------
-- Amizades: um par por linha, sempre com user_a < user_b, para o par não existir duas vezes.
-- ---------------------------------------------------------------------------------------------
create table public.friendships (
  user_a     uuid not null references auth.users (id) on delete cascade,
  user_b     uuid not null references auth.users (id) on delete cascade,
  -- Quem abriu o link (o outro é o dono do link). Serve para o limite de adições por hora.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);

create index friendships_user_b_idx on public.friendships (user_b);
create index friendships_created_by_idx on public.friendships (created_by, created_at desc);

comment on table public.friendships is 'Amizade mútua, um par por linha (user_a < user_b). Criada por add_friend_by_username.';

alter table public.friendships enable row level security;

revoke all on public.friendships from anon, authenticated;
grant select, delete on public.friendships to authenticated;

create policy "vejo só as minhas amizades"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- Desfazer é unilateral, como a criação: qualquer um dos dois pode sair da amizade.
create policy "qualquer um dos dois desfaz a amizade"
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- ---------------------------------------------------------------------------------------------
-- Salas abertas agora, escritas pelo servidor de salas (service role) — é o "jogando agora".
-- Nenhum cliente lê esta tabela: o código da sala só aparece para AMIGOS, via get_my_friends.
-- ---------------------------------------------------------------------------------------------
create table public.active_rooms (
  code       text primary key check (code ~ '^[0-9]{4}$'),
  game_id    text not null,
  -- `open`: no lobby, dá para entrar · `playing`: partida em andamento.
  status     text not null check (status in ('open', 'playing')),
  player_ids uuid[] not null default '{}',
  -- O servidor renova a cada minuto. Linha velha = servidor caiu sem limpar; quem lê ignora.
  updated_at timestamptz not null default now()
);

create index active_rooms_players_idx on public.active_rooms using gin (player_ids);

comment on table public.active_rooms is 'Presença: salas vivas no servidor de salas. Só a service role escreve; leitura só por get_my_friends.';

alter table public.active_rooms enable row level security;
revoke all on public.active_rooms from anon, authenticated;
grant select, insert, update, delete on public.active_rooms to service_role;

-- ---------------------------------------------------------------------------------------------
-- Virar amigo de alguém pelo @username (o que o link de convite carrega).
-- Erros (o app lê o `message`): friend_not_found · friend_is_self · friend_rate_limited.
-- ---------------------------------------------------------------------------------------------
create or replace function public.add_friend_by_username(target_username text)
returns table (id uuid, name text, username text, color text, already_friends boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  friend  public.profiles%rowtype;
  recent  int;
  created int;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.* into friend
  from public.profiles p
  where p.username = lower(btrim(coalesce(target_username, ''), ' @'));

  if not found then
    raise exception 'friend_not_found' using errcode = 'P0002';
  end if;
  if friend.id = me then
    raise exception 'friend_is_self' using errcode = '22023';
  end if;

  -- O @username é público, então dá para montar o link de qualquer pessoa. O limite impede
  -- alguém de varrer usernames para espiar em que sala cada um está.
  select count(*) into recent
  from public.friendships f
  where f.created_by = me and f.created_at > now() - interval '1 hour';
  if recent >= 30 then
    raise exception 'friend_rate_limited' using errcode = '54000';
  end if;

  insert into public.friendships (user_a, user_b, created_by)
  values (least(me, friend.id), greatest(me, friend.id), me)
  on conflict do nothing;
  get diagnostics created = row_count;

  return query select friend.id, friend.name, friend.username, friend.color, created = 0;
end;
$$;

revoke all on function public.add_friend_by_username(text) from public, anon;
grant execute on function public.add_friend_by_username(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lista de amigos do usuário logado, já com o que a tela mostra:
--   games_together  partidas finalizadas em que os dois jogaram
--   trophies        vitórias do amigo (mesma regra do histórico: 1º lugar, empates inclusos)
--   playing_*       sala em que o amigo está agora, se houver
-- `security definer` porque cruza o boletim de outras pessoas e lê active_rooms; só devolve
-- dados de quem é amigo de `auth.uid()`.
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_my_friends()
returns table (
  id uuid, name text, username text, color text,
  games_together int, trophies int,
  playing_game text, playing_code text, playing_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  friend_ids as (
    select f.user_b as friend_id from public.friendships f, me where f.user_a = me.uid
    union all
    select f.user_a from public.friendships f, me where f.user_b = me.uid
  )
  select
    p.id, p.name, p.username, p.color,
    (select count(*)::int
       from public.match_players mine
       join public.match_players theirs using (match_id)
      where mine.user_id = (select uid from me) and theirs.user_id = p.id) as games_together,
    (select count(*)::int from public.match_players w where w.user_id = p.id and w.won) as trophies,
    room.game_id, room.code, room.status
  from friend_ids
  join public.profiles p on p.id = friend_ids.friend_id
  left join lateral (
    select r.game_id, r.code, r.status
    from public.active_rooms r
    where p.id = any (r.player_ids) and r.updated_at > now() - interval '3 minutes'
    order by r.updated_at desc
    limit 1
  ) room on true
  order by (room.code is null), games_together desc, p.name;
$$;

revoke all on function public.get_my_friends() from public, anon;
grant execute on function public.get_my_friends() to authenticated;

-- Desfazer a amizade. `security invoker`: quem decide é a política de delete acima.
create or replace function public.remove_friend(friend_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.friendships
  where user_a = least((select auth.uid()), friend_id)
    and user_b = greatest((select auth.uid()), friend_id);
$$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;
