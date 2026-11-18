"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";

type CustomerRecord = Record<string, unknown> & {
  id: string;
  name?: string;
  status?: string;
};

type Customer360Data = {
  customer: CustomerRecord;
  linked: Record<string, CustomerRecord[]>;
  unverified: Record<string, CustomerRecord[]>;
};

type CustomerTab = "overview" | "details" | "statement" | "invoices" | "returns" | "receipts" | "contracts" | "activity";

type CustomerStatementRow = {
  id: string;
  entity: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
};

const tabDefinitions: { id: CustomerTab; label: string }[] = [
  { id: "overview", label: "نظرة عامة" },
  { id: "details", label: "البيانات الأساسية" },
  { id: "statement", label: "كشف الحساب" },
  { id: "invoices", label: "الفواتير" },
  { id: "returns", label: "المرتجعات" },
  { id: "receipts", label: "سندات القبض" },
  { id: "contracts", label: "العقود" },
  { id: "activity", label: "النشاط" },
];

const detailFields: { key: string; label: string }[] = [
  { key: "legalName", label: "الاسم القانوني" },
  { key: "customerType", label: "نوع العميل" },
  { key: "taxNumber", label: "الرقم الضريبي" },
  { key: "commercialRegistration", label: "رقم السجل التجاري" },
  { key: "phone", label: "الهاتف الرئيسي" },
  { key: "alternatePhone", label: "هاتف إضافي" },
  { key: "email", label: "البريد الإلكتروني" },
  { key: "website", label: "الموقع الإلكتروني" },
  { key: "country", label: "الدولة" },
  { key: "city", label: "المدينة" },
  { key: "address", label: "العنوان" },
  { key: "category", label: "التصنيف" },
  { key: "source", label: "مصدر العميل" },
  { key: "salesRep", label: "مسؤول المبيعات" },
  { key: "paymentTerms", label: "شروط الدفع" },
  { key: "paymentDays", label: "مدة السداد بالأيام" },
  { key: "currency", label: "العملة الافتراضية" },
  { key: "openingBalance", label: "الرصيد الافتتاحي (+ مدين / - دائن)" },
  { key: "creditLimit", label: "حد الائتمان" },
  { key: "description", label: "ملاحظات" },
];

const relationTabs: Partial<Record<CustomerTab, { entity: string; label: string; unverifiedLabel: string }>> = {
  invoices: { entity: "salesInvoices", label: "فواتير المبيعات المرتبطة", unverifiedLabel: "فواتير باسم مطابق دون معرف عميل موثق" },
  returns: { entity: "salesReturns", label: "مرتجعات المبيعات المرتبطة", unverifiedLabel: "مرتجعات باسم مطابق دون معرف عميل موثق" },
  receipts: { entity: "cashVouchers", label: "سندات القبض المرتبطة", unverifiedLabel: "سندات باسم مطابق دون معرف عميل موثق" },
  contracts: { entity: "contracts", label: "العقود المرتبطة", unverifiedLabel: "عقود باسم مطابق دون معرف عميل موثق" },
};

const statusNames: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
  posted: "مرحّل",
  cancelled: "ملغى",
  active: "نشط",
  inactive: "غير نشط",
  on_hold: "موقوف",
};

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("ar-SA").format(value);
  return String(value);
}

