import { buildAuditTrail, buildExecutiveDashboard as createExecutiveDashboard, buildAccountingLedger, buildFinancialSummary, buildOperationalRatios, rolePermissions } from "@/lib/erp";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const formatNumber = (value: number) => numberFormatter.format(value);

const financialSummary = buildFinancialSummary();
const operatingRatios = buildOperationalRatios();
const accountingLedger = buildAccountingLedger();
const executiveDashboardData = createExecutiveDashboard();

export const navItems = [
  { href: "/", label: "التطبيقات", icon: "▦" },
  { href: "/dashboard", label: "لوحة المؤشرات", icon: "▣" },
  { href: "/operations", label: "العمليات", icon: "◫" },
  { href: "/finance", label: "المحاسبة", icon: "◫" },
  { href: "/sales", label: "المبيعات", icon: "◭" },
  { href: "/procurement", label: "المشتريات", icon: "▦" },
  { href: "/inventory", label: "المخزون", icon: "▤" },
  { href: "/warehouse", label: "المستودعات", icon: "▨" },
  { href: "/crm", label: "CRM", icon: "◉" },
  { href: "/projects", label: "المشاريع", icon: "◍" },
  { href: "/pos", label: "POS", icon: "◐" },
  { href: "/payroll", label: "الرواتب", icon: "◓" },
  { href: "/ecommerce", label: "التجارة الإلكترونية", icon: "◔" },
  { href: "/logistics", label: "اللوجستيك", icon: "◕" },
  { href: "/ai", label: "AI & BI", icon: "◖" },
  { href: "/organization", label: "الهيكل التنظيمي", icon: "⌘" },
  { href: "/hr", label: "الموارد البشرية", icon: "◬" },
  { href: "/reports", label: "التقارير", icon: "◨" },
  { href: "/settings", label: "الإعدادات", icon: "⚙" },
  { href: "/assets", label: "الأصول", icon: "▣" },
  { href: "/maintenance", label: "الصيانة", icon: "⚒" },
  { href: "/quality", label: "الجودة", icon: "✓" },
  { href: "/support", label: "خدمة العملاء", icon: "☏" },
  { href: "/contracts", label: "العقود", icon: "▤" },
];

export const dashboardMetrics = [
  { title: "إجمالي الإيرادات", value: formatNumber(financialSummary.totalRevenue), suffix: "SAR", delta: "+12.4%" },
  { title: "صافي الربح", value: formatNumber(financialSummary.netProfit), suffix: "SAR", delta: "+8.1%" },
  { title: "مستحقات العملاء", value: formatNumber(financialSummary.receivables), suffix: "SAR", delta: "-3.5%" },
  { title: "قيمة المخزون", value: formatNumber(financialSummary.inventoryValue), suffix: "SAR", delta: "+5.2%" },
];

export const salesTrend = [
  { month: "يناير", value: 58 },
  { month: "فبراير", value: 72 },
  { month: "مارس", value: 69 },
  { month: "أبريل", value: 86 },
  { month: "مايو", value: 80 },
  { month: "يونيو", value: 92 },
  { month: "يوليو", value: 110 },
  { month: "أغسطس", value: 104 },
];

export const transactionRows = [
  { id: "INV-2048", customer: "مؤسسة الخليج", type: "فاتورة مبيعات", amount: "24,500", date: "14 مايو", status: "مدفوعة" },
  { id: "PO-4482", customer: "شركة النور", type: "طلب شراء", amount: "18,200", date: "13 مايو", status: "قيد التنفيذ" },
  { id: "PR-0913", customer: "النجاح للتوزيع", type: "إيراد نقدي", amount: "12,600", date: "12 مايو", status: "مكتمل" },
  { id: "EXP-8821", customer: "مكتب الخدمات", type: "مصروفات", amount: "7,100", date: "11 مايو", status: "معتمد" },
];

export const taskList = [
  { title: "مراجعة السلف الشهرية", owner: "إدارة المالية", due: "اليوم" },
  { title: "تجهيز فاتورة المورد 4402", owner: "المشتريات", due: "غداً" },
  { title: "إقفال حسابات مايو", owner: "المحاسبة", due: "بعد 2 يوم" },
  { title: "مراجعة مخزون فرع الرياض", owner: "المخزون", due: "بعد 3 أيام" },
];

