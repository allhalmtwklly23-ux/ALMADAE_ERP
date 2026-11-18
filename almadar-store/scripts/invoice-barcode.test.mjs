import assert from "node:assert/strict";
import test from "node:test";
import { invoiceBarcode } from "../src/lib/erp/invoice-barcode.ts";

test("encodes the invoice reference as Code 128 with checksum", () => {
  // Start B, A, checksum, stop.
  assert.equal(invoiceBarcode("A"), "11010010000" + "10100011000" + "10001011000" + "1100011101011");
  assert.notEqual(invoiceBarcode("INV-1"), invoiceBarcode("INV-2"));
  assert.notEqual(invoiceBarcode("INV-1"), invoiceBarcode(" INV-1"));
});

test("rejects references that cannot be printed as a readable barcode", () => {
  for (const reference of ["", "  ", "فاتورة-1", "INV\n1", "A".repeat(41)]) {
    assert.equal(invoiceBarcode(reference), null);
  }
  assert.ok(invoiceBarcode("A".repeat(40)));
});
