import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

test("database team queries restrict results to session company and participants", async () => {
  const tokenHash = (value) => createHash("sha256").update(value).digest("hex");
  const tables = {
    erp_sessions: [
      { id: "session-one", token_hash: tokenHash("one"), company_id: "one", user_id: "alice", expires_at: "9999-01-01" },
      { id: "session-two", token_hash: tokenHash("two"), company_id: "two", user_id: "alice", expires_at: "9999-01-01" },
    ],
    erp_company_memberships: [
      { company_id: "one", user_id: "alice", is_active: true, role: "super_admin" },
      { company_id: "one", user_id: "bob", is_active: true, role: "sales_manager" },
      { company_id: "two", user_id: "alice", is_active: true, role: "member" },
      { company_id: "two", user_id: "eve", is_active: true, role: "sales_manager" },
    ],
    erp_users: ["alice", "bob", "eve"].map((id) => ({
      id, active: true, full_name: id, username: id, department: "Sales", title: "Employee", role: "super_admin", permissions: [],
    })),
    erp_team_messages: [
      { id: "1", company_id: "one", sender_id: "alice", sender_name: "Alice", recipient_id: "bob", recipient_name: "Bob", body: "one", created_at: "2026-01-01", read_at: null },
      { id: "2", company_id: "one", sender_id: "bob", sender_name: "Bob", recipient_id: "eve", recipient_name: "Eve", body: "other", created_at: "2026-01-02", read_at: null },
      { id: "3", company_id: "two", sender_id: "alice", sender_name: "Alice", recipient_id: "eve", recipient_name: "Eve", body: "two", created_at: "2026-01-03", read_at: null },
    ],
  };
  let updates = 0;
  class Query {
    constructor(name) { this.rows = tables[name]; this.filters = []; this.maximum = Infinity; this.offset = 0; this.count = false; this.head = false; }
    select(_columns, options = {}) { this.count = options.count === "exact"; this.head = Boolean(options.head); return this; }
    update() { updates += 1; return this; }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
    gt(key, value) { this.filters.push((row) => row[key] > value); return this; }
    is(key, value) { return this.eq(key, value); }
    in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
    order(key, { ascending = true } = {}) { this.orderKey = key; this.ascending = ascending; return this; }
    range(start, end) { this.offset = start; this.maximum = end - start + 1; return this; }
    limit(value) { this.maximum = value; return this; }
    result() {
      let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
      const count = this.count ? rows.length : null;
      if (this.orderKey) rows = rows.toSorted((a, b) => String(a[this.orderKey]).localeCompare(String(b[this.orderKey])) * (this.ascending ? 1 : -1));
      rows = rows.slice(this.offset, this.offset + this.maximum);
      return { data: this.head ? null : rows, error: null, count };
    }
    maybeSingle() { const result = this.result(); return Promise.resolve({ ...result, data: result.data[0] ?? null }); }
    then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
  }
  const source = readFileSync(new URL("../src/lib/erp/database.ts", import.meta.url), "utf8");
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, esModuleInterop: true });
  const loaded = { exports: {} };
  const require = createRequire(import.meta.url);
  const replacements = {
    "@supabase/supabase-js": { createClient: () => ({ from: (name) => new Query(name) }) },
    "@/lib/erp/auth-system": {
      ROLE_LIBRARY: { super_admin: {}, sales_manager: {} },
      DEFAULT_SESSION_TTL_MS: 8 * 60 * 60 * 1000,
      REMEMBERED_SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
    },
    "@/lib/erp/sales-tax": {},
    "@/lib/erp/store": {},
  };
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_URL = "https://test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
    new Function("require", "module", "exports", compiled)((name) => replacements[name] ?? require(name), loaded, loaded.exports);
    const db = loaded.exports;
    const actor = { id: "alice", role: "super_admin", fullName: "Alice" };
    await db.withDatabaseSessionCompany("one", async () => {
      assert.equal((await db.getDatabaseSessionUser("one", { touch: false })).id, "alice");
      assert.equal(updates, 0);
      assert.equal((await db.getDatabaseSessionUser("one")).id, "alice");
      assert.equal(updates, 1);
      assert.deepEqual((await db.listDatabaseTeamContacts()).map((contact) => contact.id).sort(), ["alice", "bob"]);
      assert.deepEqual((await db.listDatabaseTeamMessages(actor, false)).map((message) => message.body), ["one"]);
      assert.deepEqual((await db.listDatabaseTeamMessages(actor, true)).map((message) => message.body), ["other", "one"]);
      assert.equal(await db.isDatabaseTeamAdmin(actor), true);
    });
    await db.withDatabaseSessionCompany("two", async () => {
      assert.deepEqual((await db.listDatabaseTeamContacts()).map((contact) => contact.id).sort(), ["alice", "eve"]);
      assert.deepEqual((await db.listDatabaseTeamMessages(actor, false)).map((message) => message.body), ["two"]);
      assert.equal(await db.isDatabaseTeamAdmin(actor), false);
      assert.equal(await db.countDatabaseUnreadMessages(actor), 0);
    });
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
