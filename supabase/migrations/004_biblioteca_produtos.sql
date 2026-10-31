-- SERIDÓPLAST CARTAZES v2.0 — Execute SOMENTE este arquivo (uma vez) no SQL Editor.
-- NÃO execute setup.sql novamente em banco já configurado.
-- Cria uma biblioteca de produtos SEM vínculo a modelos. Não apaga nada de posters.
-- Idempotente: pode executar novamente sem duplicar produtos.

begin;

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null check (char_length(btrim(product_name)) between 2 and 350),
  price_from numeric(12,2) check (price_from >= 0),
  price_to numeric(12,2) not null check (price_to > 0),
  unit_label text not null default '' check (char_length(unit_label) <= 180),
  catalog_key text generated always as (
    lower(btrim(product_name)) || '|' || lower(btrim(unit_label))
  ) stored unique,
  owner_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_catalog_products_updated_at on public.catalog_products (updated_at desc);

-- Preserva a autoria histórica e aproveita uma versão por nome + apresentação.
-- Registros antigos não são excluídos; apenas deixam de ser usados pela v2.
insert into public.catalog_products (product_name, price_from, price_to, unit_label, owner_id, created_at, updated_at)
select distinct on (lower(btrim(p.product_name)), lower(btrim(p.unit_label)))
       p.product_name, p.price_from, p.price_to, p.unit_label, p.owner_id, p.created_at, p.updated_at
from public.posters as p
where p.price_to > 0
order by lower(btrim(p.product_name)), lower(btrim(p.unit_label)), p.updated_at desc, p.id
on conflict (catalog_key) do nothing;

-- Atualizar conteúdo permitido, mas não permitir alterar a autoria.
create or replace function public.catalog_products_stamp_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Não é permitido alterar o criador do registro';
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_catalog_products_updated_at on public.catalog_products;
create trigger trg_catalog_products_updated_at
before update on public.catalog_products
for each row execute function public.catalog_products_stamp_update();

revoke all on public.catalog_products from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.catalog_products to authenticated;
alter table public.catalog_products enable row level security;

drop policy if exists "catalog_read_team" on public.catalog_products;
create policy "catalog_read_team" on public.catalog_products
for select to authenticated using (true);
drop policy if exists "catalog_insert_own" on public.catalog_products;
create policy "catalog_insert_own" on public.catalog_products
for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "catalog_update_team" on public.catalog_products;
create policy "catalog_update_team" on public.catalog_products
for update to authenticated using (true) with check (true);
drop policy if exists "catalog_delete_own" on public.catalog_products;
create policy "catalog_delete_own" on public.catalog_products
for delete to authenticated using (owner_id = (select auth.uid()));

-- Solicitação não destrutiva de atualização do cache da API.
select pg_notify('pgrst', 'reload schema');
commit;

-- No painel: Settings > Data API > Exposed tables > HABILITAR catalog_products
-- e SALVAR as alterações pendentes. Não exponha tabelas desnecessárias.
