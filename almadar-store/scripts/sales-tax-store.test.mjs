import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as salesTax from "../src/lib/erp/sales-tax.ts";

test("storage recalculates marked invoices and leaves legacy drafts unchanged", () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../src/lib/erp/store.ts", import.meta.url), "utf8");
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, esModuleInterop: true });
  const storeModule = { exports: {} };
  const load = (name) => name === "@/lib/erp/sales-tax" ? salesTax : require(name);
  new Function("require", "module", "exports", compiled)(load, storeModule, storeModule.exports);
  const { createRecord, updateRecord, getRecord } = storeModule.exports;
  const temp = mkdtempSync(join(tmpdir(), "erp-sales-tax-"));
  const original = process.cwd();
  try {
    process.chdir(temp);
    const data = {
      reference: "T-1", customerName: "Test", date: "2026-01-01",
      items: [{ productId: "p1", qty: "2", unitPrice: "100", amount: 1 }],
      taxCalculation: salesTax.SALES_VAT_MODE, amount: 1, taxAmount: 1,
    };
    const invoice = createRecord("salesInvoices", data);
    assert.equal(invoice.subtotal, 200);
    assert.equal(invoice.taxAmount, 30);
    assert.equal(invoice.amount, 230);
    const updated = updateRecord("salesInvoices", invoice.id, {
      items: [{ productId: "p1", qty: "1", unitPrice: "10" }],
      taxCalculation: null, amount: 1,
    });
    assert.equal(updated.taxCalculation, salesTax.SALES_VAT_MODE);
    assert.equal(updated.amount, 11.5);
    assert.equal(getRecord("salesInvoices", invoice.id).amount, 11.5);
    const discounted = createRecord("salesInvoices", {
      ...data,
      reference: "T-D",
      taxCalculation: salesTax.SALES_DISCOUNT_VAT_MODE,
      invoiceDiscountType: "percent", invoiceDiscountValue: 10,
      items: [{ productId: "p1", qty: 1, unitPrice: 100, discountType: "amount", discountValue: 10, amount: 1 }],
      amount: 1, invoiceDiscountAmount: 999,
    });
    assert.equal(discounted.subtotal, 81);
    assert.equal(discounted.invoiceDiscountAmount, 9);
    assert.equal(discounted.amount, 93.15);
    const discountedUpdate = updateRecord("salesInvoices", discounted.id, {
      taxCalculation: null, amount: 1, taxAmount: 0,
    });
    assert.equal(discountedUpdate.taxCalculation, salesTax.SALES_DISCOUNT_VAT_MODE);
    assert.equal(discountedUpdate.amount, 93.15);
    assert.equal(getRecord("salesInvoices", discounted.id).items[0].lineDiscountAmount, 10);
    const legacy = createRecord("salesInvoices", {
      reference: "T-2", customerName: "Test", date: "2026-01-01",
      items: [{ productId: "p1", qty: 1, unitPrice: 10 }], amount: 10,
    });
    const oldUpdated = updateRecord("salesInvoices", legacy.id, { ...legacy, amount: 10 });
    assert.equal(oldUpdated.amount, 10);
    assert.equal(oldUpdated.taxCalculation, undefined);
  } finally {
    process.chdir(original);
    rmSync(temp, { recursive: true, force: true });
  }
});
