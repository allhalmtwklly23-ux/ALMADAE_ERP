import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/erp/hr-employee-access.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 });
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), loaded, loaded.exports);

test("HR managers can grant only HR permissions they hold", () => {
  const { canAssignHrEmployeePermissions, getAssignableHrEmployeePermissions } = loaded.exports;
  const manager = { role: "hr_manager", permissions: ["employees:view", "employees:create", "payrollRuns:view", "reportJobs:view"] };

  assert.deepEqual(
    getAssignableHrEmployeePermissions(manager).map((permission) => permission.key),
    ["employees:view", "employees:create", "payrollRuns:view", "reportJobs:view"],
  );
  assert.equal(canAssignHrEmployeePermissions(manager, ["employees:create", "reportJobs:view"]), true);
  assert.equal(canAssignHrEmployeePermissions(manager, ["payrollRuns:edit"]), false);
  assert.equal(canAssignHrEmployeePermissions(manager, ["products:view"]), false);
  assert.equal(canAssignHrEmployeePermissions(manager, ["all"]), false);
  assert.equal(canAssignHrEmployeePermissions(manager, ["employees:create", "employees:create"]), false);
});

test("super admins can grant the HR permission set but not global or unrelated permissions", () => {
  const { canAssignHrEmployeePermissions } = loaded.exports;

  assert.equal(canAssignHrEmployeePermissions({ role: "super_admin", permissions: ["all"] }, ["employees:view", "payrollRuns:edit"]), true);
  assert.equal(canAssignHrEmployeePermissions({ role: "super_admin", permissions: ["all"] }, ["all"]), false);
  assert.equal(canAssignHrEmployeePermissions({ role: "super_admin", permissions: ["all"] }, ["accounts:view"]), false);
});

test("editing HR permissions preserves permissions outside the editor's delegated scope", () => {
  const { mergeHrEmployeePermissions } = loaded.exports;
  const manager = { role: "hr_manager", permissions: ["employees:view", "employees:edit"] };

  assert.deepEqual(
    mergeHrEmployeePermissions(
      manager,
      ["employees:view", "payrollRuns:view", "products:view"],
      ["employees:edit"],
    ),
    ["payrollRuns:view", "products:view", "employees:edit"],
  );
});
