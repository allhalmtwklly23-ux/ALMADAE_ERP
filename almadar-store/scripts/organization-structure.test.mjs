import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/erp/organization-structure.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2017,
});
const loaded = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const {
  buildOrganizationTree,
  filterOrganizationTree,
  getActiveOrganizationRelationships,
  validateOrganizationRelationshipDraft,
  wouldCreateOrganizationCycle,
} = loaded.exports;

const units = [
  { id: "a", code: "A", nameAr: "ألف", status: "active" },
  { id: "b", code: "B", nameAr: "باء", status: "active" },
  { id: "c", code: "C", nameAr: "تاء", status: "active" },
];
const relation = (id, parentUnitId, childUnitId, validFrom = "2026-01-01", validTo = null) => ({
  id, structureTypeId: "admin", parentUnitId, childUnitId, validFrom, validTo,
});
const draft = (parentUnitId, childUnitId, validFrom = "2026-06-01") => ({
  structureTypeId: "admin", parentUnitId, childUnitId, validFrom,
});

test("relationship timeline includes both boundary dates and excludes expired links", () => {
  const relationships = [
    relation("active", "a", "b", "2026-01-01", "2026-06-01"),
    relation("future", "b", "c", "2026-06-02"),
  ];

  assert.deepEqual(
    getActiveOrganizationRelationships(relationships, "admin", "2026-06-01").map(({ id }) => id),
    ["active"],
  );
  assert.deepEqual(
    getActiveOrganizationRelationships(relationships, "admin", "2026-06-02").map(({ id }) => id),
    ["future"],
  );
});

test("relationship preflight detects cycles and returns a safe single-parent replacement preview", () => {
  const relationships = [relation("ab", "a", "b"), relation("bc", "b", "c")];
  assert.equal(wouldCreateOrganizationCycle("c", "a", relationships), true);
  assert.equal(wouldCreateOrganizationCycle("a", "c", relationships), false);
  assert.equal(
    validateOrganizationRelationshipDraft(draft("c", "a"), { id: "admin", allowsMultipleParents: false }, relationships, "2026-06-01"),
    "cycle",
  );
  assert.equal(
    validateOrganizationRelationshipDraft(
      draft("a", "c", "2026-06-01"),
      { id: "admin", allowsMultipleParents: false },
      [relation("future-ca", "c", "a", "2026-06-05")],
      "2026-06-01",
    ),
    "cycle",
  );

  const priorParent = relation("old-parent", "a", "c", "2026-01-01");
  assert.deepEqual(
    validateOrganizationRelationshipDraft(draft("b", "c", "2026-06-01"), { id: "admin", allowsMultipleParents: false }, [priorParent], "2026-06-01"),
    { closeRelationshipId: "old-parent" },
  );
});

test("relationship preflight rejects backdating and conflicting future assignments", () => {
  const futureParent = relation("future-parent", "a", "c", "2026-06-05");
  const structureType = { id: "admin", allowsMultipleParents: false };

  assert.equal(
    validateOrganizationRelationshipDraft(draft("b", "c", "2026-06-04"), structureType, [futureParent], "2026-06-01"),
    "future_conflict",
  );
  assert.equal(
    validateOrganizationRelationshipDraft(draft("b", "c", "2026-05-31"), structureType, [], "2026-06-01"),
    "backdate_not_allowed",
  );
  assert.equal(
    validateOrganizationRelationshipDraft(draft("a", "c"), structureType, [relation("same-parent", "a", "c")], "2026-06-01"),
    "already_active",
  );
  assert.equal(
    validateOrganizationRelationshipDraft(
      draft("b", "c"),
      { id: "admin", allowsMultipleParents: true },
      [relation("existing-parent", "a", "c")],
      "2026-06-01",
    ),
    null,
  );
});

test("multiple-parent structures render shared units and legacy cycles without recursing forever", () => {
  const sharedTree = buildOrganizationTree(units, [
    relation("ac", "a", "c"),
    relation("bc", "b", "c"),
  ]);
  const sharedNode = sharedTree.find(({ id }) => id === "b").children[0];
  assert.equal(sharedNode.id, "c");
  assert.equal(sharedNode.sharedReference, true);

  const cyclicTree = buildOrganizationTree(units, [
    relation("ab", "a", "b"),
    relation("ba", "b", "a"),
  ]);
  const cycleReference = cyclicTree.find(({ id }) => id === "a").children[0].children[0];
  assert.equal(cycleReference.id, "a");
  assert.equal(cycleReference.cycleReference, true);
});

test("tree search keeps a matching descendant's ancestors", () => {
  const tree = buildOrganizationTree(units, [relation("ab", "a", "b")]);
  const results = filterOrganizationTree(tree, "باء");
  assert.deepEqual(results.map(({ id }) => id), ["a"]);
  assert.deepEqual(results[0].children.map(({ id }) => id), ["b"]);
});
