import { buildFinancialSummary } from "./financial-engine";

export function buildExecutiveDashboard() {
  const snapshot = buildFinancialSummary();

  return {
    title: "تقرير الأداء التنفيذي",
    generatedAt: new Date().toISOString(),
    summary: {
      revenue: snapshot.totalRevenue,
      expenses: snapshot.totalExpenses,
      profit: snapshot.netProfit,
      margin: snapshot.grossMargin,
    },
    modules: [
      "المحاسبة",
      "المبيعات",
      "المخزون",
      "المشتريات",
      "الرواتب",
      "التقارير",
      "CRM",
      "AI & BI",
    ],
  };
}

export function buildAuditTrail() {
  return [
    { id: "AUD-001", actor: "مدير النظام", action: "تحديث صلاحيات المستخدم", time: "2026-11-14 02:15" },
    { id: "AUD-002", actor: "مدير المحاسبة", action: "إقرار قيد يومي", time: "2026-11-14 01:40" },
    { id: "AUD-003", actor: "مدير المخزون", action: "تعديل جرد مستودع الرياض", time: "2026-11-14 00:55" },
  ];
}
