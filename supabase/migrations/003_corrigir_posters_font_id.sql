-- SERIDÓPLAST CARTAZES v1.2 - corrigir PGRST204 / coluna font_id
-- Execute no Supabase > SQL Editor > New query > Run.
-- Não apaga cartazes, modelos ou usuários. Seguro para executar novamente.

alter table public.posters
  add column if not exists font_id uuid references public.font_assets(id) on delete set null;

create index if not exists idx_posters_font_id on public.posters (font_id);

-- Informa ao PostgREST que o esquema do banco mudou.
notify pgrst, 'reload schema';

-- Deve retornar uma linha chamada font_id, indicando que a coluna existe.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posters'
  and column_name = 'font_id';
