-- The live project schema does not include database-backed organization tables.
-- Keep the loose workspace id used by the app, without adding foreign keys.
ALTER TABLE public.newspapers
  ADD COLUMN IF NOT EXISTS organization_id TEXT;

CREATE INDEX IF NOT EXISTS newspapers_organization_idx
  ON public.newspapers(organization_id);
