ALTER TABLE public.erp_people
  ADD COLUMN IF NOT EXISTS employee_number TEXT,
  ADD COLUMN IF NOT EXISTS hired_on DATE,
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.erp_people'::REGCLASS
       AND conname = 'erp_people_employee_number_nonblank_check'
  ) THEN
    ALTER TABLE public.erp_people
      ADD CONSTRAINT erp_people_employee_number_nonblank_check
      CHECK (employee_number IS NULL OR NULLIF(BTRIM(employee_number), '') IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.erp_people'::REGCLASS
       AND conname = 'erp_people_employment_status_check'
  ) THEN
    ALTER TABLE public.erp_people
      ADD CONSTRAINT erp_people_employment_status_check
      CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'terminated'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS erp_people_company_employee_number_uq
  ON public.erp_people (company_id, LOWER(BTRIM(employee_number)))
  WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS erp_people_company_employment_status_idx
  ON public.erp_people (company_id, employment_status, status);

CREATE OR REPLACE FUNCTION public.erp_create_employee_profile(
  p_person_id UUID,
  p_company_id UUID,
  p_employee_number TEXT,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_hired_on DATE,
  p_employment_status TEXT,
  p_actor_user_id TEXT,
  p_actor_username TEXT,
  p_audit_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_person public.erp_people%ROWTYPE;
BEGIN
  IF p_person_id IS NULL OR p_company_id IS NULL
     OR NULLIF(BTRIM(p_employee_number), '') IS NULL
     OR NULLIF(BTRIM(p_full_name), '') IS NULL
     OR p_actor_user_id IS NULL
     OR NULLIF(BTRIM(p_audit_id), '') IS NULL THEN
    RAISE EXCEPTION 'employee_profile_invalid';
  END IF;
  IF p_employment_status IS NULL
     OR p_employment_status NOT IN ('active', 'on_leave', 'suspended', 'terminated') THEN
    RAISE EXCEPTION 'employee_profile_status_invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_company_memberships AS membership
      JOIN public.erp_users AS app_user ON app_user.id = membership.user_id
     WHERE membership.company_id = p_company_id
       AND membership.user_id = p_actor_user_id
       AND membership.is_active
       AND app_user.active
  ) THEN
    RAISE EXCEPTION 'employee_actor_unavailable';
  END IF;

  INSERT INTO public.erp_people (
    id, company_id, user_id, employee_number, full_name, email, phone,
    hired_on, employment_status, status, created_by_user_id
  )
  VALUES (
    p_person_id, p_company_id, NULL, BTRIM(p_employee_number), BTRIM(p_full_name),
    NULLIF(BTRIM(p_email), ''), NULLIF(BTRIM(p_phone), ''),
    p_hired_on, p_employment_status, 'active', p_actor_user_id
  )
  RETURNING * INTO v_person;

  INSERT INTO public.erp_audit_log (
    id, company_id, actor_user_id, actor_username, action, module, details
  )
  VALUES (
    p_audit_id,
    p_company_id,
    p_actor_user_id,
    p_actor_username,
    'employee_profile.created',
    'hr',
    jsonb_build_object(
      'personId', v_person.id,
      'employeeNumber', v_person.employee_number,
      'fullName', v_person.full_name,
      'employmentStatus', v_person.employment_status
    )
  );

  RETURN to_jsonb(v_person);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_update_employee_profile(
  p_person_id UUID,
  p_company_id UUID,
  p_employee_number TEXT,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_hired_on DATE,
  p_employment_status TEXT,
  p_record_status TEXT,
  p_actor_user_id TEXT,
  p_actor_username TEXT,
  p_audit_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous public.erp_people%ROWTYPE;
  v_updated public.erp_people%ROWTYPE;
BEGIN
  IF p_person_id IS NULL OR p_company_id IS NULL
     OR NULLIF(BTRIM(p_employee_number), '') IS NULL
     OR NULLIF(BTRIM(p_full_name), '') IS NULL
     OR p_actor_user_id IS NULL
     OR NULLIF(BTRIM(p_audit_id), '') IS NULL THEN
    RAISE EXCEPTION 'employee_profile_invalid';
  END IF;
  IF p_employment_status IS NULL
     OR p_employment_status NOT IN ('active', 'on_leave', 'suspended', 'terminated') THEN
    RAISE EXCEPTION 'employee_profile_status_invalid';
  END IF;
  IF p_record_status IS NULL
     OR p_record_status NOT IN ('active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'employee_profile_record_status_invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_company_memberships AS membership
      JOIN public.erp_users AS app_user ON app_user.id = membership.user_id
     WHERE membership.company_id = p_company_id
       AND membership.user_id = p_actor_user_id
       AND membership.is_active
       AND app_user.active
  ) THEN
    RAISE EXCEPTION 'employee_actor_unavailable';
  END IF;

  SELECT person.*
    INTO v_previous
    FROM public.erp_people AS person
   WHERE person.company_id = p_company_id
     AND person.id = p_person_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_profile_not_found';
  END IF;

  UPDATE public.erp_people
     SET employee_number = BTRIM(p_employee_number),
         full_name = BTRIM(p_full_name),
         email = NULLIF(BTRIM(p_email), ''),
         phone = NULLIF(BTRIM(p_phone), ''),
         hired_on = p_hired_on,
         employment_status = p_employment_status,
         status = p_record_status,
         updated_at = NOW()
   WHERE company_id = p_company_id
     AND id = p_person_id
  RETURNING * INTO v_updated;

  INSERT INTO public.erp_audit_log (
    id, company_id, actor_user_id, actor_username, action, module, details
  )
  VALUES (
    p_audit_id,
    p_company_id,
    p_actor_user_id,
    p_actor_username,
    'employee_profile.updated',
    'hr',
    jsonb_build_object(
      'personId', v_updated.id,
      'changedFields', jsonb_build_array(
        'employeeNumber', 'fullName', 'email', 'phone', 'hiredOn',
        'employmentStatus', 'status'
      ),
      'previousValues', jsonb_build_object(
        'employeeNumber', v_previous.employee_number,
        'fullName', v_previous.full_name,
        'employmentStatus', v_previous.employment_status,
        'status', v_previous.status
      ),
      'newValues', jsonb_build_object(
        'employeeNumber', v_updated.employee_number,
        'fullName', v_updated.full_name,
        'employmentStatus', v_updated.employment_status,
        'status', v_updated.status
      )
    )
  );

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_create_employee_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_update_employee_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_employee_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_update_employee_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
