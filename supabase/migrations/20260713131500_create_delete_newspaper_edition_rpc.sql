CREATE OR REPLACE FUNCTION public.delete_newspaper_edition(p_newspaper_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_newspaper public.newspapers%ROWTYPE;
  v_deleted_id UUID;
BEGIN
  SELECT *
  INTO v_newspaper
  FROM public.newspapers
  WHERE id = p_newspaper_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edition not found or already deleted.';
  END IF;

  IF v_newspaper.organization_id IS NULL THEN
    IF v_newspaper.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'You do not have permission to delete this edition.';
    END IF;
  ELSE
    IF v_newspaper.organization_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Edition organization is invalid.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = v_newspaper.organization_id::UUID
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'editor')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to delete this edition.';
    END IF;
  END IF;

  DELETE FROM public.newspapers
  WHERE id = p_newspaper_id
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'Edition was not deleted. Please refresh and try again.';
  END IF;

  RETURN v_deleted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_newspaper_edition(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_newspaper_edition(UUID) TO authenticated;
