CREATE TABLE IF NOT EXISTS public.erp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name TEXT NOT NULL CHECK (NULLIF(BTRIM(name), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_groups_code_normalized_uq
  ON public.erp_groups (LOWER(BTRIM(code)));

ALTER TABLE public.erp_companies
  ADD COLUMN IF NOT EXISTS group_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.erp_companies'::REGCLASS
       AND conname = 'erp_companies_group_id_fkey'
  ) THEN
    ALTER TABLE public.erp_companies
      ADD CONSTRAINT erp_companies_group_id_fkey
      FOREIGN KEY (group_id)
      REFERENCES public.erp_groups(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS erp_companies_group_id_idx
  ON public.erp_companies (group_id)
  WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.erp_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name TEXT NOT NULL CHECK (NULLIF(BTRIM(name), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_branches_company_code_normalized_uq
  ON public.erp_branches (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  branch_id UUID,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name TEXT NOT NULL CHECK (NULLIF(BTRIM(name), '') IS NOT NULL),
  location_type TEXT NOT NULL DEFAULT 'other'
    CHECK (NULLIF(BTRIM(location_type), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, branch_id)
    REFERENCES public.erp_branches(company_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_locations_company_code_normalized_uq
  ON public.erp_locations (company_id, LOWER(BTRIM(code)));

CREATE INDEX IF NOT EXISTS erp_locations_company_branch_idx
  ON public.erp_locations (company_id, branch_id);

CREATE TABLE IF NOT EXISTS public.erp_org_unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_org_unit_types_company_code_normalized_uq
  ON public.erp_org_unit_types (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_org_structure_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  allows_multiple_parents BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_org_structure_types_company_code_normalized_uq
  ON public.erp_org_structure_types (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_org_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  unit_type_id UUID NOT NULL,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, unit_type_id)
    REFERENCES public.erp_org_unit_types(company_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_org_units_company_code_normalized_uq
  ON public.erp_org_units (company_id, LOWER(BTRIM(code)));

CREATE INDEX IF NOT EXISTS erp_org_units_company_type_status_idx
  ON public.erp_org_units (company_id, unit_type_id, status);

CREATE TABLE IF NOT EXISTS public.erp_org_unit_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  structure_type_id UUID NOT NULL,
  parent_unit_id UUID NOT NULL,
  child_unit_id UUID NOT NULL,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  source_entity TEXT,
  source_record_id TEXT,
  approved_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_unit_id <> child_unit_id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (company_id, id),
  UNIQUE (company_id, structure_type_id, parent_unit_id, child_unit_id, valid_from),
  FOREIGN KEY (company_id, structure_type_id)
    REFERENCES public.erp_org_structure_types(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, parent_unit_id)
    REFERENCES public.erp_org_units(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, child_unit_id)
    REFERENCES public.erp_org_units(company_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS erp_org_unit_relationships_parent_history_idx
  ON public.erp_org_unit_relationships
    (company_id, structure_type_id, parent_unit_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS erp_org_unit_relationships_child_history_idx
  ON public.erp_org_unit_relationships
    (company_id, structure_type_id, child_unit_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS public.erp_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (NULLIF(BTRIM(full_name), '') IS NOT NULL),
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE INDEX IF NOT EXISTS erp_people_company_name_idx
  ON public.erp_people (company_id, LOWER(BTRIM(full_name)));

CREATE INDEX IF NOT EXISTS erp_people_company_user_idx
  ON public.erp_people (company_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.erp_job_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_job_families_company_code_normalized_uq
  ON public.erp_job_families (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_job_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  level_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_job_levels_company_code_normalized_uq
  ON public.erp_job_levels (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_job_titles_company_code_normalized_uq
  ON public.erp_job_titles (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  org_unit_id UUID,
  job_family_id UUID,
  job_level_id UUID,
  job_title_id UUID,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  responsibility_limits JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(responsibility_limits) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, org_unit_id)
    REFERENCES public.erp_org_units(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, job_family_id)
    REFERENCES public.erp_job_families(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, job_level_id)
    REFERENCES public.erp_job_levels(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, job_title_id)
    REFERENCES public.erp_job_titles(company_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_positions_company_code_normalized_uq
  ON public.erp_positions (company_id, LOWER(BTRIM(code)));

CREATE INDEX IF NOT EXISTS erp_positions_company_unit_status_idx
  ON public.erp_positions (company_id, org_unit_id, status);

CREATE TABLE IF NOT EXISTS public.erp_employee_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL,
  position_id UUID,
  org_unit_id UUID,
  branch_id UUID,
  assignment_type TEXT NOT NULL CHECK (NULLIF(BTRIM(assignment_type), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'ended')),
  valid_from DATE NOT NULL,
  valid_to DATE,
  source_entity TEXT,
  source_record_id TEXT,
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (company_id, person_id)
    REFERENCES public.erp_people(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, position_id)
    REFERENCES public.erp_positions(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, org_unit_id)
    REFERENCES public.erp_org_units(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, branch_id)
    REFERENCES public.erp_branches(company_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS erp_employee_assignments_person_history_idx
  ON public.erp_employee_assignments
    (company_id, person_id, valid_from DESC, valid_to);

CREATE INDEX IF NOT EXISTS erp_employee_assignments_position_history_idx
  ON public.erp_employee_assignments
    (company_id, position_id, valid_from DESC)
  WHERE position_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.erp_reporting_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  structure_type_id UUID NOT NULL,
  assignment_id UUID NOT NULL,
  manager_assignment_id UUID NOT NULL,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  source_entity TEXT,
  source_record_id TEXT,
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, structure_type_id, assignment_id, manager_assignment_id, valid_from),
  CHECK (assignment_id <> manager_assignment_id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (company_id, structure_type_id)
    REFERENCES public.erp_org_structure_types(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, assignment_id)
    REFERENCES public.erp_employee_assignments(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, manager_assignment_id)
    REFERENCES public.erp_employee_assignments(company_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS erp_reporting_relationships_assignment_history_idx
  ON public.erp_reporting_relationships
    (company_id, structure_type_id, assignment_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS erp_reporting_relationships_manager_history_idx
  ON public.erp_reporting_relationships
    (company_id, structure_type_id, manager_assignment_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS public.erp_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  resource TEXT NOT NULL CHECK (NULLIF(BTRIM(resource), '') IS NOT NULL),
  action TEXT NOT NULL CHECK (NULLIF(BTRIM(action), '') IS NOT NULL),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource, action)
);

CREATE TABLE IF NOT EXISTS public.erp_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  name_ar TEXT NOT NULL CHECK (NULLIF(BTRIM(name_ar), '') IS NOT NULL),
  name_en TEXT,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_roles_company_code_normalized_uq
  ON public.erp_roles (company_id, LOWER(BTRIM(code)));

CREATE TABLE IF NOT EXISTS public.erp_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL,
  permission_id UUID NOT NULL REFERENCES public.erp_permissions(id) ON DELETE RESTRICT,
  scope_definition JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(scope_definition) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, role_id, permission_id),
  FOREIGN KEY (company_id, role_id)
    REFERENCES public.erp_roles(company_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.erp_membership_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  role_id UUID NOT NULL,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, user_id, role_id, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (company_id, user_id)
    REFERENCES public.erp_company_memberships(company_id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (company_id, role_id)
    REFERENCES public.erp_roles(company_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS erp_membership_roles_active_idx
  ON public.erp_membership_roles (company_id, user_id, valid_from DESC, valid_to);

CREATE TABLE IF NOT EXISTS public.erp_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  resource TEXT NOT NULL CHECK (NULLIF(BTRIM(resource), '') IS NOT NULL),
  action TEXT NOT NULL CHECK (NULLIF(BTRIM(action), '') IS NOT NULL),
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  scope_type TEXT NOT NULL CHECK (NULLIF(BTRIM(scope_type), '') IS NOT NULL),
  conditions JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(conditions) = 'object'),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS erp_policy_rules_lookup_idx
  ON public.erp_policy_rules (company_id, resource, action, status, priority DESC);

CREATE TABLE IF NOT EXISTS public.erp_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  grantor_user_id TEXT NOT NULL,
  delegate_user_id TEXT NOT NULL,
  permission_codes TEXT[] NOT NULL CHECK (CARDINALITY(permission_codes) > 0),
  scope_definition JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(scope_definition) = 'object'),
  approval_limit NUMERIC(18, 4),
  currency_code CHAR(3),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  CHECK (grantor_user_id <> delegate_user_id),
  CHECK (valid_to > valid_from),
  CHECK (approval_limit IS NULL OR approval_limit >= 0),
  CHECK ((approval_limit IS NULL) = (currency_code IS NULL)),
  FOREIGN KEY (company_id, grantor_user_id)
    REFERENCES public.erp_company_memberships(company_id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (company_id, delegate_user_id)
    REFERENCES public.erp_company_memberships(company_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS erp_delegations_grantor_active_idx
  ON public.erp_delegations (company_id, grantor_user_id, valid_from, valid_to)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS erp_delegations_delegate_active_idx
  ON public.erp_delegations (company_id, delegate_user_id, valid_from, valid_to)
  WHERE revoked_at IS NULL;

ALTER TABLE public.erp_audit_log
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS previous_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS outcome TEXT
    CHECK (outcome IS NULL OR outcome IN ('succeeded', 'failed')),
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS erp_audit_log_entity_history_idx
  ON public.erp_audit_log (company_id, entity_type, entity_id, created_at DESC)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

ALTER TABLE public.erp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_org_unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_org_structure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_org_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_org_unit_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_job_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_job_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_employee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_reporting_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_delegations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.erp_groups,
  public.erp_branches,
  public.erp_locations,
  public.erp_org_unit_types,
  public.erp_org_structure_types,
  public.erp_org_units,
  public.erp_org_unit_relationships,
  public.erp_people,
  public.erp_job_families,
  public.erp_job_levels,
  public.erp_job_titles,
  public.erp_positions,
  public.erp_employee_assignments,
  public.erp_reporting_relationships,
  public.erp_permissions,
  public.erp_roles,
  public.erp_role_permissions,
  public.erp_membership_roles,
  public.erp_policy_rules,
  public.erp_delegations
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.erp_groups,
  public.erp_groups,
  public.erp_branches,
  public.erp_locations,
  public.erp_org_unit_types,
  public.erp_org_structure_types,
  public.erp_org_units,
  public.erp_org_unit_relationships,
  public.erp_people,
  public.erp_job_families,
  public.erp_job_levels,
  public.erp_job_titles,
  public.erp_positions,
  public.erp_employee_assignments,
  public.erp_reporting_relationships,
  public.erp_roles,
  public.erp_role_permissions,
  public.erp_membership_roles,
  public.erp_policy_rules,
  public.erp_delegations
TO service_role;

GRANT SELECT ON TABLE public.erp_permissions TO service_role;

CREATE OR REPLACE FUNCTION public.erp_save_org_unit_relationship(
  p_id UUID,
  p_company_id UUID,
  p_structure_type_id UUID,
  p_parent_unit_id UUID,
  p_child_unit_id UUID,
  p_valid_from DATE,
  p_source_entity TEXT,
  p_source_record_id TEXT,
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
  v_allows_multiple_parents BOOLEAN;
  v_cycle_exists BOOLEAN;
  v_unit_count INTEGER;
  v_overlapping_parents INTEGER;
  v_existing public.erp_org_unit_relationships%ROWTYPE;
  v_created public.erp_org_unit_relationships%ROWTYPE;
  v_closed_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_id IS NULL OR p_company_id IS NULL OR p_structure_type_id IS NULL
     OR p_parent_unit_id IS NULL OR p_child_unit_id IS NULL
     OR p_valid_from IS NULL OR p_actor_user_id IS NULL
     OR NULLIF(BTRIM(p_audit_id), '') IS NULL THEN
    RAISE EXCEPTION 'organization_relationship_invalid';
  END IF;
  IF p_parent_unit_id = p_child_unit_id THEN
    RAISE EXCEPTION 'organization_relationship_self_parent';
  END IF;
  IF p_valid_from < CURRENT_DATE THEN
    RAISE EXCEPTION 'organization_relationship_backdate_not_allowed';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_company_id::TEXT || ':' || p_structure_type_id::TEXT, 0)
  );

  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_company_memberships AS membership
      JOIN public.erp_users AS app_user ON app_user.id = membership.user_id
     WHERE membership.company_id = p_company_id
       AND membership.user_id = p_actor_user_id
       AND membership.is_active
       AND app_user.active
  ) THEN
    RAISE EXCEPTION 'organization_actor_unavailable';
  END IF;

  SELECT structure_type.allows_multiple_parents
    INTO v_allows_multiple_parents
    FROM public.erp_org_structure_types AS structure_type
   WHERE structure_type.company_id = p_company_id
     AND structure_type.id = p_structure_type_id
     AND structure_type.status = 'active'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_structure_type_unavailable';
  END IF;

  SELECT COUNT(*)
    INTO v_unit_count
    FROM public.erp_org_units AS org_unit
   WHERE org_unit.company_id = p_company_id
     AND org_unit.status = 'active'
     AND org_unit.id IN (p_parent_unit_id, p_child_unit_id);
  IF v_unit_count <> 2 THEN
    RAISE EXCEPTION 'organization_units_unavailable';
  END IF;

  WITH RECURSIVE relationship_checkpoints(check_date) AS (
    SELECT p_valid_from
    UNION
    SELECT relation.valid_from
      FROM public.erp_org_unit_relationships AS relation
     WHERE relation.company_id = p_company_id
       AND relation.structure_type_id = p_structure_type_id
       AND relation.valid_from > p_valid_from
  ),
  reachable(check_date, unit_id) AS (
    SELECT checkpoint.check_date, p_child_unit_id
      FROM relationship_checkpoints AS checkpoint
    UNION
    SELECT reachable.check_date, relation.child_unit_id
      FROM reachable
      JOIN public.erp_org_unit_relationships AS relation
        ON relation.company_id = p_company_id
       AND relation.structure_type_id = p_structure_type_id
       AND relation.parent_unit_id = reachable.unit_id
       AND relation.valid_from <= reachable.check_date
       AND (relation.valid_to IS NULL OR relation.valid_to >= reachable.check_date)
  )
  SELECT EXISTS (
    SELECT 1
      FROM reachable
     WHERE reachable.unit_id = p_parent_unit_id
  )
    INTO v_cycle_exists;

  IF v_cycle_exists THEN
    RAISE EXCEPTION 'organization_relationship_cycle';
  END IF;

  IF NOT v_allows_multiple_parents THEN
    SELECT COUNT(*)
      INTO v_overlapping_parents
      FROM public.erp_org_unit_relationships AS relation
     WHERE relation.company_id = p_company_id
       AND relation.structure_type_id = p_structure_type_id
       AND relation.child_unit_id = p_child_unit_id
       AND (relation.valid_to IS NULL OR relation.valid_to >= p_valid_from);

    IF v_overlapping_parents > 1 THEN
      RAISE EXCEPTION 'organization_relationship_data_conflict';
    END IF;

    FOR v_existing IN
      SELECT relation.*
        FROM public.erp_org_unit_relationships AS relation
       WHERE relation.company_id = p_company_id
         AND relation.structure_type_id = p_structure_type_id
         AND relation.child_unit_id = p_child_unit_id
         AND (relation.valid_to IS NULL OR relation.valid_to >= p_valid_from)
       ORDER BY relation.valid_from
       FOR UPDATE
    LOOP
      IF v_existing.parent_unit_id = p_parent_unit_id THEN
        RAISE EXCEPTION 'organization_relationship_already_active';
      END IF;
      IF v_existing.valid_from >= p_valid_from THEN
        RAISE EXCEPTION 'organization_relationship_future_conflict';
      END IF;

      UPDATE public.erp_org_unit_relationships
         SET valid_to = p_valid_from - 1
       WHERE company_id = p_company_id
         AND id = v_existing.id;

      v_closed_ids := array_append(v_closed_ids, v_existing.id);
      INSERT INTO public.erp_audit_log (
        id, company_id, actor_user_id, actor_username, action, module, details
      )
      VALUES (
        'audit-' || gen_random_uuid()::TEXT,
        p_company_id,
        p_actor_user_id,
        p_actor_username,
        'organization.relationship.closed_by_replacement',
        'organization',
        jsonb_build_object(
          'relationshipId', v_existing.id,
          'previousParentUnitId', v_existing.parent_unit_id,
          'childUnitId', v_existing.child_unit_id,
          'previousValidTo', v_existing.valid_to,
          'validTo', p_valid_from - 1,
          'replacementParentUnitId', p_parent_unit_id
        )
      );
    END LOOP;
  END IF;

  INSERT INTO public.erp_org_unit_relationships (
    id, company_id, structure_type_id, parent_unit_id, child_unit_id,
    valid_from, source_entity, source_record_id, created_by_user_id
  )
  VALUES (
    p_id, p_company_id, p_structure_type_id, p_parent_unit_id, p_child_unit_id,
    p_valid_from, p_source_entity, p_source_record_id, p_actor_user_id
  )
  RETURNING * INTO v_created;

  INSERT INTO public.erp_audit_log (
    id, company_id, actor_user_id, actor_username, action, module, details
  )
  VALUES (
    p_audit_id,
    p_company_id,
    p_actor_user_id,
    p_actor_username,
    'organization.relationship.created',
    'organization',
    jsonb_build_object(
      'relationshipId', v_created.id,
      'structureTypeId', v_created.structure_type_id,
      'parentUnitId', v_created.parent_unit_id,
      'childUnitId', v_created.child_unit_id,
      'validFrom', v_created.valid_from,
      'closedRelationshipIds', to_jsonb(v_closed_ids)
    )
  );

  RETURN to_jsonb(v_created) || jsonb_build_object('closed_relationship_ids', v_closed_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_end_org_unit_relationship(
  p_company_id UUID,
  p_relationship_id UUID,
  p_valid_to DATE,
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
  v_structure_type_id UUID;
  v_relationship public.erp_org_unit_relationships%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_relationship_id IS NULL OR p_valid_to IS NULL
     OR p_actor_user_id IS NULL OR NULLIF(BTRIM(p_audit_id), '') IS NULL THEN
    RAISE EXCEPTION 'organization_relationship_invalid';
  END IF;

  SELECT relation.structure_type_id
    INTO v_structure_type_id
    FROM public.erp_org_unit_relationships AS relation
   WHERE relation.company_id = p_company_id
     AND relation.id = p_relationship_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_relationship_not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_company_id::TEXT || ':' || v_structure_type_id::TEXT, 0)
  );

  IF NOT EXISTS (
    SELECT 1
      FROM public.erp_company_memberships AS membership
      JOIN public.erp_users AS app_user ON app_user.id = membership.user_id
     WHERE membership.company_id = p_company_id
       AND membership.user_id = p_actor_user_id
       AND membership.is_active
       AND app_user.active
  ) THEN
    RAISE EXCEPTION 'organization_actor_unavailable';
  END IF;

  SELECT relation.*
    INTO v_relationship
    FROM public.erp_org_unit_relationships AS relation
   WHERE relation.company_id = p_company_id
     AND relation.id = p_relationship_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_relationship_not_found';
  END IF;
  IF v_relationship.valid_to IS NOT NULL THEN
    RAISE EXCEPTION 'organization_relationship_already_ended';
  END IF;
  IF p_valid_to < v_relationship.valid_from THEN
    RAISE EXCEPTION 'organization_relationship_invalid_date';
  END IF;

  UPDATE public.erp_org_unit_relationships
     SET valid_to = p_valid_to
   WHERE company_id = p_company_id
     AND id = p_relationship_id
  RETURNING * INTO v_relationship;

  INSERT INTO public.erp_audit_log (
    id, company_id, actor_user_id, actor_username, action, module, details
  )
  VALUES (
    p_audit_id,
    p_company_id,
    p_actor_user_id,
    p_actor_username,
    'organization.relationship.ended',
    'organization',
    jsonb_build_object(
      'relationshipId', v_relationship.id,
      'structureTypeId', v_relationship.structure_type_id,
      'parentUnitId', v_relationship.parent_unit_id,
      'childUnitId', v_relationship.child_unit_id,
      'validFrom', v_relationship.valid_from,
      'validTo', v_relationship.valid_to
    )
  );

  RETURN to_jsonb(v_relationship);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_save_org_unit_relationship(UUID, UUID, UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_end_org_unit_relationship(UUID, UUID, DATE, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_save_org_unit_relationship(UUID, UUID, UUID, UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_end_org_unit_relationship(UUID, UUID, DATE, TEXT, TEXT, TEXT)
  TO service_role;
