-- Baseline: só infraestrutura compartilhada pelas próximas migrations.
-- As tabelas de domínio entram por passo do plano (docs/backend-plan.md).

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
