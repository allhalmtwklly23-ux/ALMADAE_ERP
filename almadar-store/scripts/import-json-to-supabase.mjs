import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const defaultCompanyId = "00000000-0000-4000-8000-000000000001";

function loadLocalEnvironment() {
  const filePath = path.join(root, ".env.local");
  if (!existsSync(filePath)) return;

  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function readJson(fileName) {
  const filePath = path.join(root, "data", fileName);
  if (!existsSync(filePath)) throw new Error(`Required source file is missing: data\\${fileName}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function createPayload() {
  const store = readJson("erp-store.json");
  const auth = readJson("auth-store.json");
  const collections = store.collections;
  if (!collections || typeof collections !== "object" || Array.isArray(collections)) {
    throw new Error("The ERP JSON store has no valid collections object.");
  }
  if (!Array.isArray(auth.users) || !Array.isArray(auth.auditLog)) {
    throw new Error("The auth JSON store has no valid users or audit log.");
  }

  const records = [];
  for (const [entity, rows] of Object.entries(collections)) {
    if (!Array.isArray(rows)) throw new Error(`Invalid ERP collection: ${entity}`);
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.id) {
        throw new Error(`An ERP record in ${entity} has no id.`);
      }
      records.push({
        entity,
        record_id: String(row.id),
        status: String(row.status ?? "draft"),
        data: row,
        created_at: row.createdAt ?? new Date().toISOString(),
        updated_at: row.updatedAt ?? new Date().toISOString(),
      });
    }
  }

  const users = auth.users.map((user) => {
    if (!user?.id || !user.username || !String(user.passwordHash ?? "").startsWith("pbkdf2$")) {
      throw new Error("A local user is missing required fields or a PBKDF2 password hash.");
    }
    return {
      id: String(user.id),
      username: String(user.username),
      username_normalized: String(user.username).trim().toLocaleLowerCase(),
      full_name: String(user.fullName ?? user.username),
      email: user.email ?? null,
      role: String(user.role ?? "sales_manager"),
      department: String(user.department ?? "عام"),
      title: String(user.title ?? "موظف"),
      active: user.active !== false,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      must_change_password: user.mustChangePassword === true,
      password_hash: user.passwordHash,
      failed_login_attempts: Number(user.failedLoginAttempts ?? 0),
      last_failed_login_at: user.lastFailedLoginAt ?? null,
      last_login_at: user.lastLoginAt ?? null,
      created_at: user.createdAt ?? new Date().toISOString(),
      updated_at: user.updatedAt ?? new Date().toISOString(),
    };
  });

  const auditLog = auth.auditLog.map((entry) => {
    if (!entry?.id || !entry.action || !entry.module) {
      throw new Error("A local audit entry is missing required fields.");
    }
    return {
      id: String(entry.id),
      actor_user_id: entry.actorUserId ?? null,
      actor_username: entry.actorUsername ?? null,
      action: String(entry.action),
      module: String(entry.module),
      details: entry.details && typeof entry.details === "object" ? entry.details : {},
      created_at: entry.createdAt ?? new Date().toISOString(),
    };
  });

  return { records, users, auditLog };
}

loadLocalEnvironment();
const payload = createPayload();
const counts = {
  records: payload.records.length,
  users: payload.users.length,
  auditEntries: payload.auditLog.length,
};

if (process.argv.includes("--dry-run")) {
  console.log(`Validated legacy data: ${counts.records} records, ${counts.users} users, ${counts.auditEntries} audit entries.`);
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before importing.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.rpc("erp_import_legacy", {
  p_company_id: process.env.ERP_COMPANY_ID ?? defaultCompanyId,
  p_records: payload.records,
  p_users: payload.users,
  p_audit_log: payload.auditLog,
});

if (error) throw new Error(`Legacy import failed: ${error.message}`);
console.log(`Imported legacy data: ${data.records} records, ${data.users} users, ${data.auditEntries} audit entries.`);
console.log("Existing sessions were not imported; sign in again after migration.");
