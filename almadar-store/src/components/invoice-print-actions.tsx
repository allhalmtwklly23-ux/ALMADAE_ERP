"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InvoicePrintActions({
  backHref,
  entity,
  invoiceId,
  status,
  canPost,
}: {
  backHref: string;
  entity: "salesInvoices" | "purchaseInvoices";
  invoiceId: string;
  status: string;
  canPost: boolean;
}) {
  const router = useRouter();
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState("");

  async function postInvoice() {
    const typeLabel = entity === "purchaseInvoices" ? "إضافة الكمية للمخزون" : "خصم الكمية من المخزون";
    if (!window.confirm(`سيتم ترحيل الفاتورة و${typeLabel}، ولن يمكن تعديلها بعد ذلك. هل تريد المتابعة؟`)) return;

    setPosting(true);
    setMessage("");
    try {
      const response = await fetch("/api/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "postInvoice", entity, id: invoiceId }),
      });
      const result = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذر ترحيل الفاتورة.");
      }

      setMessage(result.message ?? "تم ترحيل الفاتورة وتحديث المخزون.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر ترحيل الفاتورة.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <div className="invoice-actions print-hide">
        <Link className="ghost-button" href={backHref}>العودة إلى التطبيق</Link>
        {canPost && (status === "draft" || status === "approved") && (
          <button type="button" className="primary-button" onClick={() => void postInvoice()} disabled={posting}>
            {posting ? "جارٍ الترحيل..." : "ترحيل وتحديث المخزون"}
          </button>
        )}
        <button type="button" className="primary-button" onClick={() => window.print()}>
          طباعة / حفظ PDF
        </button>
      </div>
      {message && <p className="invoice-action-message print-hide" role="status">{message}</p>}
    </>
  );
}
