-- SERIDÓPLAST CARTAZES v2.0.1 — recuperação do cadastro sem depender do cache
-- MANTÉM todos os dados anteriores. Execute uma vez no SQL Editor antes do deploy.
-- Os produtos novos passam a ser gravados em public.posters COM template_id = NULL.
-- Logo, ficam independentes de modelos mesmo usando a tabela antiga temporariamente.

BEGIN;

-- A relação com o modelo passa a ser opcional; chave estrangeira existente é preservada.
ALTER TABLE public.posters ALTER COLUMN template_id DROP NOT NULL;

-- Preserva eventuais itens digitados diretamente na tabela nova catalog_products.
-- Caso um produto com mesmo nome e apresentação já esteja em posters, ele não é duplicado.
WITH itens AS (
  SELECT DISTINCT ON (lower(btrim(c.product_name)), lower(btrim(c.unit_label)))
    c.product_name, c.price_from, c.price_to, c.unit_label,
    c.owner_id, c.created_at, c.updated_at
  FROM public.catalog_products c
  WHERE c.price_to > 0
  ORDER BY lower(btrim(c.product_name)), lower(btrim(c.unit_label)), c.updated_at DESC, c.id
)
INSERT INTO public.posters
  (product_name, price_from, price_to, unit_label, owner_id, created_at, updated_at)
SELECT c.product_name, c.price_from, c.price_to, c.unit_label,
       c.owner_id, c.created_at, c.updated_at
FROM itens c
WHERE NOT EXISTS (
  SELECT 1 FROM public.posters p
  WHERE lower(btrim(p.product_name)) = lower(btrim(c.product_name))
    AND lower(btrim(p.unit_label)) = lower(btrim(c.unit_label))
);

-- Não concede acesso anônimo nem desliga RLS; mantém políticas existentes.
COMMIT;
