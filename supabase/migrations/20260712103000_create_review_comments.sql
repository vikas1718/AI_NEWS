-- Structured review comments let chief editors leave page/article-specific notes
-- before the final approve/reject decision.

CREATE TABLE IF NOT EXISTS public.review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newspaper_id UUID NOT NULL REFERENCES public.newspapers(id) ON DELETE CASCADE,
  article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
  page_number INTEGER,
  scope TEXT NOT NULL CHECK (scope IN ('page', 'article', 'general')),
  comment TEXT NOT NULL CHECK (length(btrim(comment)) > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (
    (scope = 'page' AND page_number IS NOT NULL AND page_number > 0 AND article_id IS NULL)
    OR (scope = 'article' AND article_id IS NOT NULL AND page_number IS NULL)
    OR (scope = 'general' AND article_id IS NULL AND page_number IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS review_comments_newspaper_idx
  ON public.review_comments(newspaper_id, created_at DESC);

CREATE INDEX IF NOT EXISTS review_comments_article_idx
  ON public.review_comments(article_id)
  WHERE article_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_comments TO authenticated;
GRANT ALL ON public.review_comments TO service_role;

ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review comments readable by organization members"
  ON public.review_comments;
DROP POLICY IF EXISTS "review comments insertable by organization reviewers"
  ON public.review_comments;
DROP POLICY IF EXISTS "review comments updatable by comment reviewers"
  ON public.review_comments;
DROP POLICY IF EXISTS "review comments deletable by comment reviewers"
  ON public.review_comments;

CREATE POLICY "review comments readable by organization members"
  ON public.review_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = review_comments.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_org_member(n.organization_id::UUID, auth.uid())
    )
  );

CREATE POLICY "review comments insertable by organization reviewers"
  ON public.review_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = review_comments.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'review_articles')
    )
    AND (
      review_comments.article_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.articles a
        WHERE a.id = review_comments.article_id
          AND a.newspaper_id = review_comments.newspaper_id
      )
    )
  );

CREATE POLICY "review comments updatable by comment reviewers"
  ON public.review_comments
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = review_comments.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'review_articles')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = review_comments.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'review_articles')
    )
  );

CREATE POLICY "review comments deletable by comment reviewers"
  ON public.review_comments
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = review_comments.newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'review_articles')
    )
  );
