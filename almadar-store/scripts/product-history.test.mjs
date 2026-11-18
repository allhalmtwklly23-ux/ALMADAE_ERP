import assert from "node:assert/strict";
import test from "node:test";
import { postedProductPurchases } from "../src/lib/erp/product-history.ts";

const product = { id: "p1", sku: "SKU1", barcode: "123" };

test("returns only posted purchase lines linked to the requested product", () => {
  const history = postedProductPurchases(product, [
    { id: "a", status: "posted", vendorName: "Supplier", items: [
      { productId: "p1", qty: 2, unitPrice: 12 },
      { productId: "p2", sku: "SKU1", qty: 9, unitPrice: 1 },
    ] },
    { id: "b", status: "draft", items: [{ productId: "p1" }] },
    { id: "c", status: "posted", items: [{ barcode: "123", quantity: 3, price: 11 }] },
  ]);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((entry) => [entry.invoiceId, entry.quantity, entry.unitCost]), [
    ["a", 2, 12], ["c", 3, 11],
  ]);
  assert.equal(history[0].supplier, "Supplier");
});

test("does not match missing identifiers or malformed invoice items", () => {
  assert.deepEqual(postedProductPurchases({ id: "p1" }, [
    { id: "a", status: "posted", items: [null, {}, "invalid"] },
    { id: "b", status: "posted", items: null },
  ]), []);
});
