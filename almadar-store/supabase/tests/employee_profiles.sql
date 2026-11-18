-- Run only against an isolated test database after applying all project migrations.
-- All fixture data is rolled back at the end; never remove this ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_company_id UUID := gen_random_uuid();
  v_other_company_id UUID := gen_random_uuid();
  v_actor_id TEXT := 'employee-profile-test-' || gen_random_uuid()::TEXT;
  v_person_id UUID := gen_random_uuid();
  v_result JSONB;
  v_error TEXT;
BEGIN
  INSERT INTO public.erp_companies (id, name)
  VALUES
    (v_company_id, 'Employee profile test'),
    (v_other_company_id, 'Other employee profile test');

  INSERT INTO public.erp_users (
    id, company_id, username, username_normalized, full_name, role, password_hash
  )
  VALUES (
    v_actor_id, v_company_id, v_actor_id, LOWER(v_actor_id), 'HR test actor', 'hr_manager', 'test-only'
  );

  v_result := public.erp_create_employee_profile(
    v_person_id, v_company_id, 'E-100', 'موظف اختبار',
    'employee@example.test', '0500000000', DATE '2026-01-15',
    'active', v_actor_id, v_actor_id, 'employee-profile-audit-' || gen_random_uuid()::TEXT
  );

  IF v_result ->> 'user_id' IS NOT NULL THEN
    RAISE EXCEPTION 'A profile without an account unexpectedly received a user id';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_people AS person
     WHERE person.company_id = v_company_id
       AND person.id = v_person_id
       AND person.employee_number = 'E-100'
       AND person.employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Employee profile was not persisted';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_audit_log AS audit
     WHERE audit.company_id = v_company_id
       AND audit.action = 'employee_profile.created'
       AND audit.details ->> 'personId' = v_person_id::TEXT
  ) THEN
    RAISE EXCEPTION 'Profile creation was not audited atomically';
  END IF;

  BEGIN
    PERFORM public.erp_create_employee_profile(
      gen_random_uuid(), v_company_id, 'e-100', 'موظف مكرر',
      NULL, NULL, NULL, 'active', v_actor_id, v_actor_id,
      'employee-profile-audit-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected duplicate employee number rejection';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  v_result := public.erp_update_employee_profile(
    v_person_id, v_company_id, 'E-100', 'موظف اختبار محدث',
    'employee@example.test', '0500000000', DATE '2026-01-15',
    'on_leave', 'active', v_actor_id, v_actor_id,
    'employee-profile-audit-' || gen_random_uuid()::TEXT
  );
  IF v_result ->> 'employment_status' <> 'on_leave' THEN
    RAISE EXCEPTION 'Employee profile update did not persist';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_audit_log AS audit
     WHERE audit.company_id = v_company_id
       AND audit.action = 'employee_profile.updated'
       AND audit.details -> 'previousValues' ->> 'employmentStatus' = 'active'
       AND audit.details -> 'newValues' ->> 'employmentStatus' = 'on_leave'
  ) THEN
    RAISE EXCEPTION 'Profile update history was not audited';
  END IF;

  BEGIN
    PERFORM public.erp_create_employee_profile(
      gen_random_uuid(), v_company_id, 'E-NULL', 'موظف اختبار',
      NULL, NULL, NULL, NULL, v_actor_id, v_actor_id,
      'employee-profile-audit-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected null employment status rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'employee_profile_status_invalid' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.erp_update_employee_profile(
      v_person_id, v_company_id, 'E-100', 'موظف اختبار',
      NULL, NULL, NULL, 'active', NULL, v_actor_id, v_actor_id,
      'employee-profile-audit-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected null record status rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'employee_profile_record_status_invalid' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.erp_update_employee_profile(
      v_person_id, v_other_company_id, 'E-100', 'موظف اختبار',
      NULL, NULL, NULL, 'active', 'active', v_actor_id, v_actor_id,
      'employee-profile-audit-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected cross-company update rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'employee_actor_unavailable' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
