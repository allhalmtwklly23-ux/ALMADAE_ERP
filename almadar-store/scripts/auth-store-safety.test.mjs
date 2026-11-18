import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

test("local authentication store preserves malformed data and still bootstraps a missing store", () => {
  const temp = mkdtempSync(join(tmpdir(), "erp-auth-safety-"));
  const original = process.cwd();
  const oldPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
  try {
    process.chdir(temp);
    process.env.AUTH_BOOTSTRAP_PASSWORD = "temporary-test-password";
    const source = readFileSync(new URL("../src/lib/erp/auth-system.ts", import.meta.url), "utf8");
    const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, esModuleInterop: true });
    const loaded = { exports: {} };
    new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), loaded, loaded.exports);
    const storePath = join(temp, "data", "auth-store.json");
    mkdirSync(join(temp, "data"), { recursive: true });

    for (const invalid of ["{broken", "null", '{"users":{},"sessions":[],"auditLog":[]}', '{"users":[],"sessions":{},"auditLog":[]}', '{"users":[],"sessions":[],"auditLog":{}}']) {
      writeFileSync(storePath, invalid, "utf8");
      assert.throws(() => loaded.exports.listUsers(), /لم تتم إعادة تهيئة البيانات/);
      assert.equal(readFileSync(storePath, "utf8"), invalid);
    }

    const valid = JSON.stringify({ users: [{ id: "u", username: "A123", passwordHash: "hash" }], sessions: [], auditLog: [] });
    writeFileSync(storePath, valid, "utf8");
    assert.equal(loaded.exports.listUsers()[0].id, "u");
    unlinkSync(storePath);
    assert.equal(loaded.exports.listUsers()[0].username, "A123");
    const user = JSON.parse(readFileSync(storePath, "utf8")).users[0];
    const session = {
      id: "session", userId: user.id, tokenHash: createHash("sha256").update("test-token").digest("hex"),
      createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    writeFileSync(storePath, JSON.stringify({ users: [user], sessions: [session], auditLog: [] }), "utf8");
    assert.equal(loaded.exports.getSessionUserFromToken("test-token", { touch: false }).id, user.id);
    assert.equal(JSON.parse(readFileSync(storePath, "utf8")).sessions[0].expiresAt, session.expiresAt);
    assert.equal(JSON.parse(readFileSync(storePath, "utf8")).sessions[0].lastSeenAt, session.lastSeenAt);
    loaded.exports.getSessionUserFromToken("test-token");
    assert.notEqual(JSON.parse(readFileSync(storePath, "utf8")).sessions[0].expiresAt, session.expiresAt);
  } finally {
    process.chdir(original);
    if (oldPassword === undefined) delete process.env.AUTH_BOOTSTRAP_PASSWORD;
    else process.env.AUTH_BOOTSTRAP_PASSWORD = oldPassword;
    rmSync(temp, { recursive: true, force: true });
  }
});
