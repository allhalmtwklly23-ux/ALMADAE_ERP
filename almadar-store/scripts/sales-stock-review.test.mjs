import assert from "node:assert/strict";
import test from "node:test";
import { reviewSalesStock } from "../src/lib/erp/sales-stock-review.ts";

test("aggregates repeated product lines and warns when the loaded stock is insufficient", () => {
  const products = [{ id: "p", name: "صنف", stockQty: 3 }];
  assert.deepEqual(reviewSalesStock([{ productId: "p", qty: "1" }, { productId: "p", qty: "2" }], products), []);
  const issues = reviewSalesStock([{ productId: "p", qty: "2" }, { productId: "p", qty: "2" }], products);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /3.*4/);
});

test("reports invalid quantities, missing products and unavailable balances", () => {
  const issues = reviewSalesStock([
    { productId: "missing", qty: "1" },
    { productId: "p", qty: "" },
    { productId: "p", qty: "1" },
  ], [{ id: "p", name: "صنف", stockQty: null }]);
  assert.equal(issues.length, 3);
  assert.match(issues[0], /غير موجود/);
  assert.match(issues[1], /غير صالحة/);
  assert.match(issues[2], /تعذر التحقق/);
});

test("does not warn solely because of floating-point addition", () => {
  assert.deepEqual(reviewSalesStock(
    [{ productId: "p", qty: "0.1" }, { productId: "p", qty: "0.2" }],
    [{ id: "p", stockQty: 0.3 }],
  ), []);
});
