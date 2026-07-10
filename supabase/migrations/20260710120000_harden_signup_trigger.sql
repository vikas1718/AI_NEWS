CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role := 'editor'::public.app_role;
BEGIN
  IF NEW.raw_user_meta_data ? 'role'
    AND NEW.raw_user_meta_data->>'role' IN ('editor', 'chief_editor') THEN
    v_role := (NEW.raw_user_meta_data->>'role')::public.app_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(lower(NEW.email), NEW.id::text),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email)
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;

  IF to_regclass('public.organization_invitations') IS NOT NULL THEN
    UPDATE public.organization_invitations
    SET invitee_user_id = NEW.id
    WHERE invitee_user_id IS NULL
      AND status = 'pending'
      AND lower(email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
