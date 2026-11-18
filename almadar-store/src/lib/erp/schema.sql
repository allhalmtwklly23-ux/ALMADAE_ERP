CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  country_code VARCHAR(10) DEFAULT 'SA',
  currency_code VARCHAR(10) DEFAULT 'SAR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(64) NOT NULL,
  status VARCHAR(32) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  code VARCHAR(64) UNIQUE NOT NULL,
  title VARCHAR(128) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  code VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(32) NOT NULL,
  normal_balance VARCHAR(16) NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  entry_no VARCHAR(64) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  status VARCHAR(32) DEFAULT 'posted',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID REFERENCES chart_of_accounts(id),
  debit NUMERIC(18,2) DEFAULT 0,
  credit NUMERIC(18,2) DEFAULT 0,
  line_description TEXT
);

CREATE TABLE customers (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  customer_type VARCHAR(32) DEFAULT 'B2B',
  credit_limit NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(32) DEFAULT 'active'
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64),
  credit_limit NUMERIC(18,2) DEFAULT 0,
  status VARCHAR(32) DEFAULT 'active'
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  sku VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64),
  stock_qty NUMERIC(18,2) DEFAULT 0,
  reorder_level NUMERIC(18,2) DEFAULT 0,
  avg_cost NUMERIC(18,2) DEFAULT 0
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  item_id UUID REFERENCES inventory_items(id),
  movement_type VARCHAR(32) NOT NULL,
  quantity NUMERIC(18,2) NOT NULL,
  reference_no VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  payroll_month DATE NOT NULL,
  total_payroll NUMERIC(18,2) NOT NULL,
  status VARCHAR(32) DEFAULT 'draft'
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64),
  entity_id VARCHAR(128),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journal_entries_company_date ON journal_entries(company_id, entry_date);
CREATE INDEX idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX idx_inventory_items_company_sku ON inventory_items(company_id, sku);
CREATE INDEX idx_audit_logs_company_time ON audit_logs(company_id, created_at DESC);
