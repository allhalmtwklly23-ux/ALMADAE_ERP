import type { AccountType, AccountingAccount, FinancialSnapshot, JournalEntry, LedgerEntry } from "./types";

export const chartOfAccounts = [
  { code: "1010", name: "النقدية", type: "asset" },
  { code: "1100", name: "الحسابات المدينة", type: "asset" },
  { code: "1200", name: "المخزون", type: "asset" },
  { code: "2010", name: "الموردون", type: "liability" },
  { code: "3010", name: "رأس المال", type: "equity" },
  { code: "4010", name: "الإيرادات", type: "revenue" },
  { code: "5010", name: "المصروفات التشغيلية", type: "expense" },
] as const;

export function normalizeCurrency(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  return Number.parseFloat(cleaned || "0");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function calculateBalance(debit: number, credit: number): number {
  return debit - credit;
}

export function buildTrialBalance(rows: Array<{ account: string; debit: number | string; credit: number | string }>): LedgerEntry[] {
  return rows.map((row) => {
    const debit = normalizeCurrency(String(row.debit));
    const credit = normalizeCurrency(String(row.credit));
    const balance = calculateBalance(debit, credit);

    return {
      account: row.account,
      debit,
      credit,
      balance,
    };
  });
}

export function createJournalEntry(entry: JournalEntry): JournalEntry {
  const totalDebit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry ${entry.id} is unbalanced.`);
  }

  return {
    ...entry,
    status: entry.status ?? "posted",
  };
}

export function buildFinancialSummary(): FinancialSnapshot {
  const totalRevenue = 426500;
  const totalExpenses = 178450;
  const netProfit = totalRevenue - totalExpenses;
  const receivables = 289500;
  const inventoryValue = 1420000;
  const cashBalance = 120000;
  const grossMargin = (netProfit / totalRevenue) * 100;
  const operatingMargin = (netProfit / totalRevenue) * 100;

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    receivables,
    inventoryValue,
    cashBalance,
    grossMargin,
    operatingMargin,
  };
}

export function buildAccountingLedger(): AccountingAccount[] {
  const ledger: AccountingAccount[] = [
    { code: "1010", name: "النقدية", type: "asset" as AccountType, debit: 120000, credit: 0, balance: 120000 },
    { code: "1100", name: "الحسابات المدينة", type: "asset" as AccountType, debit: 90250, credit: 0, balance: 90250 },
    { code: "1200", name: "المخزون", type: "asset" as AccountType, debit: 350000, credit: 0, balance: 350000 },
    { code: "2010", name: "الموردون", type: "liability" as AccountType, debit: 0, credit: 42400, balance: 42400 },
    { code: "4010", name: "الإيرادات", type: "revenue" as AccountType, debit: 0, credit: 210500, balance: 210500 },
    { code: "5010", name: "المصروفات التشغيلية", type: "expense" as AccountType, debit: 74000, credit: 0, balance: 74000 },
  ];

  return ledger.map((entry) => ({
    ...entry,
    balance: calculateBalance(entry.debit, entry.credit),
  }));
}

export function buildOperationalRatios() {
  const summary = buildFinancialSummary();

  return {
    currentRatio: Number(((summary.cashBalance + summary.receivables) / Math.max(summary.totalExpenses, 1)).toFixed(2)),
    quickRatio: Number((summary.cashBalance / Math.max(summary.totalExpenses, 1)).toFixed(2)),
    inventoryTurnover: Number((summary.totalRevenue / Math.max(summary.inventoryValue, 1)).toFixed(2)),
    margin: Number(summary.grossMargin.toFixed(2)),
  };
}
