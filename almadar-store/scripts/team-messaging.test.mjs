import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

test("team API enforces message privacy and tracks unread messages", async () => {
  const temp = mkdtempSync(join(tmpdir(), "erp-team-test-"));
  const cwd = process.cwd();
  const require = createRequire(import.meta.url);
  const users = [
    { id: "alice", fullName: "Alice", username: "alice", department: "Sales", title: "Employee", role: "sales_manager", active: true },
    { id: "bob", fullName: "Bob", username: "bob", department: "Sales", title: "Employee", role: "sales_manager", active: true },
    { id: "eve", fullName: "Eve", username: "eve", department: "Sales", title: "Employee", role: "sales_manager", active: true },
    { id: "admin", fullName: "Admin", username: "admin", department: "Management", title: "Admin", role: "super_admin", active: true },
    { id: "inactive", fullName: "Inactive", username: "inactive", department: "Sales", title: "Employee", role: "sales_manager", active: false },
    { id: "pending", fullName: "Pending", username: "pending", department: "Sales", title: "Employee", role: "sales_manager", active: true, mustChangePassword: true },
  ];
  const auth = {
    listUsers: () => users,
    getSessionTokenFromHeader: (cookie) => cookie,
    getSessionUserFromToken: (token) => users.find((user) => user.id === token && user.active) ?? null,
  };
  const database = {
    getPersistenceMode: () => "json",
    withDatabaseRequestCompany: (_request, callback) => callback(),
  };
  function load(url, replacements) {
    const source = readFileSync(new URL(url, import.meta.url), "utf8");
    const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true });
    const loaded = { exports: {} };
    new Function("require", "module", "exports", compiled)((name) => replacements[name] ?? require(name), loaded, loaded.exports);
    return loaded.exports;
  }
  try {
    process.chdir(temp);
    const local = load("../src/lib/erp/team-local.ts", { "@/lib/erp/auth-system": auth });
    const route = load("../src/app/api/team/route.ts", {
      "next/server": { connection: async () => {}, NextResponse: { json: (body, options) => Response.json(body, options) } },
      "@/lib/erp/auth-system": auth,
      "@/lib/erp/database": database,
      "@/lib/erp/team-local": local,
    });
    async function request(method, user, query = "", payload) {
      const headers = { cookie: user };
      if (payload !== undefined) headers["content-type"] = "application/json";
      const response = await route[method](new Request(`http://localhost/api/team${query}`, {
        method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
      }));
      return { status: response.status, data: await response.json() };
    }

    assert.equal((await request("GET", "missing")).status, 401);
    assert.equal((await request("GET", "pending")).status, 403);
    assert.equal((await request("GET", "eve", "?scope=all")).status, 403);
    assert.equal((await request("POST", "alice", "", { recipientId: "inactive", body: "hello" })).status, 400);
    assert.equal((await request("POST", "alice", "", { recipientId: "outside-company", body: "hello" })).status, 400);
    assert.equal((await request("POST", "alice", "", { recipientId: "alice", body: "hello" })).status, 400);
    assert.equal((await request("POST", "alice", "", { recipientId: "bob", body: "x".repeat(4001) })).status, 400);
    const sent = await request("POST", "alice", "", { recipientId: "bob", body: "hello", senderId: "eve" });
    assert.equal(sent.status, 201);
    assert.equal(sent.data.message.senderId, "alice");
    const id = sent.data.message.id;
    assert.equal((await request("GET", "bob", "?view=unread")).data.count, 1);
    assert.equal((await request("GET", "bob", "?view=inbox")).data.messages[0].body, "hello");
    assert.equal((await request("GET", "eve")).data.messages.length, 0);
    assert.equal((await request("GET", "admin", "?scope=all")).data.messages[0].id, id);
    assert.equal((await request("PATCH", "admin", "", { id })).status, 404);
    assert.equal((await request("PATCH", "eve", "", { id })).status, 404);
    assert.equal((await request("GET", "bob", "?view=unread")).data.count, 1);
    assert.equal((await request("PATCH", "bob", "", { id })).status, 200);
    assert.equal((await request("PATCH", "bob", "", { id })).status, 200);
    assert.equal((await request("GET", "bob", "?view=unread")).data.count, 0);
    assert.ok((await request("GET", "alice")).data.messages[0].readAt);

    const store = join(temp, "data", "team-messages.json");
    const original = JSON.parse(readFileSync(store, "utf8"))[0];
    const history = Array.from({ length: 55 }, (_, i) => ({
      ...original, id: randomUUID(), body: `message ${i}`, createdAt: "2026-01-01T10:00:00.000Z", readAt: null,
    }));
    const unrelated = { ...original, id: randomUUID(), senderId: "eve", senderName: "Eve", readAt: null };
    writeFileSync(store, JSON.stringify([...history, unrelated]), "utf8");
    const summary = await request("GET", "bob", "?view=conversations");
    assert.deepEqual(summary.data.conversations.map((entry) => entry.contactId).sort(), ["alice", "eve"]);
    assert.equal(summary.data.conversations.find((entry) => entry.contactId === "alice").unreadCount, 55);
    const first = await request("GET", "bob", "?view=conversation&contactId=alice");
    assert.equal(first.data.messages.length, 50);
    const cursor = first.data.messages.at(-1);
    const nextQuery = new URLSearchParams({ view: "conversation", contactId: "alice", beforeAt: cursor.createdAt, beforeId: cursor.id });
    const second = await request("GET", "bob", `?${nextQuery}`);
    assert.equal(second.data.messages.length, 5);
    assert.equal(new Set([...first.data.messages, ...second.data.messages].map((message) => message.id)).size, 55);
    assert.equal((await request("GET", "eve", "?view=conversation&contactId=alice")).data.messages.length, 0);
    const idsToRead = first.data.messages.slice(0, 49).map((message) => message.id);
    idsToRead.push(unrelated.id);
    assert.equal((await request("PATCH", "bob", "", { contactId: "alice", ids: idsToRead })).status, 200);
    assert.equal((await request("GET", "bob", "?view=unread")).data.count, 7);
    assert.equal((await request("GET", "bob", "?view=conversations")).data.conversations.find((entry) => entry.contactId === "eve").unreadCount, 1);
    assert.equal((await request("GET", "bob", "?view=conversation&contactId=alice&beforeId=broken")).status, 400);

    const many = Array.from({ length: 205 }, (_, i) => ({ ...original, id: String(i), readAt: null }));
    writeFileSync(store, JSON.stringify(many), "utf8");
    assert.equal(local.localUnreadCount(users[1]), 205);
    assert.equal(local.localTeamMessages(users[1], false, true).length, 200);
    assert.equal(local.markLocalTeamMessageRead(users[1], "204"), true);
    assert.equal(local.localTeamMessages(users[1], false, true).at(-1).id, "4");

    mkdirSync(join(temp, "data"), { recursive: true });
    const corrupt = "{broken";
    writeFileSync(store, corrupt, "utf8");
    assert.throws(() => local.sendLocalTeamMessage(users[0], "bob", "do not overwrite"));
    assert.equal(readFileSync(store, "utf8"), corrupt);
  } finally {
    process.chdir(cwd);
    rmSync(temp, { recursive: true, force: true });
  }
});
