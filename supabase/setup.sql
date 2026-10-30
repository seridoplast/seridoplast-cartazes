-- SERIDÓPLAST CARTAZES — Execute uma vez no SQL Editor do Supabase.
-- Apenas usuários autenticados podem ler e editar dados; exclusão restrita ao criador.
-- ATENÇÃO: desative cadastro público em Authentication > Providers > Email
-- depois de criar/convidar seus funcionários (veja README).

create extension if not exists pgcrypto;

create table if not exists public.poster_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  image_path text not null,
  image_width integer not null default 1447 check (image_width > 0),
  image_height integer not null default 2048 check (image_height > 0),
  zone jsonb not null default '{"x":0.085,"y":0.354,"w":0.83,"h":0.424}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  owner_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posters (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.poster_templates(id) on delete restrict,
  product_name text not null check (char_length(product_name) between 2 and 350),
  price_from numeric(12,2) check (price_from >= 0),
  price_to numeric(12,2) not null check (price_to >= 0),
  unit_label text not null default '' check (char_length(unit_label) <= 180),
  owner_id uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.font_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  family text not null,
  file_path text not null,
  owner_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- Fonte opcional por cartaz: NULL utiliza a fonte do modelo.
alter table public.posters add column if not exists font_id uuid references public.font_assets(id) on delete set null;
create index if not exists idx_posters_font_id on public.posters (font_id);

-- Não permita que colaboradores transfiram a propriedade de itens de outros usuários.
create or replace function public.stamp_shared_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Não é permitido alterar o criador do registro';
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_template_update on public.poster_templates;
create trigger trg_template_update before update on public.poster_templates
for each row execute function public.stamp_shared_update();

drop trigger if exists trg_poster_update on public.posters;
create trigger trg_poster_update before update on public.posters
for each row execute function public.stamp_shared_update();

-- Grants SQL e RLS são verificações independentes. Conceda acesso apenas a contas logadas.
revoke all on public.poster_templates, public.posters, public.font_assets from anon;
grant select, insert, update, delete on public.poster_templates, public.posters, public.font_assets to authenticated;

alter table public.poster_templates enable row level security;
alter table public.posters enable row level security;
alter table public.font_assets enable row level security;

drop policy if exists "template_read_team" on public.poster_templates;
create policy "template_read_team" on public.poster_templates for select to authenticated using (true);
drop policy if exists "template_insert_own" on public.poster_templates;
create policy "template_insert_own" on public.poster_templates for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "template_update_team" on public.poster_templates;
create policy "template_update_team" on public.poster_templates for update to authenticated using (true) with check (true);
drop policy if exists "template_delete_own" on public.poster_templates;
create policy "template_delete_own" on public.poster_templates for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "poster_read_team" on public.posters;
create policy "poster_read_team" on public.posters for select to authenticated using (true);
drop policy if exists "poster_insert_own" on public.posters;
create policy "poster_insert_own" on public.posters for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "poster_update_team" on public.posters;
create policy "poster_update_team" on public.posters for update to authenticated using (true) with check (true);
drop policy if exists "poster_delete_own" on public.posters;
create policy "poster_delete_own" on public.posters for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "font_read_team" on public.font_assets;
create policy "font_read_team" on public.font_assets for select to authenticated using (true);
drop policy if exists "font_insert_own" on public.font_assets;
create policy "font_insert_own" on public.font_assets for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "font_delete_own" on public.font_assets;
create policy "font_delete_own" on public.font_assets for delete to authenticated using (owner_id = (select auth.uid()));

-- Buckets privados, com acesso mediante login e links assinados de curta duração.
insert into storage.buckets (id, name, public, file_size_limit)
values ('cartaz-artes', 'cartaz-artes', false, 15728640), ('cartaz-fontes', 'cartaz-fontes', false, 5242880)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- O upload só é autorizado dentro da pasta cujo nome é o UID do próprio usuário.
drop policy if exists "cartazes_storage_read" on storage.objects;
create policy "cartazes_storage_read" on storage.objects for select to authenticated
using (bucket_id in ('cartaz-artes', 'cartaz-fontes'));
drop policy if exists "cartazes_storage_insert" on storage.objects;
create policy "cartazes_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id in ('cartaz-artes', 'cartaz-fontes') and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Objetos antigos não são apagados automaticamente; exclusão de registros é restrita ao autor.
