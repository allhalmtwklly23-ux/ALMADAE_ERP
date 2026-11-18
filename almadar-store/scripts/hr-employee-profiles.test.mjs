import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/erp/hr-employee-profiles.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 });
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), loaded, loaded.exports);
const { parseEmployeeProfileInput } = loaded.exports;

test("employee profile creation normalizes input and defaults the record state", () => {
  const result = parseEmployeeProfileInput({
    employeeNumber: " E-100 ",
    fullName: " موظف تجريبي ",
    email: "person@example.com",
    phone: " 0500000000 ",
    hiredOn: "2026-01-15",
    employmentStatus: "active",
  }, false);

  assert.deepEqual(result, {
    input: {
      employeeNumber: "E-100",
      fullName: "موظف تجريبي",
      email: "person@example.com",
      phone: "0500000000",
      hiredOn: "2026-01-15",
      employmentStatus: "active",
      recordStatus: "active",
    },
  });
});

test("employee profile updates require a valid record state", () => {
  const result = parseEmployeeProfileInput({
    employeeNumber: "E-100",
    fullName: "موظف تجريبي",
    employmentStatus: "on_leave",
  }, true);

  assert.equal("error" in result, true);
});

test("employee profiles reject invalid dates, email addresses, and employment states", () => {
  const base = {
    employeeNumber: "E-100",
    fullName: "موظف تجريبي",
    employmentStatus: "active",
  };

  assert.equal("error" in parseEmployeeProfileInput({ ...base, hiredOn: "2026-02-30" }, false), true);
  assert.equal("error" in parseEmployeeProfileInput({ ...base, email: "not-an-email" }, false), true);
  assert.equal("error" in parseEmployeeProfileInput({ ...base, employmentStatus: "unknown" }, false), true);
});
