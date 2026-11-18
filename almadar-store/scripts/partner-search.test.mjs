import assert from "node:assert/strict";
import test from "node:test";
import { searchInvoicePartners } from "../src/lib/erp/partner-search.ts";

const partners = [
  { id: "1", name: "أحمد للتجارة", phone: "+966 55-123-4567", taxNumber: "٣١٠٠٠١", city: "الرياض" },
  { id: "2", name: "شركة أخرى", email: "hello@example.com", category: "مواد غذائية" },
];

test("finds partners by Arabic names, contact details and stored tax numbers", () => {
  for (const search of ["احمد", "أَحْمَد", "96655123", "٣١٠٠٠١", "310001", "RIYADH"]) {
    const result = searchInvoicePartners(partners, search);
    if (search === "RIYADH") assert.equal(result.length, 0);
    else assert.deepEqual(result.map((partner) => partner.id), ["1"]);
  }
  assert.deepEqual(searchInvoicePartners(partners, "HELLO@EXAMPLE").map((partner) => partner.id), ["2"]);
  assert.deepEqual(searchInvoicePartners(partners, "غذائية").map((partner) => partner.id), ["2"]);
});

test("returns all for an empty query and none for unmatched data", () => {
  assert.equal(searchInvoicePartners(partners, "  ").length, 2);
  assert.deepEqual(searchInvoicePartners(partners, "غير موجود"), []);
  assert.deepEqual(searchInvoicePartners([{ id: "3", name: null, phone: {} }], "null"), []);
});
