import assert from "node:assert/strict";
import test from "node:test";
import { calculateDiscountedSalesVat, calculateSalesVat, SALES_DISCOUNT_VAT_MODE, SALES_VAT_MODE } from "../src/lib/erp/sales-tax.ts";

test("calculates exclusive VAT and rounds each line to halalas", () => {
  const result = calculateSalesVat([
    { qty: "2", unitPrice: "100.00", productId: "a" },
    { qty: "0.125", unitPrice: "10.00", productId: "b" },
  ]);
  assert.equal(result.taxCalculation, SALES_VAT_MODE);
  assert.equal(result.subtotal, 201.25);
  assert.equal(result.taxAmount, 30.19);
  assert.equal(result.amount, 231.44);
  assert.equal(result.items[1].amount, 1.25);
  assert.equal(result.items[1].taxAmount, 0.19);
  assert.equal(result.items[1].totalWithTax, 1.44);
});

test("rounds half halalas without floating-point errors", () => {
  const result = calculateSalesVat([
    { qty: "1", unitPrice: "0.10" },
    { qty: "0.5", unitPrice: "0.01" },
  ]);
  assert.equal(result.subtotal, 0.11);
  assert.equal(result.taxAmount, 0.02);
  assert.equal(result.amount, 0.13);
});

test("rejects malformed, negative, over-precision and excessive inputs", () => {
  for (const [qty, unitPrice] of [
    ["0", "10"], ["-1", "10"], ["1.0001", "10"], ["1", "1.001"],
    ["1", ""], ["1", "Infinity"], ["999999999999", "999999999999"],
  ]) {
    assert.throws(() => calculateSalesVat([{ qty, unitPrice }]));
  }
  assert.throws(() => calculateSalesVat([]));
});

test("applies line discounts then proportionally allocates invoice discount before VAT", () => {
  const result = calculateDiscountedSalesVat([
    { qty: "2", unitPrice: "100", discountType: "percent", discountValue: "10" },
    { qty: "1", unitPrice: "20", discountType: "amount", discountValue: "5" },
  ], "amount", "19.50");
  assert.equal(result.taxCalculation, SALES_DISCOUNT_VAT_MODE);
  assert.equal(result.grossAmount, 220);
  assert.equal(result.lineDiscountAmount, 25);
  assert.equal(result.invoiceDiscountAmount, 19.5);
  assert.deepEqual(result.items.map((item) => item.invoiceDiscountShare), [18, 1.5]);
  assert.deepEqual(result.items.map((item) => item.amount), [162, 13.5]);
  assert.equal(result.subtotal, 175.5);
  assert.equal(result.taxAmount, 26.33);
  assert.equal(result.amount, 201.83);
});

test("allocates rounding remainders deterministically and handles a full discount", () => {
  const lines = Array.from({ length: 3 }, () => ({ qty: 1, unitPrice: "0.01" }));
  const result = calculateDiscountedSalesVat(lines, "amount", "0.01");
  assert.deepEqual(result.items.map((item) => item.invoiceDiscountShare), [0.01, 0, 0]);
  assert.equal(result.subtotal, 0.02);
  const free = calculateDiscountedSalesVat(lines, "percent", "100");
  assert.equal(free.amount, 0);
  assert.equal(free.invoiceDiscountAmount, 0.03);
});

test("rejects discounts exceeding the base, invalid percentages, or invalid types", () => {
  const line = { qty: 1, unitPrice: 10 };
  assert.throws(() => calculateDiscountedSalesVat([{ ...line, discountType: "amount", discountValue: "10.01" }], "amount", 0));
  assert.throws(() => calculateDiscountedSalesVat([line], "percent", "100.01"));
  assert.throws(() => calculateDiscountedSalesVat([line], "amount", "10.01"));
  assert.throws(() => calculateDiscountedSalesVat([line], "other", 0));
  assert.throws(() => calculateDiscountedSalesVat([line], "percent", "1.001"));
});
