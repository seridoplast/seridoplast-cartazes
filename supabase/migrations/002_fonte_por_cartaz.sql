-- Atualização v2 para projetos Supabase já existentes. Execute uma vez no SQL Editor.
-- Preserva todos os cartazes, modelos, fontes e contas existentes.
alter table public.posters
  add column if not exists font_id uuid references public.font_assets(id) on delete set null;
create index if not exists idx_posters_font_id on public.posters (font_id);
