export const SALES_VAT_MODE = "vat15-exclusive-v1";
export const SALES_DISCOUNT_VAT_MODE = "vat15-exclusive-discount-v2";

export function isSalesVatMode(value: unknown) {
  return value === SALES_VAT_MODE || value === SALES_DISCOUNT_VAT_MODE;
}

function scaled(value: unknown, decimals: number, label: string): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${label} غير صالح.`);
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2]?.length ?? 0) > decimals || match[1].length > 12) {
    throw new Error(`${label} غير صالح أو يحتوي منازل عشرية أكثر من المسموح.`);
  }
  const result = BigInt(match[1]) * BigInt(10 ** decimals) + BigInt((match[2] ?? "").padEnd(decimals, "0"));
  if (result > BigInt("1000000000000")) throw new Error(`${label} يتجاوز الحد المسموح.`);
  return result;
}

function roundedDivide(value: bigint, divisor: bigint) {
  return (value + divisor / BigInt(2)) / divisor;
}

function asMoney(cents: bigint) {
  if (cents > BigInt("1000000000000")) throw new Error("إجمالي الفاتورة يتجاوز الحد المسموح.");
  return Number(cents) / 100;
}

export function calculateSalesVat(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("أضف صنفاً واحداً على الأقل.");
  let netCents = BigInt(0);
  let vatCents = BigInt(0);
  const lines = items.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("بند الفاتورة غير صالح.");
    const line = item as Record<string, unknown>;
    const quantity = scaled(line.qty ?? line.quantity, 3, "الكمية");
    const price = scaled(line.unitPrice ?? line.price, 2, "سعر الوحدة");
    if (quantity <= BigInt(0)) throw new Error("الكمية يجب أن تكون أكبر من صفر.");
    const lineNet = roundedDivide(quantity * price, BigInt(1000));
    const lineVat = roundedDivide(lineNet * BigInt(15), BigInt(100));
    netCents += lineNet;
    vatCents += lineVat;
    return {
      ...line,
      qty: Number(quantity) / 1000,
      unitPrice: Number(price) / 100,
      amount: asMoney(lineNet),
      taxAmount: asMoney(lineVat),
      totalWithTax: asMoney(lineNet + lineVat),
    };
  });
  return {
    items: lines,
    subtotal: asMoney(netCents),
    taxAmount: asMoney(vatCents),
    amount: asMoney(netCents + vatCents),
    taxRate: 15,
    taxCalculation: SALES_VAT_MODE,
  };
}

function calculateDiscount(base: bigint, type: unknown, value: unknown, label: string) {
  if (type !== "amount" && type !== "percent") throw new Error(`نوع ${label} غير صالح.`);
  const scaledValue = scaled(value, 2, label);
  if (type === "percent" && scaledValue > BigInt(10000)) throw new Error(`نسبة ${label} لا تتجاوز ١٠٠٪.`);
  const discount = type === "percent" ? roundedDivide(base * scaledValue, BigInt(10000)) : scaledValue;
  if (discount > base) throw new Error(`${label} لا يتجاوز المبلغ قبل الخصم.`);
  return discount;
}

export function calculateDiscountedSalesVat(
  items: unknown,
  invoiceDiscountType: unknown,
  invoiceDiscountValue: unknown,
) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("أضف صنفاً واحداً على الأقل.");
  const prepared = items.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("بند الفاتورة غير صالح.");
    const line = item as Record<string, unknown>;
    const quantity = scaled(line.qty ?? line.quantity, 3, "الكمية");
    const price = scaled(line.unitPrice ?? line.price, 2, "سعر الوحدة");
    if (quantity <= BigInt(0)) throw new Error("الكمية يجب أن تكون أكبر من صفر.");
    const gross = roundedDivide(quantity * price, BigInt(1000));
    asMoney(gross);
    const discountType = line.discountType ?? "amount";
    const discountValue = line.discountValue ?? "0";
    const lineDiscount = calculateDiscount(gross, discountType, discountValue, "خصم الصنف");
    return { line, quantity, price, gross, lineDiscount, discountType, discountValue, base: gross - lineDiscount };
  });
  const gross = prepared.reduce((sum, line) => sum + line.gross, BigInt(0));
  const lineDiscount = prepared.reduce((sum, line) => sum + line.lineDiscount, BigInt(0));
  const base = gross - lineDiscount;
  asMoney(gross);
  const discountType = invoiceDiscountType ?? "amount";
  const discountValue = invoiceDiscountValue ?? "0";
  const invoiceDiscount = calculateDiscount(base, discountType, discountValue, "خصم الفاتورة");

  const shares = prepared.map((line, index) => {
    const numerator = invoiceDiscount * line.base;
    return { index, amount: base === BigInt(0) ? BigInt(0) : numerator / base, remainder: base === BigInt(0) ? BigInt(0) : numerator % base };
  });
  const remainder = Number(invoiceDiscount - shares.reduce((sum, share) => sum + share.amount, BigInt(0)));
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < remainder; index++) ranked[index].amount += BigInt(1);

  let net = BigInt(0);
  let vat = BigInt(0);
  const lines = prepared.map((item, index) => {
    const share = shares[index].amount;
    const lineNet = item.base - share;
    const lineVat = roundedDivide(lineNet * BigInt(15), BigInt(100));
    net += lineNet;
    vat += lineVat;
    return {
      ...item.line,
      qty: Number(item.quantity) / 1000,
      unitPrice: Number(item.price) / 100,
      discountType: item.discountType,
      discountValue: Number(item.discountValue),
      grossAmount: asMoney(item.gross),
      lineDiscountAmount: asMoney(item.lineDiscount),
      invoiceDiscountShare: asMoney(share),
      amount: asMoney(lineNet),
      taxAmount: asMoney(lineVat),
      totalWithTax: asMoney(lineNet + lineVat),
    };
  });
  return {
    items: lines,
    grossAmount: asMoney(gross),
    lineDiscountAmount: asMoney(lineDiscount),
    invoiceDiscountType: discountType,
    invoiceDiscountValue: Number(discountValue),
    invoiceDiscountAmount: asMoney(invoiceDiscount),
    subtotal: asMoney(net),
    taxAmount: asMoney(vat),
    amount: asMoney(net + vat),
    taxRate: 15,
    taxCalculation: SALES_DISCOUNT_VAT_MODE,
  };
}
