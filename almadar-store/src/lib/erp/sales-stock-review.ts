type StockLine = { productId: string; qty: string };
type StockProduct = { id: string; name?: unknown; stockQty?: unknown };

export function reviewSalesStock(lines: StockLine[], products: StockProduct[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const requested = new Map<string, number>();
  const issues: string[] = [];

  for (const [index, line] of lines.entries()) {
    const product = productsById.get(line.productId);
    if (!product) {
      issues.push(`الصنف في البند ${index + 1} غير موجود.`);
      continue;
    }
    const quantity = line.qty.trim() ? Number(line.qty) : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push(`الكمية في البند ${index + 1} غير صالحة.`);
      continue;
    }
    requested.set(product.id, (requested.get(product.id) ?? 0) + quantity);
  }

  for (const [productId, quantity] of requested) {
    const product = productsById.get(productId);
    if (!product) continue;
    const stock = product.stockQty === null || product.stockQty === undefined || product.stockQty === ""
      ? NaN : Number(product.stockQty);
    const name = String(product.name || product.id);
    if (!Number.isFinite(stock)) {
      issues.push(`تعذر التحقق من رصيد ${name}.`);
    } else if (stock - quantity < -Math.max(1, Math.abs(stock), Math.abs(quantity)) * Number.EPSILON * 8) {
      issues.push(`رصيد ${name} المسجل ${stock} والكمية المطلوبة في جميع البنود ${Number(quantity.toPrecision(15))}.`);
    }
  }
  return issues;
}
