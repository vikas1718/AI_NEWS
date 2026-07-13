-- Older editions were created before organization_id became part of newspapers.
-- Attach those orphaned editions to the creator's default active organization.
DO $$
BEGIN
  IF to_regclass('public.newspapers') IS NULL
    OR to_regclass('public.organization_members') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.newspapers n
  SET organization_id = (
    SELECT om.organization_id::TEXT
    FROM public.organization_members om
    WHERE om.user_id = n.created_by
      AND om.status = 'active'
    ORDER BY
      CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END,
      om.joined_at
    LIMIT 1
  )
  WHERE n.organization_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = n.created_by
        AND om.status = 'active'
    );
END $$;
