-- Baseline: só infraestrutura compartilhada pelas próximas migrations.
-- As tabelas de domínio entram por passo do plano (docs/backend-plan.md):
--   passo 2 → profiles · passo 4 → matches/match_players/achievements
--   passo 5 → friendships/active_rooms/push_tokens · passo 6 → entitlements

create schema if not exists extensions;

-- Username case-insensitive ("Vini" e "vini" são o mesmo).
-- ATENÇÃO: os operadores do citext moram no schema `extensions`. O search_path padrão do Supabase
-- já o inclui, mas dentro de função com `set search_path = ''` a comparação `username = 'vini'`
-- cai no `=` de text e vira case-SENSITIVE sem dar erro. Nessas funções use
-- `set search_path = public, extensions` ou compare com `lower(username::text) = lower($1)`.
create extension if not exists citext with schema extensions;

-- Trigger genérico: mantém `updated_at` em qualquer tabela que tenha a coluna.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Use com: create trigger ... before update on <tabela> for each row execute function public.set_updated_at();';
