type RecordData = Record<string, unknown> & { id: string; status?: string };

export function postedProductPurchases(product: RecordData, invoices: RecordData[]) {
  return invoices.filter((invoice) => invoice.status === "posted").flatMap((invoice) => {
    if (!Array.isArray(invoice.items)) return [];
    return invoice.items.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const line = item as Record<string, unknown>;
      const matches = line.productId
        ? String(line.productId) === product.id
        : Boolean(product.sku && line.sku && String(product.sku) === String(line.sku))
          || Boolean(product.barcode && line.barcode && String(product.barcode) === String(line.barcode));
      if (!matches) return [];
      return [{
        invoiceId: invoice.id,
        reference: String(invoice.reference ?? invoice.id),
        date: String(invoice.date ?? ""),
        supplier: String(invoice.vendorName ?? "غير محدد"),
        quantity: line.qty ?? line.quantity ?? null,
        unitCost: line.unitPrice ?? line.price ?? null,
      }];
    });
  });
}
