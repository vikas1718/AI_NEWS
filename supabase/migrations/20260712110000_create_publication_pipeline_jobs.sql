-- Track the organization-controlled publication pipeline:
-- Website -> PDF -> Print -> Mobile -> Social Media.

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS print_ready_url TEXT,
  ADD COLUMN IF NOT EXISTS mobile_url TEXT,
  ADD COLUMN IF NOT EXISTS social_media_kit_url TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_job_id UUID;

CREATE TABLE IF NOT EXISTS public.publication_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newspaper_id UUID NOT NULL REFERENCES public.newspapers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  current_stage TEXT,
  stages JSONB NOT NULL DEFAULT '[]'::JSONB,
  output_urls JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publication_jobs_newspaper_idx
  ON public.publication_jobs(newspaper_id, created_at DESC);

CREATE INDEX IF NOT EXISTS publication_jobs_status_idx
  ON public.publication_jobs(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publication_jobs TO authenticated;
GRANT ALL ON public.publication_jobs TO service_role;

ALTER TABLE public.publication_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "publication jobs readable by organization members"
  ON public.publication_jobs;
DROP POLICY IF EXISTS "publication jobs writable by organization publishers"
  ON public.publication_jobs;

CREATE POLICY "publication jobs readable by organization members"
  ON public.publication_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = publication_jobs.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_org_member(n.organization_id::UUID, auth.uid())
    )
  );

CREATE POLICY "publication jobs writable by organization publishers"
  ON public.publication_jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = publication_jobs.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'publish_articles')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = publication_jobs.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'publish_articles')
    )
  );

DROP TRIGGER IF EXISTS publication_jobs_touch ON public.publication_jobs;
CREATE TRIGGER publication_jobs_touch
  BEFORE UPDATE ON public.publication_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'publications_pipeline_job_id_fkey'
  ) THEN
    ALTER TABLE public.publications
      ADD CONSTRAINT publications_pipeline_job_id_fkey
      FOREIGN KEY (pipeline_job_id) REFERENCES public.publication_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;
