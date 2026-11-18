CREATE TABLE IF NOT EXISTS public.erp_companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.erp_companies (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'شركة ERP')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.erp_users (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.erp_companies(id),
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'عام',
  title TEXT NOT NULL DEFAULT 'موظف',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '[]'::JSONB,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT NOT NULL,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  last_failed_login_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, username_normalized)
);

CREATE TABLE IF NOT EXISTS public.erp_sessions (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.erp_companies(id),
  user_id TEXT NOT NULL REFERENCES public.erp_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  remember_me BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS erp_sessions_user_id_idx
  ON public.erp_sessions (company_id, user_id);

CREATE INDEX IF NOT EXISTS erp_sessions_expiry_idx
  ON public.erp_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.erp_records (
  company_id UUID NOT NULL REFERENCES public.erp_companies(id),
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_by TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, entity, record_id)
);

CREATE INDEX IF NOT EXISTS erp_records_entity_updated_idx
  ON public.erp_records (company_id, entity, updated_at DESC);

CREATE INDEX IF NOT EXISTS erp_records_data_gin_idx
  ON public.erp_records USING GIN (data);

CREATE UNIQUE INDEX IF NOT EXISTS erp_records_accounts_code_uq
  ON public.erp_records (company_id, (data ->> 'code'))
  WHERE entity = 'accounts' AND NULLIF(data ->> 'code', '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS erp_records_products_sku_uq
  ON public.erp_records (company_id, (data ->> 'sku'))
  WHERE entity = 'products' AND NULLIF(data ->> 'sku', '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS erp_records_products_barcode_uq
  ON public.erp_records (company_id, (data ->> 'barcode'))
  WHERE entity = 'products' AND NULLIF(data ->> 'barcode', '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.erp_audit_log (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.erp_companies(id),
  actor_user_id TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  actor_username TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS erp_audit_log_company_created_idx
  ON public.erp_audit_log (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_backups (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.erp_companies(id),
  created_by TEXT REFERENCES public.erp_users(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.erp_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_backups ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.erp_post_invoice(
  p_company_id UUID,
  p_entity TEXT,
  p_invoice_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice JSONB;
  v_items JSONB;
  v_item JSONB;
  v_product JSONB;
  v_product_id TEXT;
  v_quantity NUMERIC;
  v_stock NUMERIC;
  v_delta NUMERIC;
  v_product_name TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_entity NOT IN ('salesInvoices', 'purchaseInvoices') THEN
    RAISE EXCEPTION 'Only sales and purchase invoices can be posted';
  END IF;

  SELECT data
    INTO v_invoice
    FROM public.erp_records
   WHERE company_id = p_company_id
     AND entity = p_entity
     AND record_id = p_invoice_id
   FOR UPDATE;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_invoice ->> 'status' = 'posted' THEN
    RAISE EXCEPTION 'This invoice has already been posted';
  END IF;
  IF COALESCE(v_invoice ->> 'status', 'draft') NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Only draft or approved invoices can be posted';
  END IF;

  v_items := v_invoice -> 'items';
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Invoice must contain at least one item';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_quantity := COALESCE(
      NULLIF(v_item ->> 'qty', '')::NUMERIC,
      NULLIF(v_item ->> 'quantity', '')::NUMERIC
    );
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Item quantities must be greater than zero';
    END IF;

    SELECT record_id, data
      INTO v_product_id, v_product
      FROM public.erp_records
     WHERE company_id = p_company_id
       AND entity = 'products'
       AND (
         (NULLIF(v_item ->> 'productId', '') IS NOT NULL AND record_id = v_item ->> 'productId')
         OR (NULLIF(v_item ->> 'barcode', '') IS NOT NULL AND data ->> 'barcode' = v_item ->> 'barcode')
         OR (NULLIF(v_item ->> 'sku', '') IS NOT NULL AND data ->> 'sku' = v_item ->> 'sku')
       )
     ORDER BY CASE WHEN record_id = v_item ->> 'productId' THEN 0 ELSE 1 END
     LIMIT 1
     FOR UPDATE;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Product not found for invoice item';
    END IF;

    v_stock := COALESCE(NULLIF(v_product ->> 'stockQty', '')::NUMERIC, 0);
    v_delta := CASE WHEN p_entity = 'purchaseInvoices' THEN v_quantity ELSE -v_quantity END;
    IF p_entity = 'salesInvoices' AND v_stock + v_delta < 0 THEN
      v_product_name := COALESCE(v_product ->> 'name', v_product_id);
      RAISE EXCEPTION 'Insufficient stock for %', v_product_name;
    END IF;

    UPDATE public.erp_records
       SET data = jsonb_set(data, '{stockQty}', to_jsonb(v_stock + v_delta), TRUE),
           updated_at = v_now
     WHERE company_id = p_company_id
       AND entity = 'products'
       AND record_id = v_product_id;
  END LOOP;

  v_invoice := jsonb_set(v_invoice, '{status}', '"posted"'::JSONB, TRUE);
  v_invoice := jsonb_set(v_invoice, '{postedAt}', to_jsonb(v_now), TRUE);
  v_invoice := jsonb_set(v_invoice, '{updatedAt}', to_jsonb(v_now), TRUE);

  UPDATE public.erp_records
     SET data = v_invoice,
         status = 'posted',
         updated_at = v_now
   WHERE company_id = p_company_id
     AND entity = p_entity
     AND record_id = p_invoice_id;

  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_restore_snapshot(
  p_company_id UUID,
  p_snapshot JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid backup snapshot';
  END IF;

  DELETE FROM public.erp_records WHERE company_id = p_company_id;

  INSERT INTO public.erp_records (
    company_id, entity, record_id, status, data, created_at, updated_at
  )
  SELECT
    p_company_id,
    item ->> 'entity',
    item ->> 'record_id',
    COALESCE(item ->> 'status', 'draft'),
    item -> 'data',
    COALESCE((item ->> 'created_at')::TIMESTAMPTZ, NOW()),
    COALESCE((item ->> 'updated_at')::TIMESTAMPTZ, NOW())
  FROM jsonb_array_elements(p_snapshot) AS item
  WHERE jsonb_typeof(item -> 'data') = 'object';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_import_legacy(
  p_company_id UUID,
  p_records JSONB,
  p_users JSONB,
  p_audit_log JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users INTEGER;
  v_records INTEGER;
  v_audit INTEGER;
BEGIN
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_users) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_audit_log) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid legacy import payload';
  END IF;

  IF EXISTS (SELECT 1 FROM public.erp_records WHERE company_id = p_company_id)
     OR EXISTS (SELECT 1 FROM public.erp_users WHERE company_id = p_company_id)
     OR EXISTS (SELECT 1 FROM public.erp_audit_log WHERE company_id = p_company_id) THEN
    RAISE EXCEPTION 'Legacy import requires an empty company database';
  END IF;

  INSERT INTO public.erp_users (
    id, company_id, username, username_normalized, full_name, email, role,
    department, title, active, permissions, must_change_password, password_hash,
    failed_login_attempts, last_failed_login_at, last_login_at, created_at, updated_at
  )
  SELECT
    item ->> 'id',
    p_company_id,
    item ->> 'username',
    item ->> 'username_normalized',
    item ->> 'full_name',
    NULLIF(item ->> 'email', ''),
    item ->> 'role',
    COALESCE(item ->> 'department', 'عام'),
    COALESCE(item ->> 'title', 'موظف'),
    COALESCE((item ->> 'active')::BOOLEAN, TRUE),
    COALESCE(item -> 'permissions', '[]'::JSONB),
    COALESCE((item ->> 'must_change_password')::BOOLEAN, FALSE),
    item ->> 'password_hash',
    COALESCE((item ->> 'failed_login_attempts')::INTEGER, 0),
    NULLIF(item ->> 'last_failed_login_at', '')::TIMESTAMPTZ,
    NULLIF(item ->> 'last_login_at', '')::TIMESTAMPTZ,
    COALESCE(NULLIF(item ->> 'created_at', '')::TIMESTAMPTZ, NOW()),
    COALESCE(NULLIF(item ->> 'updated_at', '')::TIMESTAMPTZ, NOW())
  FROM jsonb_array_elements(p_users) AS item;
  GET DIAGNOSTICS v_users = ROW_COUNT;

  INSERT INTO public.erp_records (
    company_id, entity, record_id, status, data, created_at, updated_at
  )
  SELECT
    p_company_id,
    item ->> 'entity',
    item ->> 'record_id',
    COALESCE(item ->> 'status', 'draft'),
    item -> 'data',
    COALESCE(NULLIF(item ->> 'created_at', '')::TIMESTAMPTZ, NOW()),
    COALESCE(NULLIF(item ->> 'updated_at', '')::TIMESTAMPTZ, NOW())
  FROM jsonb_array_elements(p_records) AS item;
  GET DIAGNOSTICS v_records = ROW_COUNT;

  INSERT INTO public.erp_audit_log (
    id, company_id, actor_user_id, actor_username, action, module, details, created_at
  )
  SELECT
    item ->> 'id',
    p_company_id,
    NULLIF(item ->> 'actor_user_id', ''),
    NULLIF(item ->> 'actor_username', ''),
    item ->> 'action',
    item ->> 'module',
    COALESCE(item -> 'details', '{}'::JSONB),
    COALESCE(NULLIF(item ->> 'created_at', '')::TIMESTAMPTZ, NOW())
  FROM jsonb_array_elements(p_audit_log) AS item;
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  RETURN jsonb_build_object('users', v_users, 'records', v_records, 'auditEntries', v_audit);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_post_invoice(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_restore_snapshot(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_import_legacy(UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_post_invoice(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_restore_snapshot(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_import_legacy(UUID, JSONB, JSONB, JSONB) TO service_role;
