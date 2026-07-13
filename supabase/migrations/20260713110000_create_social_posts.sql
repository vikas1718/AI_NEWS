-- Social-only publishing records.
-- These posts are separate from edition publication, so a newsroom can publish
-- or schedule selected articles to social platforms without marking the whole
-- newspaper edition as published.

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  newspaper_id UUID REFERENCES public.newspapers(id) ON DELETE SET NULL,
  article_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'twitter', 'facebook', 'whatsapp', 'inshorts')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'scheduled', 'published', 'cancelled', 'failed')),
  caption TEXT,
  summary TEXT,
  content JSONB NOT NULL DEFAULT '{}'::JSONB,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_organization_idx
  ON public.social_posts(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS social_posts_newspaper_idx
  ON public.social_posts(newspaper_id, created_at DESC);

CREATE INDEX IF NOT EXISTS social_posts_status_idx
  ON public.social_posts(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social posts readable by organization members"
  ON public.social_posts;
DROP POLICY IF EXISTS "social posts insertable by social editors"
  ON public.social_posts;
DROP POLICY IF EXISTS "social posts updatable by social editors"
  ON public.social_posts;
DROP POLICY IF EXISTS "social posts deletable by social editors"
  ON public.social_posts;

CREATE POLICY "social posts readable by organization members"
  ON public.social_posts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "social posts insertable by social editors"
  ON public.social_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
    AND (
      public.current_user_has_permission(organization_id, 'create_articles')
      OR public.current_user_has_permission(organization_id, 'submit_for_review')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
    AND (
      newspaper_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.newspapers n
        WHERE n.id = newspaper_id
          AND n.organization_id = organization_id::TEXT
      )
    )
    AND (
      status NOT IN ('under_review', 'approved', 'rejected', 'scheduled', 'published')
      OR (
        status IN ('under_review', 'approved', 'rejected')
        AND public.current_user_has_permission(organization_id, 'approve_articles')
      )
      OR (
        status IN ('scheduled', 'published')
        AND public.current_user_has_permission(organization_id, 'publish_articles')
      )
    )
  );

CREATE POLICY "social posts updatable by social editors"
  ON public.social_posts
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.current_user_has_permission(organization_id, 'create_articles')
      OR public.current_user_has_permission(organization_id, 'submit_for_review')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.current_user_has_permission(organization_id, 'create_articles')
      OR public.current_user_has_permission(organization_id, 'submit_for_review')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
    AND (
      newspaper_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.newspapers n
        WHERE n.id = newspaper_id
          AND n.organization_id = organization_id::TEXT
      )
    )
    AND (
      status NOT IN ('under_review', 'approved', 'rejected', 'scheduled', 'published')
      OR (
        status IN ('under_review', 'approved', 'rejected')
        AND public.current_user_has_permission(organization_id, 'approve_articles')
      )
      OR (
        status IN ('scheduled', 'published')
        AND public.current_user_has_permission(organization_id, 'publish_articles')
      )
    )
  );

CREATE POLICY "social posts deletable by social editors"
  ON public.social_posts
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      created_by = auth.uid()
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
  );

DROP TRIGGER IF EXISTS social_posts_touch ON public.social_posts;
CREATE TRIGGER social_posts_touch
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_touch_updated_at();

NOTIFY pgrst, 'reload schema';
