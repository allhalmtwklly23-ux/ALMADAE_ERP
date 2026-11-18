import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { InvoicePrintActions } from "@/components/invoice-print-actions";
import { getRecord } from "@/lib/erp/store";
import { isSalesVatMode, SALES_DISCOUNT_VAT_MODE } from "@/lib/erp/sales-tax";
import { invoiceBarcode } from "@/lib/erp/invoice-barcode";
import {
  getSessionUserFromToken,
  SESSION_COOKIE_NAME,
  userHasPermission,
} from "@/lib/erp/auth-system";
import {
  getDatabaseRecord,
  getDatabaseSessionUser,
  getPersistenceMode,
  requireDatabasePermission,
  withDatabaseSessionCompany,
} from "@/lib/erp/database";

export const instant = false;

type InvoiceItem = Record<string, unknown>;

const moneyFormatter = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
});

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  posted: "مرحّلة",
  cancelled: "ملغاة",
};

function formatDate(value: unknown) {
  if (!value) return "—";
  const raw = String(value);
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function amount(value: unknown) {
  const number = Number(value);
  return moneyFormatter.format(Number.isFinite(number) ? number : 0);
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return withDatabaseSessionCompany(token, () => renderInvoicePrintPage(params, token));
}

async function renderInvoicePrintPage(
  params: Promise<{ entity: string; id: string }>,
  token?: string,
) {
  const { entity, id } = await params;
  if (entity !== "salesInvoices" && entity !== "purchaseInvoices") notFound();

  const mode = getPersistenceMode();
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const canPrint = mode === "supabase"
    ? await requireDatabasePermission(user, entity, "print")
    : userHasPermission(user, entity, "print");
  if (!canPrint) notFound();
  const canPost = mode === "supabase"
    ? await requireDatabasePermission(user, entity, "post")
    : userHasPermission(user, entity, "post");

  const invoice = mode === "supabase"
    ? await getDatabaseRecord(entity, id)
    : getRecord(entity, id);
  if (!invoice) notFound();

  const isPurchase = entity === "purchaseInvoices";
  const title = isPurchase ? "فاتورة مشتريات" : "فاتورة مبيعات";
  const partnerLabel = isPurchase ? "المورد" : "العميل";
  const partnerName = String(isPurchase ? invoice.vendorName ?? "—" : invoice.customerName ?? "—");
  const items = Array.isArray(invoice.items)
    ? invoice.items.filter((item): item is InvoiceItem => typeof item === "object" && item !== null)
    : [];
  const calculatedTotal = items.reduce((total, item) => {
    const quantity = Number(item.qty ?? item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineAmount = Number(item.amount ?? quantity * unitPrice);
    return total + (Number.isFinite(lineAmount) ? lineAmount : 0);
  }, 0);
  const invoiceTotal = Number(invoice.amount ?? calculatedTotal);
  const hasSalesVat = !isPurchase && isSalesVatMode(invoice.taxCalculation);
  const hasDiscounts = !isPurchase && invoice.taxCalculation === SALES_DISCOUNT_VAT_MODE;
  const backHref = isPurchase ? "/procurement" : "/sales";
  const reference = String(invoice.reference ?? invoice.id);
  const barcode = invoiceBarcode(reference);

  return (
    <main className="invoice-page">
      <InvoicePrintActions
        backHref={backHref}
        entity={entity}
        invoiceId={id}
        status={String(invoice.status ?? "draft")}
        canPost={canPost}
      />
      <article className="invoice-document">
        <header className="invoice-brand-row">
          <div className="invoice-brand">
            <span className="invoice-brand-mark">N</span>
            <div>
              <strong>Nexa ERP</strong>
              <small>مستند صادر من نظام إدارة الأعمال</small>
            </div>
          </div>
          <div className="invoice-type">
            <span>مستند {isPurchase ? "المشتريات" : "المبيعات"}</span>
            <strong>{title}</strong>
            <small dir="auto">{reference}</small>
          </div>
        </header>

        <div className="invoice-rule" />

        <p className="invoice-compliance-notice">{hasSalesVat ? "مستند تشغيلي؛ لم يُربط بمنصة الهيئة أو يُصدر له رمز QR مطابق، ولا يُعد فاتورة إلكترونية معتمدة." : "مستند تشغيلي للمعاينة والطباعة؛ لم تُحتسب فيه الضريبة بهذا النموذج ولم يُربط به رمز الهيئة."}</p>
        <section className="invoice-overview">
          <div>
            <span className="invoice-label">بيانات الفاتورة</span>
            <dl className="invoice-meta">
              <div><dt>رقم الفاتورة</dt><dd>{String(invoice.reference ?? invoice.id)}</dd></div>
              <div><dt>تاريخ الإصدار</dt><dd>{formatDate(invoice.date)}</dd></div>
              <div><dt>الحالة</dt><dd><span className={`invoice-status status-${String(invoice.status ?? "draft")}`}>{statusLabels[String(invoice.status ?? "draft")] ?? String(invoice.status ?? "مسودة")}</span></dd></div>
              {Boolean(invoice.accountName) && <div><dt>الحساب</dt><dd>{String(invoice.accountName)}</dd></div>}
              {Boolean(invoice.paymentMethod) && <div><dt>طريقة الدفع</dt><dd>{String(invoice.paymentMethod)}</dd></div>}
              {Boolean(invoice.storeName) && <div><dt>نقطة البيع</dt><dd>{String(invoice.storeName)}</dd></div>}
              {Boolean(invoice.cashier) && <div><dt>الكاشير</dt><dd>{String(invoice.cashier)}</dd></div>}
            </dl>
          </div>
          <div className="invoice-partner">
            <span className="invoice-label">{partnerLabel}</span>
            <strong>{partnerName}</strong>
            {Boolean(invoice.customerPhone ?? invoice.vendorPhone ?? invoice.phone) && (
              <span>{String(invoice.customerPhone ?? invoice.vendorPhone ?? invoice.phone)}</span>
            )}
          </div>
        </section>

        <section className="invoice-lines-section">
          <div className="invoice-section-heading">
            <div><span className="invoice-label">تفاصيل الفاتورة</span><h2>الأصناف والخدمات</h2></div>
            <span>{items.length} بند</span>
          </div>
          <div className="invoice-table-wrap">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصنف / البيان</th>
                  <th>رمز الصنف</th>
                  <th>الكمية</th>
                  <th>{hasSalesVat ? "سعر الوحدة قبل الضريبة" : "سعر الوحدة"}</th>
                  {hasSalesVat && <th>المبلغ قبل الضريبة</th>}
                  {hasSalesVat && <th>الضريبة ١٥٪</th>}
                  <th>{hasSalesVat ? "الإجمالي بعد الضريبة" : "الإجمالي"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const quantity = Number(item.qty ?? item.quantity ?? 0);
                  const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
                  const lineAmount = Number(item.amount ?? quantity * unitPrice);
                  return (
                    <tr key={`${String(item.productId ?? item.sku ?? index)}-${index}`}>
                      <td>{index + 1}</td>
                      <td><strong>{String(item.productName ?? item.name ?? item.label ?? "صنف")}</strong>{Boolean(item.group || item.category) && <small className="invoice-product-classification">{[item.group, item.category].filter(Boolean).map(String).join(" · ")}</small>}</td>
                      <td>{String(item.sku ?? item.barcode ?? "—")}</td>
                      <td>{Number.isFinite(quantity) ? quantity : 0}</td>
                      <td>{amount(unitPrice)}</td>
                      {hasSalesVat && <td>{amount(lineAmount)}{hasDiscounts && <small className="invoice-product-classification">قبل الخصم: {amount(item.grossAmount)}<br />خصم الصنف: {amount(item.lineDiscountAmount)}<br />نصيب خصم الفاتورة: {amount(item.invoiceDiscountShare)}</small>}</td>}
                      {hasSalesVat && <td>{amount(item.taxAmount)}</td>}
                      <td>{amount(hasSalesVat ? item.totalWithTax : lineAmount)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={hasSalesVat ? 8 : 6} className="invoice-empty-line">لا توجد أصناف مسجلة في هذه الفاتورة.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="invoice-summary">
          <div className="invoice-totals-block">
            {hasDiscounts && <><div><span>المجموع قبل الخصومات</span><strong>{amount(invoice.grossAmount)}</strong></div><div><span>خصومات الأصناف</span><strong>{amount(invoice.lineDiscountAmount)}</strong></div><div><span>خصم الفاتورة</span><strong>{amount(invoice.invoiceDiscountAmount)}</strong></div></>}
            {hasSalesVat && <><div><span>المجموع قبل الضريبة</span><strong>{amount(invoice.subtotal)}</strong></div><div><span>ضريبة القيمة المضافة ١٥٪</span><strong>{amount(invoice.taxAmount)}</strong></div></>}
            <div className="invoice-total-line">
              <span>{hasSalesVat ? "الإجمالي بعد الضريبة" : "إجمالي الفاتورة"}</span>
              <strong>{amount(Number.isFinite(invoiceTotal) ? invoiceTotal : calculatedTotal)}</strong>
            </div>
          </div>
        </section>

        {Boolean(invoice.description) && (
          <section className="invoice-notes">
            <span className="invoice-label">ملاحظات</span>
            <p>{String(invoice.description)}</p>
          </section>
        )}

        <section className="invoice-barcode-section" aria-label="باركود مرجع الفاتورة">
          <div>
            <span className="invoice-label">باركود مرجع الفاتورة</span>
            <p>للتعريف بالمرجع فقط؛ ليس رمز QR الخاص بالهيئة.</p>
          </div>
          {barcode ? (
            <div className="invoice-barcode">
              <svg
                role="img"
                aria-label={`باركود مرجع الفاتورة ${reference}`}
                viewBox={`0 0 ${barcode.length + 20} 64`}
                width={(barcode.length + 20) * 1.25}
                height="64"
                preserveAspectRatio="none"
                shapeRendering="crispEdges"
              >
                <rect width="100%" height="100%" fill="white" />
                {Array.from(barcode, (bit, index) => bit === "1" ? (
                  <rect key={index} x={index + 10} y="2" width="1" height="60" fill="black" />
                ) : null)}
              </svg>
              <span dir="ltr">{reference}</span>
            </div>
          ) : (
            <p className="invoice-barcode-error">تعذر إنشاء الباركود: يجب أن يكون المرجع من ١ إلى ٤٠ حرفاً لاتينياً أو رقماً أو رمزاً عادياً.</p>
          )}
        </section>

        <footer className="invoice-footer">
          <span>تم إنشاء المستند من نظام Nexa ERP</span>
          <span>{formatDate(invoice.createdAt)}</span>
        </footer>
      </article>
    </main>
  );
}
