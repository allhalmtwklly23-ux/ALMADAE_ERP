"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErpSectionHeader, ErpShell } from "@/components/erp-shell";

type DashboardRecord = Record<string, unknown> & {
  id: string;
  status?: string;
  date?: string;
  createdAt?: string;
};

type Collections = Record<string, DashboardRecord[]>;
type ApiResponse = { success?: boolean; message?: string; collections?: Collections };
const EMPTY_RECORDS: DashboardRecord[] = [];

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  posted: "مرحّلة",
  cancelled: "ملغاة",
  active: "نشط",
};

const sources = [
  { entity: "salesInvoices", label: "فاتورة مبيعات", partner: "customerName", amount: "amount", href: "/sales" },
  { entity: "purchaseInvoices", label: "فاتورة مشتريات", partner: "vendorName", amount: "amount", href: "/procurement" },
  { entity: "cashVouchers", label: "سند قبض", partner: "partyName", amount: "amount", href: "/finance" },
  { entity: "expenses", label: "مصروف", partner: "name", amount: "amount", href: "/finance" },
  { entity: "revenues", label: "إيراد", partner: "name", amount: "amount", href: "/finance" },
] as const;

function sumAmounts(records: DashboardRecord[]) {
  return records.reduce((sum, record) => {
    if (record.status === "cancelled") return sum;
    const amount = Number(record.amount ?? record.totalAmount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function recordDate(record: DashboardRecord) {
  return String(record.date ?? record.createdAt ?? "");
}

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function DashboardOverview() {
  const [collections, setCollections] = useState<Collections>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/erp", { cache: "no-store" });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.success || !payload.collections) {
        throw new Error(payload.message ?? "تعذر تحميل بيانات لوحة التحكم.");
      }
      setCollections(payload.collections);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل بيانات لوحة التحكم.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCurrentTime(new Date().toISOString()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const salesInvoices = collections.salesInvoices ?? EMPTY_RECORDS;
  const purchaseInvoices = collections.purchaseInvoices ?? EMPTY_RECORDS;
  const salesTotal = useMemo(() => sumAmounts(salesInvoices), [salesInvoices]);
  const purchasesTotal = useMemo(() => sumAmounts(purchaseInvoices), [purchaseInvoices]);

  const monthlyData = useMemo(() => {
    if (!currentTime) return [];
    const now = new Date(currentTime);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("ar-SA", { month: "short" }).format(date),
        sales: 0,
        purchases: 0,
      };
    });
    const monthIndex = new Map(months.map((month, index) => [month.key, index]));

    for (const [entity, records] of [
      ["salesInvoices", salesInvoices],
      ["purchaseInvoices", purchaseInvoices],
    ] as const) {
      for (const record of records) {
        if (record.status === "cancelled") continue;
        const key = recordDate(record).slice(0, 7);
        const index = monthIndex.get(key);
        if (index === undefined) continue;
        const amount = Number(record.amount ?? record.totalAmount ?? 0);
        if (!Number.isFinite(amount)) continue;
        if (entity === "salesInvoices") months[index].sales += amount;
        else months[index].purchases += amount;
      }
    }

    const maxValue = Math.max(0, ...months.flatMap((month) => [month.sales, month.purchases]));
    return months.map((month) => ({
      ...month,
      salesHeight: maxValue ? Math.max(4, month.sales / maxValue * 100) : 0,
      purchasesHeight: maxValue ? Math.max(4, month.purchases / maxValue * 100) : 0,
    }));
  }, [currentTime, purchaseInvoices, salesInvoices]);

  const recentRecords = useMemo(() => sources
    .flatMap((source) => (collections[source.entity] ?? []).map((record) => ({
      id: record.id,
      reference: String(record.reference ?? record.id),
      party: String(record[source.partner] ?? "—"),
      label: source.label,
      amount: Number(record[source.amount] ?? record.totalAmount ?? 0),
      date: recordDate(record),
      status: String(record.status ?? "draft"),
      href: source.href,
    })))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 6), [collections]);

  const draftRecords = useMemo(() => sources
    .flatMap((source) => (collections[source.entity] ?? [])
      .filter((record) => record.status === "draft" || record.status === "approved")
      .map((record) => ({
        id: record.id,
        reference: String(record.reference ?? record.id),
        label: source.label,
        status: String(record.status ?? "draft"),
        href: source.href,
      })))
    .slice(0, 5), [collections]);

  const metrics = [
    { label: "إجمالي المبيعات", value: error ? "—" : currency.format(salesTotal), detail: error ? "غير متاح" : `${salesInvoices.length} فاتورة`, icon: "↗", tone: "blue" },
    { label: "إجمالي المشتريات", value: error ? "—" : currency.format(purchasesTotal), detail: error ? "غير متاح" : `${purchaseInvoices.length} فاتورة`, icon: "↙", tone: "violet" },
    { label: "الأصناف المسجلة", value: error ? "—" : String((collections.products ?? []).length), detail: error ? "غير متاح" : "من سجل المخزون", icon: "▦", tone: "teal" },
    { label: "العملاء", value: error ? "—" : String((collections.customers ?? []).length), detail: error ? "غير متاح" : "في قاعدة البيانات", icon: "♙", tone: "amber" },
  ];

  return (
    <ErpShell>
      <div className="erp-page dashboard-page">
        <ErpSectionHeader title="لوحة المؤشرات" subtitle="ملخص حي للسجلات المحفوظة في النظام." />

        {error && (
          <div className="dashboard-error" role="alert">
            <span>{error}</span>
            <button type="button" className="ghost-button small" onClick={() => void loadData()}>إعادة المحاولة</button>
          </div>
        )}

        <div className="dashboard-metrics-grid" aria-busy={loading}>
          {metrics.map((metric, index) => (
            <article key={metric.label} className={`dashboard-metric metric-${metric.tone}`} style={{ animationDelay: `${index * 70}ms` }}>
              <span className="dashboard-metric-icon" aria-hidden="true">{metric.icon}</span>
              <span className="dashboard-metric-label">{metric.label}</span>
              {loading ? <span className="dashboard-skeleton dashboard-skeleton-number" /> : <strong>{metric.value}</strong>}
              <small>{loading ? "جارٍ التحديث..." : metric.detail}</small>
            </article>
          ))}
        </div>

        <div className="dashboard-content-grid">
          <section className="dashboard-panel dashboard-chart-panel">
            <div className="dashboard-panel-heading">
              <div>
                <span className="dashboard-overline">الأداء المالي</span>
                <h2>المبيعات والمشتريات</h2>
                <p>مقارنة شهرية من الفواتير المسجلة خلال آخر ستة أشهر.</p>
              </div>
              <span className="dashboard-period">آخر 6 أشهر</span>
            </div>
            {loading ? (
              <div className="dashboard-chart-skeleton" role="status">جارٍ تحميل الرسم...</div>
            ) : !currentTime ? (
              <div className="dashboard-chart-skeleton" role="status">جارٍ تجهيز الرسم...</div>
            ) : error ? (
              <div className="dashboard-chart-skeleton">تعذر تحميل بيانات الرسم.</div>
            ) : (
              <>
                <div className="dashboard-chart-legend">
                  <span><i className="legend-sales" /> المبيعات</span>
                  <span><i className="legend-purchases" /> المشتريات</span>
                </div>
                <div className="dashboard-chart" role="img" aria-label="مقارنة المبيعات والمشتريات المسجلة شهرياً">
                  {monthlyData.map((month) => (
                    <div className="dashboard-chart-month" key={month.key}>
                      <div className="dashboard-chart-bars">
                        <span className="dashboard-chart-bar bar-sales" style={{ height: `${month.salesHeight}%` }} title={`المبيعات ${currency.format(month.sales)}`} />
                        <span className="dashboard-chart-bar bar-purchases" style={{ height: `${month.purchasesHeight}%` }} title={`المشتريات ${currency.format(month.purchases)}`} />
                      </div>
                      <small>{month.label}</small>
                    </div>
                  ))}
                </div>
                {monthlyData.length > 0 && monthlyData.every((month) => month.sales === 0 && month.purchases === 0) && (
                  <p className="dashboard-chart-empty">لا توجد فواتير مؤرخة ضمن الفترة المعروضة.</p>
                )}
              </>
            )}
          </section>

          <section className="dashboard-panel dashboard-followup-panel">
            <div className="dashboard-panel-heading">
              <div>
                <span className="dashboard-overline">مركز المتابعة</span>
                <h2>عمليات تحتاج مراجعة</h2>
              </div>
              <span className="dashboard-count">{draftRecords.length}</span>
            </div>
            {loading ? (
              <div className="dashboard-followup-skeleton" role="status">جارٍ تحميل العمليات...</div>
            ) : error ? (
              <div className="dashboard-followup-skeleton">تعذر تحميل العمليات.</div>
            ) : draftRecords.length === 0 ? (
              <div className="dashboard-empty-inline">
                <span aria-hidden="true">✓</span>
                <strong>كل شيء محدث</strong>
                <small>لا توجد فواتير بانتظار المراجعة.</small>
              </div>
            ) : (
              <div className="dashboard-followup-list">
                {draftRecords.map((record) => (
                  <Link href={record.href} className="dashboard-followup-item" key={`${record.label}-${record.id}`}>
                    <span className={`dashboard-followup-dot status-${record.status}`} />
                    <span><strong>{record.reference}</strong><small>{record.label}</small></span>
                    <small className={`dashboard-status status-${record.status}`}>{statusLabels[record.status] ?? record.status}</small>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="dashboard-panel dashboard-activity-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="dashboard-overline">النشاط</span>
              <h2>أحدث المعاملات</h2>
            </div>
            <Link href="/operations" className="dashboard-view-all">عرض العمليات <span aria-hidden="true">←</span></Link>
          </div>
          {loading ? (
            <div className="dashboard-table-skeleton" role="status">جارٍ تحميل المعاملات...</div>
          ) : error ? (
            <div className="dashboard-table-skeleton">تعذر تحميل المعاملات.</div>
          ) : recentRecords.length === 0 ? (
            <div className="dashboard-empty-inline">
              <strong>لا توجد معاملات مسجلة بعد</strong>
              <small>ستظهر أحدث الفواتير والسندات هنا بعد حفظها.</small>
            </div>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>المرجع</th><th>الطرف</th><th>نوع العملية</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead>
                <tbody>
                  {recentRecords.map((record) => (
                    <tr key={`${record.label}-${record.id}`}>
                      <td><Link href={record.href}>{record.reference}</Link></td>
                      <td>{record.party}</td>
                      <td>{record.label}</td>
                      <td>{formatDate(record.date)}</td>
                      <td>{Number.isFinite(record.amount) ? currency.format(record.amount) : "—"}</td>
                      <td><span className={`dashboard-status status-${record.status}`}>{statusLabels[record.status] ?? record.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ErpShell>
  );
}
