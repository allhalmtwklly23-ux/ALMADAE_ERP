export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type RoleKey = "super_admin" | "finance_manager" | "sales_manager" | "inventory_manager" | "hr_manager" | "employee" | "auditor";

export interface LedgerEntry {
  account: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface AccountingAccount {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  lines: JournalLine[];
  status?: "posted" | "draft" | "reversed";
}

export interface FinancialSnapshot {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  receivables: number;
  inventoryValue: number;
  cashBalance: number;
  grossMargin: number;
  operatingMargin: number;
}

export interface PermissionRule {
  action: string;
  allowed: boolean;
  scope: string;
}

export interface RolePermission {
  role: RoleKey;
  name: string;
  permissions: PermissionRule[];
}
