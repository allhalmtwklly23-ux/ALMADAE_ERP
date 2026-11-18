CREATE TABLE IF NOT EXISTS public.erp_company_memberships (
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.erp_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  permissions JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(permissions) = 'array'),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_company_memberships_one_default_per_user_uq
  ON public.erp_company_memberships (user_id)
  WHERE is_default;

INSERT INTO public.erp_company_memberships (
  company_id, user_id, role, permissions, is_default
)
SELECT
  company_id,
  id,
  CASE WHEN role = 'super_admin' THEN 'owner' ELSE 'member' END,
  permissions,
  TRUE
FROM public.erp_users
ON CONFLICT (company_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.erp_company_tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  profile_code TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  vat_registration_number TEXT NOT NULL,
  commercial_registration_number TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'SA',
  business_address JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(business_address) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, profile_code)
);

CREATE INDEX IF NOT EXISTS erp_company_tax_profiles_active_idx
  ON public.erp_company_tax_profiles (company_id, is_active);

CREATE TABLE IF NOT EXISTS public.erp_egs_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  tax_profile_id UUID NOT NULL,
  unit_code TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  onboarding_state TEXT NOT NULL DEFAULT 'not_onboarded',
  credential_secret_ref TEXT,
  public_certificate_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, unit_code),
  FOREIGN KEY (company_id, tax_profile_id)
    REFERENCES public.erp_company_tax_profiles(company_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.erp_einvoice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  egs_unit_id UUID NOT NULL,
  source_entity TEXT NOT NULL
    CHECK (source_entity IN ('salesInvoices', 'salesReturns', 'creditNotes', 'debitNotes')),
  source_record_id TEXT NOT NULL,
  document_kind TEXT NOT NULL
    CHECK (document_kind IN ('tax_invoice', 'simplified_invoice', 'credit_note', 'debit_note')),
  submission_mode TEXT NOT NULL CHECK (submission_mode IN ('clearance', 'reporting')),
  invoice_uuid UUID NOT NULL,
  invoice_counter_value BIGINT NOT NULL CHECK (invoice_counter_value > 0),
  issue_datetime TIMESTAMPTZ NOT NULL,
  previous_invoice_hash TEXT,
  invoice_hash TEXT,
  qr_payload TEXT,
  xml_object_key TEXT,
  submission_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (submission_status IN (
      'draft', 'ready', 'queued', 'submitted', 'cleared', 'reported', 'rejected', 'failed'
    )),
  zatca_document_reference TEXT,
  last_response_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, invoice_uuid),
  UNIQUE (company_id, egs_unit_id, invoice_counter_value),
  UNIQUE (company_id, source_entity, source_record_id),
  FOREIGN KEY (company_id, egs_unit_id)
    REFERENCES public.erp_egs_units(company_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (company_id, source_entity, source_record_id)
    REFERENCES public.erp_records(company_id, entity, record_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS erp_einvoice_documents_submission_idx
  ON public.erp_einvoice_documents (company_id, submission_status, created_at);

CREATE TABLE IF NOT EXISTS public.erp_einvoice_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('compliance', 'clearance', 'reporting')),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  idempotency_key TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'succeeded', 'rejected', 'retryable_error', 'permanent_error')),
  response_code TEXT,
  response_summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (company_id, id),
  UNIQUE (company_id, document_id, operation, attempt_number),
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (company_id, document_id)
    REFERENCES public.erp_einvoice_documents(company_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.erp_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS erp_outbox_ready_idx
  ON public.erp_outbox (state, available_at)
  WHERE state IN ('pending', 'failed');

ALTER TABLE public.erp_company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_company_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_egs_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_einvoice_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_einvoice_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.erp_company_memberships,
  public.erp_company_tax_profiles,
  public.erp_egs_units,
  public.erp_einvoice_documents,
  public.erp_einvoice_submissions,
  public.erp_outbox
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.erp_company_memberships,
  public.erp_company_tax_profiles,
  public.erp_egs_units,
  public.erp_einvoice_documents,
  public.erp_einvoice_submissions,
  public.erp_outbox
TO service_role;