export const moduleCards = [
  { label: "المحاسبة", value: "مزدوجة", detail: "قيود، دفتر أستاذ، تسويات", accent: "blue" },
  { label: "المشتريات", value: "44", detail: "طلبات شراء مفتوحة", accent: "green" },
  { label: "الرواتب", value: "148", detail: "موظف مسجل", accent: "orange" },
  { label: "التقارير", value: "18", detail: "قوالب جاهزة", accent: "purple" },
  { label: "CRM", value: "1,280", detail: "عملاء نشطون", accent: "blue" },
  { label: "المخزون", value: "86%", detail: "تغطية الطلب", accent: "green" },
  { label: "POS", value: "12", detail: "نقاط بيع", accent: "orange" },
  { label: "AI & BI", value: "24", detail: "تحليلات ذكية", accent: "purple" },
];

export const financeRows = accountingLedger.map((row) => ({
  account: row.name,
  debit: formatNumber(row.debit),
  credit: formatNumber(row.credit),
  balance: formatNumber(row.balance),
}));

export const salesRows = [
  { order: "SO-1845", customer: "مكتبة الندى", status: "مكتمل", total: "18,320", date: "2026-05-14" },
  { order: "SO-1848", customer: "مجمع الفهد", status: "قيد الشحن", total: "27,660", date: "2026-05-15" },
  { order: "SO-1850", customer: "متاجر النجاح", status: "قيد التنفيذ", total: "11,440", date: "2026-05-16" },
  { order: "SO-1854", customer: "الشرق للتجزئة", status: "مكتمل", total: "35,700", date: "2026-05-18" },
];

export const inventoryRows = [
  { sku: "OBJ-104", item: "خزانة مكتب", stock: 18, reorder: 8, status: "كافي" },
  { sku: "OBJ-220", item: "كرسي إداري", stock: 6, reorder: 10, status: "يحتاج تجديد" },
  { sku: "OBJ-345", item: "طابعة سطح مكتب", stock: 12, reorder: 5, status: "جيد" },
  { sku: "OBJ-410", item: "لوحة شاشة", stock: 2, reorder: 6, status: "محدود" },
];

export const procurementRows = [
  { po: "PO-4421", vendor: "شركة الخضري", amount: "42,500", eta: "2026-05-22", status: "مكتمل" },
  { po: "PO-4428", vendor: "نور للإمداد", amount: "29,300", eta: "2026-05-24", status: "قيد التوصيل" },
  { po: "PO-4430", vendor: "المرور للتجهيز", amount: "18,900", eta: "2026-05-27", status: "قيد الموافقة" },
];

export const hrRows = [
  { employee: "سارة العتيبي", role: "محاسبة", attendance: "96%", performance: "A" },
  { employee: "خالد الحربي", role: "مدير مبيعات", attendance: "92%", performance: "A+" },
  { employee: "علي الناصر", role: "مخزون", attendance: "88%", performance: "B+" },
  { employee: "أميرة القحطاني", role: "موارد بشرية", attendance: "95%", performance: "A" },
];

export const reportCards = [
  { title: "تقرير الأداء المالي", value: "ملف سنوي", insight: `الهامش ${operatingRatios.margin.toFixed(1)}%` },
  { title: "تقرير المخزون", value: "مركزية المستودعات", insight: `دوران ${operatingRatios.inventoryTurnover.toFixed(2)}x` },
  { title: "تقرير المبيعات", value: "بالمناطق", insight: `نسبة الربح ${operatingRatios.margin.toFixed(1)}%` },
  { title: "تقرير الرواتب", value: "حسابات شهرية", insight: "جاهز للإصدار" },
];

export const settingsCards = [
  { label: "الأمان", value: "2FA فعال", note: "جميع المستخدمين" },
  { label: "التكاملات", value: "8 ربطات", note: "بنوك / SMS / API" },
  { label: "النسخ الاحتياطي", value: "كل 6 ساعات", note: "تخزين آمن" },
  { label: "التحكم بالصلاحيات", value: `${rolePermissions.length} أدوار`, note: "مقسمة حسب القسم" },
];

export const executiveDashboard = executiveDashboardData;
export const auditTrail = buildAuditTrail();
export const roleMatrix = rolePermissions;
export const financialRatios = operatingRatios;
