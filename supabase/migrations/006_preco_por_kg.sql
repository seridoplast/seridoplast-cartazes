-- Seridóplast Cartazes: opção "Preço por peso (KG)".
-- Execute uma vez no SQL Editor do Supabase ANTES de publicar o aplicativo atualizado.
-- Migração segura: todos os produtos atuais continuam com preço por unidade (FALSE).
BEGIN;
ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS is_weight_based boolean NOT NULL DEFAULT false;
COMMIT;
NOTIFY pgrst, 'reload schema';
