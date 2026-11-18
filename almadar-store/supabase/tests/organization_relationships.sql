-- Run only against an isolated test database after applying the project migrations.
-- All fixture data is rolled back at the end; never remove this ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_company_id UUID := gen_random_uuid();
  v_other_company_id UUID := gen_random_uuid();
  v_actor_id TEXT := 'organization-test-' || gen_random_uuid()::TEXT;
  v_unit_type_id UUID := gen_random_uuid();
  v_single_parent_type_id UUID := gen_random_uuid();
  v_multiple_parent_type_id UUID := gen_random_uuid();
  v_unit_a UUID := gen_random_uuid();
  v_unit_b UUID := gen_random_uuid();
  v_unit_c UUID := gen_random_uuid();
  v_unit_d UUID := gen_random_uuid();
  v_unit_e UUID := gen_random_uuid();
  v_relationship_id UUID;
  v_replacement_relationship_id UUID;
  v_audit_count BIGINT;
  v_error TEXT;
BEGIN
  INSERT INTO public.erp_companies (id, name)
  VALUES (v_company_id, 'Organization relationship test');

  INSERT INTO public.erp_users (
    id, company_id, username, username_normalized, full_name, role, password_hash
  )
  VALUES (
    v_actor_id, v_company_id, v_actor_id, LOWER(v_actor_id), 'Test actor', 'owner', 'test-only'
  );

  INSERT INTO public.erp_company_memberships (company_id, user_id, role, is_active)
  VALUES (v_company_id, v_actor_id, 'owner', TRUE);

  INSERT INTO public.erp_org_unit_types (id, company_id, code, name_ar)
  VALUES (v_unit_type_id, v_company_id, 'TEST', 'اختبار');

  INSERT INTO public.erp_org_structure_types (id, company_id, code, name_ar, allows_multiple_parents)
  VALUES
    (v_single_parent_type_id, v_company_id, 'TEST_SINGLE', 'اختبار أحادي الأب', FALSE),
    (v_multiple_parent_type_id, v_company_id, 'TEST_MULTI', 'اختبار متعدد الآباء', TRUE);

  INSERT INTO public.erp_org_units (id, company_id, unit_type_id, code, name_ar)
  VALUES
    (v_unit_a, v_company_id, v_unit_type_id, 'TEST_A', 'وحدة أ'),
    (v_unit_b, v_company_id, v_unit_type_id, 'TEST_B', 'وحدة ب'),
    (v_unit_c, v_company_id, v_unit_type_id, 'TEST_C', 'وحدة ج'),
    (v_unit_d, v_company_id, v_unit_type_id, 'TEST_D', 'وحدة د'),
    (v_unit_e, v_company_id, v_unit_type_id, 'TEST_E', 'وحدة هـ');

  PERFORM public.erp_save_org_unit_relationship(
    gen_random_uuid(), v_company_id, v_single_parent_type_id, v_unit_a, v_unit_b,
    CURRENT_DATE, NULL, NULL, v_actor_id, v_actor_id, 'org-test-' || gen_random_uuid()::TEXT
  );
  PERFORM public.erp_save_org_unit_relationship(
    gen_random_uuid(), v_company_id, v_single_parent_type_id, v_unit_b, v_unit_c,
    CURRENT_DATE, NULL, NULL, v_actor_id, v_actor_id, 'org-test-' || gen_random_uuid()::TEXT
  );

  SELECT COUNT(*) INTO v_audit_count
  FROM public.erp_audit_log
  WHERE company_id = v_company_id;

  BEGIN
    PERFORM public.erp_save_org_unit_relationship(
      gen_random_uuid(), v_company_id, v_single_parent_type_id, v_unit_c, v_unit_a,
      CURRENT_DATE, NULL, NULL, v_actor_id, v_actor_id, 'org-test-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected organization_relationship_cycle';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'organization_relationship_cycle' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.erp_org_unit_relationships
    WHERE company_id = v_company_id
      AND structure_type_id = v_single_parent_type_id
      AND parent_unit_id = v_unit_c
      AND child_unit_id = v_unit_a
  ) THEN
    RAISE EXCEPTION 'Cycle rejection left a relationship behind';
  END IF;
  IF (SELECT COUNT(*) FROM public.erp_audit_log WHERE company_id = v_company_id) <> v_audit_count THEN
    RAISE EXCEPTION 'Cycle rejection wrote an audit row';
  END IF;

  PERFORM public.erp_save_org_unit_relationship(
    gen_random_uuid(), v_company_id, v_single_parent_type_id, v_unit_d, v_unit_c,
    CURRENT_DATE + 1, NULL, NULL, v_actor_id, v_actor_id, 'org-test-' || gen_random_uuid()::TEXT
  );

  SELECT id INTO v_relationship_id
  FROM public.erp_org_unit_relationships
  WHERE company_id = v_company_id
    AND structure_type_id = v_single_parent_type_id
    AND parent_unit_id = v_unit_b
    AND child_unit_id = v_unit_c;

  IF NOT EXISTS (
    SELECT 1 FROM public.erp_org_unit_relationships
    WHERE id = v_relationship_id AND valid_to = CURRENT_DATE
  ) THEN
    RAISE EXCEPTION 'Single-parent replacement did not close the prior relationship';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_audit_log
    WHERE company_id = v_company_id
      AND action = 'organization.relationship.closed_by_replacement'
      AND details ->> 'relationshipId' = v_relationship_id::TEXT
  ) THEN
    RAISE EXCEPTION 'Single-parent replacement did not write its audit entry';
  END IF;

  SELECT id INTO v_replacement_relationship_id
  FROM public.erp_org_unit_relationships
  WHERE company_id = v_company_id
    AND structure_type_id = v_single_parent_type_id
    AND parent_unit_id = v_unit_d
    AND child_unit_id = v_unit_c;

  BEGIN
    PERFORM public.erp_end_org_unit_relationship(
      v_company_id, v_replacement_relationship_id, CURRENT_DATE, v_actor_id, v_actor_id,
      'org-test-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected organization_relationship_invalid_date';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'organization_relationship_invalid_date' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.erp_end_org_unit_relationship(
    v_company_id, v_replacement_relationship_id, CURRENT_DATE + 1, v_actor_id, v_actor_id,
    'org-test-' || gen_random_uuid()::TEXT
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_org_unit_relationships
    WHERE id = v_replacement_relationship_id AND valid_to = CURRENT_DATE + 1
  ) THEN
    RAISE EXCEPTION 'Relationship end did not persist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_audit_log
    WHERE company_id = v_company_id
      AND action = 'organization.relationship.ended'
      AND details ->> 'relationshipId' = v_replacement_relationship_id::TEXT
  ) THEN
    RAISE EXCEPTION 'Relationship end did not write its audit entry';
  END IF;

  BEGIN
    PERFORM public.erp_end_org_unit_relationship(
      v_other_company_id, v_relationship_id, CURRENT_DATE, v_actor_id, v_actor_id,
      'org-test-' || gen_random_uuid()::TEXT
    );
    RAISE EXCEPTION 'Expected organization_relationship_not_found';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'organization_relationship_not_found' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.erp_save_org_unit_relationship(
    gen_random_uuid(), v_company_id, v_multiple_parent_type_id, v_unit_a, v_unit_e,
    CURRENT_DATE, NULL, NULL, v_actor_id, v_actor_id, 'org-test-' || gen_random_uuid()::TEXT
  );
  PERFORM public.erp_save_org_unit_relationship(
    gen_random_uuid(), v_company_id, v_multiple_parent_type_id, v_unit_b, v_unit_e,
    CURRENT_DATE, NULL, NULL, v_actor_id, v_actor_id, 'org-test-' || gen_random_uuid()::TEXT
  );

  IF (
    SELECT COUNT(*) FROM public.erp_org_unit_relationships
    WHERE company_id = v_company_id
      AND structure_type_id = v_multiple_parent_type_id
      AND child_unit_id = v_unit_e
  ) <> 2 THEN
    RAISE EXCEPTION 'Multiple-parent structure rejected a valid second parent';
  END IF;

  RAISE NOTICE 'Organization relationship tests passed; all fixtures will be rolled back.';
END;
$$;

ROLLBACK;
