-- A política de privacidade (jogae.app/privacidade e /excluir-conta) promete que, ao excluir a conta,
-- as pontuações antigas continuam no placar dos outros jogadores como "jogador removido".
-- Até aqui o boletim guardava o nome de quem saiu. Esta versão anonimiza ANTES de apagar o usuário
-- (depois, o `on delete set null` já teria desfeito o vínculo e não daria mais para achar as linhas).

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

  update public.match_players
     set name = 'Jogador removido', color = '#27272F'
   where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