function formatMoney(value: number, currency = "SAR") {
  try {
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function amountOf(record: CustomerRecord) {
  const amount = Number(record.amount ?? record.total ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatBalance(value: number, currency: string) {
  if (value === 0) return `0 ${currency} · متوازن`;
  return `${formatMoney(Math.abs(value), currency)} ${value > 0 ? "مدين" : "دائن"}`;
}

function addRunningBalances(entries: CustomerStatementRow[], openingBalance: number) {
  let balance = openingBalance;
  const rows = entries.map((entry) => {
    balance += entry.debit - entry.credit;
    return { ...entry, balance };
  });
  return { rows, closingBalance: balance };
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CustomerTransactions({
  records,
  entity,
  defaultCurrency = "SAR",
  canOpenInvoices = false,
}: {
  records: CustomerRecord[];
  entity: string;
  defaultCurrency?: string;
  canOpenInvoices?: boolean;
}) {
  if (!records.length) {
    return <div className="customer-empty">لا توجد سجلات مرتبطة بمعرف هذا العميل.</div>;
  }

  return (
    <div className="customer-transactions">
      {records.map((record) => (
        <article className="customer-transaction" key={record.id}>
          <div className="customer-transaction-main">
            {entity === "salesInvoices" && canOpenInvoices ? (
              <Link href={`/invoices/${entity}/${encodeURIComponent(record.id)}`}>
                {displayValue(record.reference ?? record.id)}
              </Link>
            ) : (
              <strong>{displayValue(record.reference ?? record.name ?? record.id)}</strong>
            )}
            <span>{displayValue(record.date ?? record.dueDate ?? record.createdAt)}</span>
          </div>
          <div className="customer-transaction-meta">
            <strong>{formatMoney(amountOf(record), String(record.currency ?? defaultCurrency))}</strong>
            <span className={`status-pill status-${String(record.status ?? "draft")}`}>
              {statusNames[String(record.status ?? "draft")] ?? String(record.status ?? "مسودة")}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Customer360Workspace({ customerId }: { customerId: string }) {
  const { user } = useErpSession();
  const [data, setData] = useState<Customer360Data | null>(null);
  const [tab, setTab] = useState<CustomerTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");
  const [statementSearch, setStatementSearch] = useState("");
  const [statementQuickRange, setStatementQuickRange] = useState<"all" | "month" | "quarter" | "custom">("all");

  const canViewInvoices = hasErpPermission(user, "salesInvoices", "view");
  const canViewReturns = hasErpPermission(user, "salesReturns", "view");
  const canViewReceipts = hasErpPermission(user, "cashVouchers", "view");
  const canPrintInvoices = hasErpPermission(user, "salesInvoices", "print");
  const canCreateInvoices = hasErpPermission(user, "salesInvoices", "create");

  useEffect(() => {
    const controller = new AbortController();
    const loadCustomer = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ view: "customer360", customerId });
        const response = await fetch(`/api/erp?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json() as { success?: boolean; message?: string; data?: Customer360Data };
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.message ?? "تعذر تحميل ملف العميل.");
        }
        setData(result.data);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "تعذر تحميل ملف العميل.");
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadCustomer();
    return () => controller.abort();
  }, [customerId]);

  const linked = data?.linked ?? {};
  const verifiedInvoices = linked.salesInvoices ?? [];
  const postedInvoices = verifiedInvoices.filter((invoice) => invoice.status === "posted");
  const postedSalesTotal = postedInvoices.reduce((total, invoice) => total + amountOf(invoice), 0);
  const customer = data?.customer;
  const currency = String(customer?.currency ?? "SAR");
  const canViewStatement = canViewInvoices || canViewReturns || canViewReceipts;
  const statementTransactions: CustomerStatementRow[] = [
    ...postedInvoices.map((invoice) => ({
      id: invoice.id,
      entity: "salesInvoices",
      date: String(invoice.date ?? invoice.createdAt ?? "").slice(0, 10),
      reference: String(invoice.reference ?? invoice.id),
      description: String(invoice.description ?? "فاتورة مبيعات"),
      debit: amountOf(invoice),
      credit: 0,
    })),
    ...(linked.salesReturns ?? [])
      .filter((record) => record.status === "posted")
      .map((record) => ({
        id: record.id,
        entity: "salesReturns",
        date: String(record.date ?? record.createdAt ?? "").slice(0, 10),
        reference: String(record.reference ?? record.id),
        description: String(record.description ?? "مرتجع مبيعات"),
        debit: 0,
        credit: amountOf(record),
      })),
    ...(linked.cashVouchers ?? [])
      .filter((record) => record.status === "posted")
      .map((record) => ({
        id: record.id,
        entity: "cashVouchers",
        date: String(record.date ?? record.createdAt ?? "").slice(0, 10),
        reference: String(record.reference ?? record.id),
        description: String(record.description ?? "سند قبض"),
        debit: 0,
        credit: amountOf(record),
      })),
  ].sort((left, right) =>
    left.date.localeCompare(right.date, "ar", { numeric: true })
      || left.reference.localeCompare(right.reference, "ar", { numeric: true })
      || left.id.localeCompare(right.id)
  );
  const explicitOpeningBalance = Number(customer?.openingBalance ?? 0);
  const hasOpeningBalance = customer?.openingBalance !== undefined
    && customer.openingBalance !== null
    && customer.openingBalance !== "";
  const baseOpeningBalance = Number.isFinite(explicitOpeningBalance) ? explicitOpeningBalance : 0;
  const openingBalance = baseOpeningBalance + (statementFrom
    ? statementTransactions
      .filter((entry) => entry.date && entry.date < statementFrom)
      .reduce((balance, entry) => balance + entry.debit - entry.credit, 0)
    : 0);
  const periodTransactions = statementTransactions.filter((entry) =>
    (!statementFrom || entry.date >= statementFrom)
    && (!statementTo || entry.date <= statementTo)
  );
  const statementDebit = periodTransactions.reduce((sum, entry) => sum + entry.debit, 0);
  const statementCredit = periodTransactions.reduce((sum, entry) => sum + entry.credit, 0);
  const { rows: statementRows, closingBalance } = addRunningBalances(periodTransactions, openingBalance);
  const normalizedStatementSearch = statementSearch.trim().toLocaleLowerCase();
  const visibleStatementRows = statementRows.filter((entry) => {
    if (!normalizedStatementSearch) return true;
    return [entry.date, entry.reference, entry.description, entry.entity]
      .some((value) => value.toLocaleLowerCase().includes(normalizedStatementSearch));
  });
  const openingBalanceLabel = hasOpeningBalance
    ? formatBalance(openingBalance, currency)
    : `${formatMoney(Math.abs(openingBalance), currency)} ${openingBalance >= 0 ? "مدين" : "دائن"} · دون رصيد أولي`;
  const closingBalanceLabel = hasOpeningBalance
    ? formatBalance(closingBalance, currency)
    : `${formatMoney(Math.abs(closingBalance), currency)} ${closingBalance >= 0 ? "مدين" : "دائن"} · صافي الحركات`;
  const activeRelation = relationTabs[tab];
  const canViewRelation = activeRelation
    ? hasErpPermission(user, activeRelation.entity, "view")
    : false;
  const applyStatementRange = (range: "all" | "month" | "quarter") => {
    setStatementQuickRange(range);
    setStatementSearch("");
    if (range === "all") {
      setStatementFrom("");
      setStatementTo("");
      return;
    }

    const today = new Date();
    const targetMonth = range === "month"
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const lastDayOfTargetMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    const start = range === "month"
      ? targetMonth
      : new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(today.getDate(), lastDayOfTargetMonth));
    setStatementFrom(dateInputValue(start));
    setStatementTo(dateInputValue(today));
  };
  const printStatement = () => {
    setStatementSearch("");
    window.requestAnimationFrame(() => window.print());
  };

  return (
    <ErpShell>
      <div className={`customer360-page${tab === "statement" ? " print-statement" : ""}`}>
        <Link className="customer360-back print-hide" href="/crm">← العودة إلى إدارة العملاء</Link>

        {loading ? (
          <div className="customer360-state" role="status">جارٍ تحميل ملف العميل...</div>
        ) : error ? (
          <div className="customer360-state is-error" role="alert">{error}</div>
        ) : customer ? (
          <>
            <header className="customer360-hero">
              <div className="customer360-identity">
                <span className="customer360-avatar" aria-hidden="true">
                  {(customer.name || "ع").slice(0, 1)}
                </span>
                <div>
                  <span className="eyebrow dark">ملف العميل · Customer 360</span>
                  <h1>{displayValue(customer.name)}</h1>
                  <p>
                    <span>رقم العميل</span>
                    <code dir="ltr">{customer.id}</code>
                    <span className={`status-pill status-${String(customer.status ?? "active")}`}>
                      {statusNames[String(customer.status ?? "active")] ?? String(customer.status ?? "نشط")}
                    </span>
                  </p>
                </div>
              </div>
              <div className="customer360-actions print-hide">
                {canCreateInvoices && (
                  <Link className="primary-button" href={`/operations?entity=salesInvoices&customerId=${encodeURIComponent(customer.id)}`}>
                    ＋ إنشاء فاتورة مبيعات
                  </Link>
                )}
                {canPrintInvoices && verifiedInvoices[0] && (
                  <Link className="ghost-button" href={`/invoices/salesInvoices/${encodeURIComponent(verifiedInvoices[0].id)}`}>
                    آخر فاتورة
                  </Link>
                )}
              </div>
            </header>

            <nav className="customer360-tabs print-hide" aria-label="أقسام ملف العميل">
              {tabDefinitions.map((item) => {
                const relation = relationTabs[item.id];
                const visible = item.id === "statement"
                  ? canViewStatement
                  : !relation || hasErpPermission(user, relation.entity, "view");
                if (!visible) return null;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={tab === item.id ? "active" : ""}
                    aria-current={tab === item.id ? "page" : undefined}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {tab === "overview" && (
              <>
                <section className="customer360-metrics" aria-label="مؤشرات العميل">
                  <article>
                    <span>فواتير مبيعات مرتبطة</span>
                    <strong>{verifiedInvoices.length}</strong>
                    <small>مرتبطة بمعرف العميل</small>
                  </article>
                  <article>
                    <span>فواتير مرحلة مرتبطة</span>
                    <strong>{postedInvoices.length}</strong>
                    <small>لا تشمل المسودات أو الفواتير غير الموثقة</small>
                  </article>
                  <article>
                    <span>إجمالي الفواتير المرحلة</span>
                    <strong>{formatMoney(postedSalesTotal, currency)}</strong>
                    <small>مجموع الفواتير ذات معرف العميل المطابق فقط</small>
                  </article>
                  <article>
                    <span>حد الائتمان</span>
                    <strong>{customer.creditLimit === undefined ? "—" : formatMoney(Number(customer.creditLimit) || 0, currency)}</strong>
                    <small>الرصيد المستحق غير محسوب بعد</small>
                  </article>
                </section>

                <div className="customer360-overview-grid">
                  <section className="customer360-panel">
                    <div className="customer360-panel-heading">
                      <div><span className="eyebrow dark">بيانات التواصل</span><h2>معلومات العميل</h2></div>
                      <button type="button" className="customer360-text-button" onClick={() => setTab("details")}>عرض التفاصيل</button>
                    </div>
                    <dl className="customer360-quick-details">
                      <div><dt>الهاتف</dt><dd>{displayValue(customer.phone)}</dd></div>
                      <div><dt>البريد الإلكتروني</dt><dd>{displayValue(customer.email)}</dd></div>
                      <div><dt>المدينة</dt><dd>{displayValue(customer.city)}</dd></div>
                      <div><dt>التصنيف</dt><dd>{displayValue(customer.category)}</dd></div>
                    </dl>
                  </section>

                  <section className="customer360-panel">
                    <div className="customer360-panel-heading">
                      <div><span className="eyebrow dark">آخر النشاطات التجارية</span><h2>الفواتير المرحلة</h2></div>
                      {canViewInvoices && <button type="button" className="customer360-text-button" onClick={() => setTab("invoices")}>عرض الكل</button>}
                    </div>
                    <CustomerTransactions
                      records={postedInvoices.slice(0, 4)}
                      entity="salesInvoices"
                      defaultCurrency={currency}
                      canOpenInvoices={canPrintInvoices}
                    />
                  </section>
                </div>
                <p className="customer360-accounting-note">
                  كشف الحساب التشغيلي يعرض المستندات المرحلة المرتبطة بمعرف العميل، ولا يمثل رصيد دفتر الأستاذ؛ فالتخصيصات المالية غير متاحة حالياً. لا تدخل السجلات المطابقة بالاسم في الحساب.
                </p>
              </>
            )}

            {tab === "details" && (
              <section className="customer360-panel">
                <div className="customer360-panel-heading">
                  <div><span className="eyebrow dark">الهوية والبيانات التجارية</span><h2>البيانات الأساسية</h2></div>
                </div>
                <dl className="customer360-detail-grid">
                  {detailFields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{displayValue(customer[field.key])}</dd>
                    </div>
                  ))}
                  <div><dt>تاريخ الإنشاء</dt><dd>{displayValue(customer.createdAt)}</dd></div>
                  <div><dt>حالة العميل</dt><dd>{statusNames[String(customer.status ?? "")] ?? displayValue(customer.status)}</dd></div>
                </dl>
              </section>
            )}

            {tab === "statement" && (
              <section className="customer360-panel customer360-ledger">
                {!canViewStatement ? (
                  <div className="customer360-state">لا تملك صلاحية عرض الحركات المالية للعميل.</div>
                ) : (
                  <>
                    <div className="customer360-panel-heading">
                      <div><span className="eyebrow dark">الحركات المرحلة والمرتبطة بمعرف العميل</span><h2>كشف الحساب · مدين ودائن</h2></div>
                      <div className="customer-ledger-actions print-hide">
                        <div className="customer-ledger-ranges" role="group" aria-label="اختيار فترة كشف الحساب">
                          <button type="button" className={statementQuickRange === "all" ? "active" : ""} onClick={() => applyStatementRange("all")}>كل الفترة</button>
                          <button type="button" className={statementQuickRange === "month" ? "active" : ""} onClick={() => applyStatementRange("month")}>هذا الشهر</button>
                          <button type="button" className={statementQuickRange === "quarter" ? "active" : ""} onClick={() => applyStatementRange("quarter")}>آخر ٣ أشهر</button>
                        </div>
                        <button type="button" className="primary-button customer-ledger-print-button" onClick={printStatement}>
                          طباعة / حفظ PDF
                        </button>
                      </div>
                    </div>
                    <div className="customer-ledger-print-header">
                      <span>NEXA ERP · كشف حساب عميل</span>
                      <h2>كشف حساب {displayValue(customer.name)}</h2>
                      <p>رقم العميل: <code dir="ltr">{customer.id}</code></p>
                      <p>الفترة: {statementFrom || "بداية السجل"} — {statementTo || "حتى الآن"}</p>
                    </div>
                    <div className="customer-ledger-filter-row print-hide">
                      <div className="customer-ledger-filters">
                        <label>من تاريخ<input type="date" max={statementTo || undefined} value={statementFrom} onChange={(event) => { setStatementFrom(event.target.value); setStatementQuickRange("custom"); }} /></label>
                        <label>إلى تاريخ<input type="date" min={statementFrom || undefined} value={statementTo} onChange={(event) => { setStatementTo(event.target.value); setStatementQuickRange("custom"); }} /></label>
                      </div>
                      <label className="customer-ledger-search">
                        <span className="sr-only">ابحث في حركات كشف الحساب</span>
                        <input
                          type="search"
                          value={statementSearch}
                          onChange={(event) => setStatementSearch(event.target.value)}
                          placeholder="ابحث برقم المستند أو البيان..."
                        />
                      </label>
                    </div>
                    <div className="customer-ledger-summary">
                      <div><span>الرصيد الافتتاحي للفترة</span><strong>{openingBalanceLabel}</strong></div>
                      <div><span>إجمالي المدين</span><strong>{formatMoney(statementDebit, currency)}</strong></div>
                      <div><span>إجمالي الدائن</span><strong>{formatMoney(statementCredit, currency)}</strong></div>
                      <div><span>{hasOpeningBalance ? "الرصيد الختامي" : "صافي الحركات الختامي"}</span><strong>{closingBalanceLabel}</strong></div>
                    </div>
                    <div className="customer-ledger-result-count">
                      {normalizedStatementSearch
                        ? `عرض ${visibleStatementRows.length} من ${statementRows.length} حركة`
                        : `${statementRows.length} حركة ضمن الفترة`}
                    </div>
                    {visibleStatementRows.length ? (
                      <div className="customer-ledger-table-wrap">
                        <table className="customer-ledger-table">
                          <thead>
                            <tr>
                              <th>التاريخ</th>
                              <th>رقم المستند</th>
                              <th>نوع الحركة</th>
                              <th>البيان</th>
                              <th>مدين</th>
                              <th>دائن</th>
                              <th>الرصيد التراكمي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleStatementRows.map((entry) => (
                              <tr key={`${entry.entity}:${entry.id}`}>
                                <td>{displayValue(entry.date)}</td>
                                <td>
                                  {entry.entity === "salesInvoices" && canPrintInvoices
                                    ? <Link href={`/invoices/${entry.entity}/${encodeURIComponent(entry.id)}`}>{entry.reference}</Link>
                                    : entry.reference}
                                </td>
                                <td>{entry.entity === "salesInvoices" ? "فاتورة مبيعات" : entry.entity === "salesReturns" ? "مرتجع مبيعات" : "سند قبض"}</td>
                                <td>{entry.description}</td>
                                <td>{entry.debit ? formatMoney(entry.debit, currency) : "—"}</td>
                                <td>{entry.credit ? formatMoney(entry.credit, currency) : "—"}</td>
                                <td>{formatBalance(entry.balance, currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="customer-empty">
                        {normalizedStatementSearch
                          ? "لا توجد حركة تطابق البحث. جرّب رقم مستند أو كلمة مختلفة."
                          : "لا توجد حركات مالية مرحلة ومرتبطة بمعرف هذا العميل ضمن الفترة المحددة."}
                      </div>
                    )}
                    <p className="customer-ledger-pdf-hint print-hide">لإرسال الكشف PDF، اختر «طباعة / حفظ PDF» ثم اختر «حفظ كـ PDF» من نافذة الطباعة.</p>
                    <p className="customer360-accounting-note">
                      هذا كشف تشغيلي من الفواتير والسندات والمرتجعات المرحلة المرتبطة بمعرف العميل؛ ليس بديلاً عن دفتر الأستاذ. لا تُحتسب المسودات أو السجلات المطابقة بالاسم فقط. إذا لم يُسجّل الرصيد الافتتاحي، فالرصيد الختامي هو صافي الحركات المتاحة فقط. سندات القبض غير المربوطة بمعرف العميل لا تظهر هنا.
                    </p>
                  </>
                )}
              </section>
            )}

            {activeRelation && (
              <section className="customer360-panel">
                {!canViewRelation ? (
                  <div className="customer360-state">لا تملك صلاحية عرض هذه السجلات.</div>
                ) : (
                  <>
                    <div className="customer360-panel-heading">
                      <div><span className="eyebrow dark">السجلات المتاحة حسب صلاحياتك</span><h2>{activeRelation.label}</h2></div>
                      {tab === "invoices" && canCreateInvoices && (
                        <Link className="ghost-button" href={`/operations?entity=salesInvoices&customerId=${encodeURIComponent(customer.id)}`}>إنشاء فاتورة</Link>
                      )}
                    </div>
                    <CustomerTransactions
                      records={linked[activeRelation.entity] ?? []}
                      entity={activeRelation.entity}
                      defaultCurrency={currency}
                      canOpenInvoices={canPrintInvoices}
                    />
                    {(data?.unverified[activeRelation.entity]?.length ?? 0) > 0 && (
                      <div className="customer360-unverified">
                        <strong>{activeRelation.unverifiedLabel}</strong>
                        <p>هذه السجلات تطابق اسم العميل فقط ولا تتضمن معرفه؛ لا تدخل في المؤشرات المالية الموثقة حتى ربطها ومراجعتها.</p>
                        <CustomerTransactions
                          records={data?.unverified[activeRelation.entity] ?? []}
                          entity={activeRelation.entity}
                          defaultCurrency={currency}
                          canOpenInvoices={canPrintInvoices}
                        />
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {tab === "activity" && (
              <section className="customer360-panel">
                <div className="customer360-panel-heading">
                  <div><span className="eyebrow dark">سجل العلاقة</span><h2>النشاط والمتابعات</h2></div>
                </div>
                <div className="customer-empty">
                  لا يوجد في قاعدة البيانات الحالية سجل أنشطة CRM موحّد مرتبط بمعرف العميل. لن تُعرض بيانات تجريبية هنا.
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="customer360-state">لم يتم العثور على العميل.</div>
        )}
      </div>
    </ErpShell>
  );
}
