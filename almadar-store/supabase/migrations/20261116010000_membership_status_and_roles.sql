ALTER TABLE public.erp_company_memberships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.erp_company_memberships AS membership
   SET role = app_user.role,
       permissions = app_user.permissions
  FROM public.erp_users AS app_user
 WHERE membership.user_id = app_user.id
   AND membership.company_id = app_user.company_id
   AND membership.role IN ('owner', 'member');

CREATE INDEX IF NOT EXISTS erp_company_memberships_active_user_idx
  ON public.erp_company_memberships (user_id, company_id)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.erp_sync_company_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.erp_company_memberships AS existing_membership (
    company_id, user_id, role, permissions, is_default
  )
  VALUES (
    NEW.company_id, NEW.id, NEW.role, NEW.permissions, TRUE
  )
  ON CONFLICT (company_id, user_id) DO UPDATE
     SET role = EXCLUDED.role,
         permissions = EXCLUDED.permissions
   WHERE existing_membership.is_default;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_users_sync_company_membership ON public.erp_users;

CREATE TRIGGER erp_users_sync_company_membership
AFTER INSERT OR UPDATE OF role, permissions ON public.erp_users
FOR EACH ROW
EXECUTE FUNCTION public.erp_sync_company_membership();

CREATE OR REPLACE FUNCTION public.erp_create_company(
  p_company_id UUID,
  p_name TEXT,
  p_user_id TEXT,
  p_role TEXT,
  p_permissions JSONB,
  p_actor_username TEXT,
  p_audit_id TEXT
)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;
  IF jsonb_typeof(p_permissions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Company permissions must be an array';
  END IF;
  IF p_role IS NULL OR p_role NOT IN (
    'super_admin', 'finance_manager', 'sales_manager', 'inventory_manager', 'hr_manager', 'auditor'
  ) THEN
    RAISE EXCEPTION 'Invalid company member role';
  END IF;

  INSERT INTO public.erp_companies (id, name)
  VALUES (p_company_id, BTRIM(p_name));

  INSERT INTO public.erp_company_memberships (
    company_id, user_id, role, permissions, is_default
  )
  VALUES (
    p_company_id, p_user_id, p_role, p_permissions, FALSE
  );

  INSERT INTO public.erp_audit_log (
    id, company_id, actor_user_id, actor_username, action, module, details
  )
  VALUES (
    p_audit_id,
    p_company_id,
    p_user_id,
    p_actor_username,
    'company_created',
    'security',
    jsonb_build_object('companyId', p_company_id, 'companyName', BTRIM(p_name))
  );

  RETURN QUERY
  SELECT company.id, company.name
    FROM public.erp_companies AS company
   WHERE company.id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_create_company(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_company(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT)
  TO service_role;
