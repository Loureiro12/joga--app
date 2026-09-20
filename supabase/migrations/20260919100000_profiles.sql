-- Passo 2: perfil público de cada usuário (inclusive convidados, que são usuários anônimos do Auth).

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  username   text not null,
  color      text not null default '#FACC15',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_name_length check (char_length(btrim(name)) between 2 and 24),
  -- Só minúsculas: a unicidade simples em `text` já é case-insensitive na prática.
  constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,20}$'),
  constraint profiles_username_reserved check (
    username not in ('admin', 'jogae', 'suporte', 'support', 'ajuda', 'root', 'null', 'undefined')
  ),
  -- As 6 cores de jogador do design system.
  constraint profiles_color_palette check (
    color in ('#FACC15', '#7C3AED', '#22C55E', '#EF4444', '#A78BFA', '#27272F')
  )
);

create unique index profiles_username_key on public.profiles (username);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is 'Perfil público: nome, @username e cor. Criado por trigger quando o usuário nasce no Auth.';

-- ---------------------------------------------------------------- RLS
-- Nome, username e cor são públicos para quem está logado (lobby, amigos, placar).
-- Ninguém insere nem apaga pela API: o perfil nasce por trigger e morre em cascata com o usuário.

alter table public.profiles enable row level security;

create policy "perfis são visíveis para usuários logados"
  on public.profiles for select
  to authenticated
  using (true);

create policy "cada um edita só o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A API só pode mexer nestas colunas; id/created_at/updated_at ficam fora.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (name, username, color) on public.profiles to authenticated;

-- ---------------------------------------------------------------- criação automática

-- "João Vítor" → "joaovitor"; vazio ou curto demais → "jogador".
create or replace function public.username_base(source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(slug) >= 3 then left(slug, 14) else 'jogador' end
  from (
    select regexp_replace(
      translate(lower(coalesce(source, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9_.]', '', 'g') as slug
  ) s;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
  base         text;
  candidate    text;
  palette      text[] := array['#FACC15', '#7C3AED', '#22C55E', '#EF4444', '#A78BFA'];
begin
  display_name := btrim(coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    case when new.is_anonymous then 'Convidado' end,
    split_part(new.email, '@', 1),
    'Jogador'));
  if char_length(display_name) < 2 then display_name := 'Jogador'; end if;
  display_name := left(display_name, 24);

  base := public.username_base(case when new.is_anonymous then 'convidado' else display_name end);

  -- Tenta o nome limpo primeiro; se estiver em uso (ou for reservado), acrescenta 4 dígitos.
  for attempt in 0..20 loop
    candidate := case when attempt = 0 and not new.is_anonymous
      then base
      else base || '_' || lpad((floor(random() * 10000))::int::text, 4, '0') end;
    begin
      insert into public.profiles (id, name, username, color)
      values (new.id, display_name, candidate, palette[1 + floor(random() * array_length(palette, 1))::int]);
      return new;
    exception
      when unique_violation or check_violation then
        -- username em uso ou reservado: tenta o próximo
        null;
    end;
  end loop;

  raise exception 'não foi possível gerar um username para %', new.id;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- excluir conta

-- Exigência da App Store: quem cria conta precisa conseguir apagá-la dentro do app.
-- Apaga o usuário do Auth; perfil (e as tabelas dos próximos passos) caem em cascata pelo FK.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
