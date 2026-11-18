import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "crypto";
import { isSalesVatMode } from "@/lib/erp/sales-tax";
import type { TeamActor, TeamContact, TeamConversation, TeamCursor, TeamMessage } from "@/lib/erp/team-types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SESSION_TTL_MS,
  REMEMBERED_SESSION_TTL_MS,
  ROLE_LIBRARY,
  SESSION_COOKIE_NAME,
  getSessionTokenFromHeader,
  hashPassword,
  verifyPassword,
  type AuthAuditEntry,
  type AuthUser,
  type PermissionAction,
  type RoleName,
} from "@/lib/erp/auth-system";
import type { EmployeeProfileInput } from "@/lib/erp/hr-employee-profiles";
import {
  ENTITY_NAMES,
  getEntityLabel,
  normalizeRecordPayload,
  validateRecordPayload,
  type OperationEntity,
  type StoredRecord,
} from "@/lib/erp/store";

export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

type TeamMessageRow = {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type DatabaseRecordRow = {
  entity: string;
  record_id: string;
  status: string;
  data: StoredRecord;
  created_at: string;
  updated_at: string;
};

type DatabaseUserRow = {
  id: string;
  company_id: string;
  username: string;
  full_name: string;
  email: string | null;
  role: RoleName;
  department: string;
  title: string;
  active: boolean;
  permissions: string[];
  must_change_password: boolean;
  password_hash: string;
  failed_login_attempts: number;
  last_failed_login_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type DatabaseAuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  action: string;
  module: string;
  details: Record<string, unknown>;
  created_at: string;
};

let adminClient: SupabaseClient | null = null;
const databaseCompanyContext = new AsyncLocalStorage<string>();

export function isSupabaseDatabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getPersistenceMode(): "json" | "supabase" {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (hasUrl && hasServiceKey) return "supabase";
  if (process.env.NODE_ENV === "production") {
    throw new Error("Supabase database is not configured for production.");
  }
  return "json";
}

function database() {
  if (!isSupabaseDatabaseConfigured()) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  if (!adminClient) {
    adminClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return adminClient;
}

function companyId() {
  return databaseCompanyContext.getStore() ?? process.env.ERP_COMPANY_ID ?? DEFAULT_COMPANY_ID;
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function throwDatabaseError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function getSessionCompany(token?: string | null) {
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date().toISOString();
  const { data: session, error: sessionError } = await database()
    .from("erp_sessions")
    .select("company_id,user_id")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now)
    .maybeSingle();
  throwDatabaseError(sessionError, "Failed to resolve session company");
  return session ? String(session.company_id) : null;
}

export async function withDatabaseSessionCompany<T>(
  token: string | null | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  if (!isSupabaseDatabaseConfigured()) return callback();
  const activeCompanyId = await getSessionCompany(token);
  return activeCompanyId
    ? databaseCompanyContext.run(activeCompanyId, callback)
    : callback();
}

export function withDatabaseRequestCompany<T>(
  request: Request,
  callback: () => Promise<T>,
): Promise<T> {
  return withDatabaseSessionCompany(
    getSessionTokenFromHeader(request.headers.get("cookie")),
    callback,
  );
}

function mapDatabaseRecord(row: DatabaseRecordRow): StoredRecord {
  return {
    ...row.data,
    id: row.record_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDatabaseUser(row: DatabaseUserRow): AuthUser {
  return {
    id: row.id,
    companyId: row.company_id,
    username: row.username,
    fullName: row.full_name,
    email: row.email ?? undefined,
    role: row.role,
    department: row.department,
    title: row.title,
    active: row.active,
    permissions: row.permissions,
    mustChangePassword: row.must_change_password,
    passwordHash: row.password_hash,
    failedLoginAttempts: row.failed_login_attempts,
    lastFailedLoginAt: row.last_failed_login_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeUser(user: AuthUser) {
  const { passwordHash, failedLoginAttempts, lastFailedLoginAt, ...safeUser } = user;
  void passwordHash;
  void failedLoginAttempts;
  void lastFailedLoginAt;
  return safeUser;
}

async function writeAuditLog(input: {
  action: string;
  module: string;
  details: Record<string, unknown>;
  actorUserId?: string | null;
  actorUsername?: string | null;
}) {
  const { error } = await database().from("erp_audit_log").insert({
    id: createId("audit"),
    company_id: companyId(),
    actor_user_id: input.actorUserId ?? null,
    actor_username: input.actorUsername ?? null,
    action: input.action,
    module: input.module,
    details: input.details,
  });
  throwDatabaseError(error, "Failed to write audit log");
}

export async function listDatabaseRecords(
  entity: string,
  filters?: { search?: string; status?: string; sortField?: string; direction?: "asc" | "desc" },
) {
  if (!ENTITY_NAMES.includes(entity as OperationEntity)) {
    throw new Error("Unknown ERP entity.");
  }

  const { data, error } = await database()
    .from("erp_records")
    .select("entity,record_id,status,data,created_at,updated_at")
    .eq("company_id", companyId())
    .eq("entity", entity);
  throwDatabaseError(error, "Failed to load ERP records");

  const rows = ((data ?? []) as DatabaseRecordRow[]).map(mapDatabaseRecord);
  const query = (filters?.search ?? "").trim().toLocaleLowerCase();
  const status = filters?.status ?? "all";
  const sortField = filters?.sortField ?? "updatedAt";
  const direction = filters?.direction ?? "desc";

  return rows
    .filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!query) return true;
      return Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
    })
    .sort((left, right) => {
      const comparison = String(left[sortField] ?? "").localeCompare(
        String(right[sortField] ?? ""),
        undefined,
        { numeric: true },
      );
      return direction === "asc" ? comparison : -comparison;
    });
}

export async function getDatabaseCollections() {
  const { data, error } = await database()
    .from("erp_records")
    .select("entity,record_id,status,data,created_at,updated_at")
    .eq("company_id", companyId());
  throwDatabaseError(error, "Failed to load ERP collections");

  const collections = Object.fromEntries(ENTITY_NAMES.map((entity) => [entity, [] as StoredRecord[]])) as Record<string, StoredRecord[]>;
  for (const row of (data ?? []) as DatabaseRecordRow[]) {
    (collections[row.entity] ??= []).push(mapDatabaseRecord(row));
  }
  return collections;
}

export async function getDatabaseRecord(entity: string, id: string) {
  if (!ENTITY_NAMES.includes(entity as OperationEntity)) return null;
  const { data, error } = await database()
    .from("erp_records")
    .select("entity,record_id,status,data,created_at,updated_at")
    .eq("company_id", companyId())
    .eq("entity", entity)
    .eq("record_id", id)
    .maybeSingle();
  throwDatabaseError(error, "Failed to load ERP record");
  return data ? mapDatabaseRecord(data as DatabaseRecordRow) : null;
}

async function ensureNoDuplicate(entity: string, payload: Record<string, unknown>, excludingId?: string) {
  const duplicateField: Record<string, string> = {
    accounts: "code",
    products: "sku",
    customers: "name",
    vendors: "name",
    suppliers: "name",
    warehouses: "name",
    itemGroups: "name",
  };
  const field = duplicateField[entity];
  if (!field || payload[field] === undefined || payload[field] === null || payload[field] === "") return;

  const rows = await listDatabaseRecords(entity);
  const exists = rows.some((row) =>
    row.id !== excludingId &&
    String(row[field] ?? "").toLocaleLowerCase() === String(payload[field]).toLocaleLowerCase()
  );
  if (exists) throw new Error(`Duplicate value detected for ${field}`);
}

export async function createDatabaseRecord(
  entity: string,
  payload: Record<string, unknown>,
  actor?: Pick<AuthUser, "id" | "username">,
) {
  if (!ENTITY_NAMES.includes(entity as OperationEntity)) throw new Error("Unknown ERP entity.");
  const normalized = normalizeRecordPayload(entity, payload ?? {});
  validateRecordPayload(entity, normalized);
  await ensureNoDuplicate(entity, normalized);

  const now = new Date().toISOString();
  const record: StoredRecord = {
    ...normalized,
    id: String(normalized.id ?? createId(entity.replace(/s$/, ""))),
    status: String(normalized.status ?? "draft"),
    createdAt: String(normalized.createdAt ?? now),
    updatedAt: String(normalized.updatedAt ?? now),
  } as StoredRecord;
  const { error } = await database().from("erp_records").insert({
    company_id: companyId(),
    entity,
    record_id: record.id,
    status: record.status,
    data: record,
    created_by: actor?.id ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  });
  throwDatabaseError(error, `Failed to create ${getEntityLabel(entity)}`);

  await writeAuditLog({
    action: "record_created",
    module: entity,
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { entity, recordId: record.id },
  });
  return record;
}

export async function updateDatabaseRecord(
  entity: string,
  id: string,
  patch: Record<string, unknown>,
  actor?: Pick<AuthUser, "id" | "username">,
) {
  const existing = await getDatabaseRecord(entity, id);
  if (!existing) throw new Error(`Record not found in ${getEntityLabel(entity)}`);
  if ((entity === "salesInvoices" || entity === "purchaseInvoices") && existing.status === "posted") {
    throw new Error("Posted invoices cannot be edited");
  }

  const invoicePatch = entity === "salesInvoices" && isSalesVatMode(existing.taxCalculation)
    ? { ...existing, ...patch, taxCalculation: existing.taxCalculation }
    : patch;
  const normalized = normalizeRecordPayload(entity, invoicePatch ?? {});
  const updated: StoredRecord = {
    ...existing,
    ...normalized,
    id,
    status: String(normalized.status ?? existing.status ?? "draft"),
    updatedAt: new Date().toISOString(),
  };
  validateRecordPayload(entity, updated);
  await ensureNoDuplicate(entity, updated, id);
  const { error } = await database()
    .from("erp_records")
    .update({ data: updated, status: updated.status, updated_at: updated.updatedAt })
    .eq("company_id", companyId())
    .eq("entity", entity)
    .eq("record_id", id);
  throwDatabaseError(error, `Failed to update ${getEntityLabel(entity)}`);

  await writeAuditLog({
    action: "record_updated",
    module: entity,
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { entity, recordId: id, before: existing, after: updated },
  });
  return updated;
}

export async function deleteDatabaseRecord(
  entity: string,
  id: string,
  actor?: Pick<AuthUser, "id" | "username">,
) {
  const existing = await getDatabaseRecord(entity, id);
  if (!existing) throw new Error(`Record not found in ${getEntityLabel(entity)}`);
  if ((entity === "salesInvoices" || entity === "purchaseInvoices") && existing.status === "posted") {
    throw new Error("Posted invoices cannot be deleted");
  }

  const { error } = await database()
    .from("erp_records")
    .delete()
    .eq("company_id", companyId())
    .eq("entity", entity)
    .eq("record_id", id);
  throwDatabaseError(error, `Failed to delete ${getEntityLabel(entity)}`);

  await writeAuditLog({
    action: "record_deleted",
    module: entity,
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { entity, recordId: id, before: existing },
  });
}

export async function postDatabaseInvoice(
  entity: string,
  id: string,
  actor?: Pick<AuthUser, "id" | "username">,
) {
  const { data, error } = await database().rpc("erp_post_invoice", {
    p_company_id: companyId(),
    p_entity: entity,
    p_invoice_id: id,
  });
  throwDatabaseError(error, "Failed to post invoice");

  await writeAuditLog({
    action: "invoice_posted",
    module: entity,
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { entity, recordId: id },
  });
  return data as StoredRecord;
}

export async function createDatabaseBackup(actor: Pick<AuthUser, "id" | "username">) {
  const { data, error } = await database()
    .from("erp_records")
    .select("entity,record_id,status,data,created_at,updated_at")
    .eq("company_id", companyId());
  throwDatabaseError(error, "Failed to create ERP backup");

  const id = createId("erp-backup");
  const { error: backupError } = await database().from("erp_backups").insert({
    id,
    company_id: companyId(),
    created_by: actor.id,
    snapshot: data ?? [],
  });
  throwDatabaseError(backupError, "Failed to save ERP backup");
  return { fileName: id, createdAt: new Date().toISOString() };
}

export async function restoreDatabaseBackup(fileName: string, actor: Pick<AuthUser, "id" | "username">) {
  const { data, error } = await database()
    .from("erp_backups")
    .select("snapshot")
    .eq("company_id", companyId())
    .eq("id", fileName)
    .maybeSingle();
  throwDatabaseError(error, "Failed to load ERP backup");
  if (!data) throw new Error("Backup file not found");

  const { data: restoredCount, error: restoreError } = await database().rpc("erp_restore_snapshot", {
    p_company_id: companyId(),
    p_snapshot: data.snapshot,
  });
  throwDatabaseError(restoreError, "Failed to restore ERP backup");
  await writeAuditLog({
    action: "database_restored",
    module: "system",
    actorUserId: actor.id,
    actorUsername: actor.username,
    details: { backupId: fileName, restoredRecords: restoredCount },
  });
  return { restoredRecords: restoredCount };
}

export async function listDatabaseBackups() {
  const { data, error } = await database()
    .from("erp_backups")
    .select("id")
    .eq("company_id", companyId())
    .order("created_at", { ascending: false });
  throwDatabaseError(error, "Failed to list ERP backups");
  return (data ?? []).map((backup) => backup.id);
}

export async function createDatabaseUser(input: {
  username: string;
  fullName: string;
  role?: RoleName;
  department?: string;
  title?: string;
  email?: string;
  password: string;
  active?: boolean;
  permissions?: string[];
  mustChangePassword?: boolean;
}, actor?: Pick<AuthUser, "id" | "username">) {
  const username = input.username.trim();
  const usernameNormalized = username.toLocaleLowerCase();
  if (!username) throw new Error("اسم المستخدم مطلوب.");
  if (input.password.length < 8) throw new Error("كلمة المرور يجب ألا تقل عن 8 أحرف.");
  const role = input.role ?? "sales_manager";
  if (role === "super_admin") throw new Error("لا يمكن إنشاء مدير رئيسي إضافي.");
  const now = new Date().toISOString();
  const id = createId("user");
  const values = {
    id,
    company_id: companyId(),
    username,
    username_normalized: usernameNormalized,
    full_name: input.fullName.trim() || username,
    email: input.email || null,
    role,
    department: input.department ?? "عام",
    title: input.title ?? "موظف",
    active: input.active ?? true,
    permissions: input.permissions?.length ? input.permissions : ROLE_LIBRARY[role].permissions,
    must_change_password: input.mustChangePassword ?? false,
    password_hash: hashPassword(input.password),
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await database().from("erp_users").insert(values).select("*").single();
  throwDatabaseError(error, "Failed to create user");
  const user = mapDatabaseUser(data as DatabaseUserRow);
  await writeAuditLog({
    action: "user_created",
    module: "security",
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { userId: user.id, username: user.username, role: user.role },
  });
  return sanitizeUser(user);
}

export async function updateDatabaseUser(
  userId: string,
  patch: Partial<AuthUser> & { password?: string },
  actor?: Pick<AuthUser, "id" | "username">,
) {
  const { data: existingRow, error: fetchError } = await database()
    .from("erp_users")
    .select("*")
    .eq("company_id", companyId())
    .eq("id", userId)
    .maybeSingle();
  throwDatabaseError(fetchError, "Failed to load user");
  if (!existingRow) throw new Error("المستخدم غير موجود.");
  const existing = mapDatabaseUser(existingRow as DatabaseUserRow);

  if (patch.role === "super_admin" && existing.role !== "super_admin") {
    throw new Error("لا يمكن تعيين دور المدير الرئيسي.");
  }
  if (existing.role === "super_admin" && (patch.role !== undefined || patch.permissions !== undefined)) {
    throw new Error("لا يمكن تعديل دور أو صلاحيات المدير الرئيسي.");
  }
  if (existing.role === "super_admin" && patch.active === false) {
    throw new Error("لا يمكن تعطيل حساب المدير الرئيسي.");
  }

  const values: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.username !== undefined) {
    const username = patch.username.trim();
    if (!username) throw new Error("اسم المستخدم مطلوب.");
    values.username = username;
    values.username_normalized = username.toLocaleLowerCase();
  }
  if (patch.fullName !== undefined) values.full_name = patch.fullName.trim() || existing.fullName;
  if (patch.email !== undefined) values.email = patch.email || null;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.department !== undefined) values.department = patch.department;
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.active !== undefined) values.active = patch.active;
  if (patch.permissions !== undefined) values.permissions = patch.permissions;
  if (patch.mustChangePassword !== undefined) values.must_change_password = patch.mustChangePassword;
  if (patch.password) {
    if (patch.password.length < 8) throw new Error("كلمة المرور يجب ألا تقل عن 8 أحرف.");
    values.password_hash = hashPassword(patch.password);
    values.must_change_password = true;
  }

  const { data, error } = await database()
    .from("erp_users")
    .update(values)
    .eq("company_id", companyId())
    .eq("id", userId)
    .select("*")
    .single();
  throwDatabaseError(error, "Failed to update user");
  const updated = mapDatabaseUser(data as DatabaseUserRow);
  await writeAuditLog({
    action: "user_updated",
    module: "security",
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { userId, fields: Object.keys(patch) },
  });
  return sanitizeUser(updated);
}

export async function changeDatabasePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < 8) throw new Error("كلمة المرور يجب ألا تقل عن 8 أحرف.");
  const { data, error } = await database()
    .from("erp_users")
    .select("id,username,password_hash")
    .eq("company_id", companyId())
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();
  throwDatabaseError(error, "Failed to verify current password");
  if (!data || !verifyPassword(currentPassword, data.password_hash)) {
    throw new Error("كلمة المرور الحالية غير صحيحة.");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await database()
    .from("erp_users")
    .update({
      password_hash: hashPassword(newPassword),
      must_change_password: false,
      failed_login_attempts: 0,
      last_failed_login_at: null,
      updated_at: now,
    })
    .eq("company_id", companyId())
    .eq("id", userId);
  throwDatabaseError(updateError, "Failed to change password");

  await writeAuditLog({
    action: "password_changed",
    module: "security",
    actorUserId: userId,
    actorUsername: data.username,
    details: { userId },
  });
  return true;
}

export async function deleteDatabaseUser(userId: string, actor?: Pick<AuthUser, "id" | "username">) {
  const { data: userRow, error: fetchError } = await database()
    .from("erp_users")
    .select("id,username,role")
    .eq("company_id", companyId())
    .eq("id", userId)
    .maybeSingle();
  throwDatabaseError(fetchError, "Failed to load user");
  if (!userRow) throw new Error("المستخدم غير موجود.");
  if (userRow.role === "super_admin") throw new Error("لا يمكن حذف حساب المدير الرئيسي.");

  const { error } = await database()
    .from("erp_users")
    .delete()
    .eq("company_id", companyId())
    .eq("id", userId);
  throwDatabaseError(error, "Failed to delete user");
  await writeAuditLog({
    action: "user_deleted",
    module: "security",
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { userId, username: userRow.username },
  });
}

export async function listDatabaseUsers() {
  const { data, error } = await database()
    .from("erp_users")
    .select("*")
    .eq("company_id", companyId())
    .order("created_at", { ascending: true });
  throwDatabaseError(error, "Failed to list users");
  return ((data ?? []) as DatabaseUserRow[]).map((row) => sanitizeUser(mapDatabaseUser(row)));
}

async function ensureBootstrapAdmin() {
  const { data, error } = await database()
    .from("erp_users")
    .select("id")
    .eq("company_id", companyId())
    .eq("username_normalized", "a123")
    .maybeSingle();
  throwDatabaseError(error, "Failed to check bootstrap administrator");
  if (data) return;

  const bootstrapPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (!bootstrapPassword) {
    throw new Error("AUTH_BOOTSTRAP_PASSWORD must be configured before the first database login.");
  }

  const now = new Date().toISOString();
  const { error: insertError } = await database().from("erp_users").insert({
    id: "user-super-admin",
    company_id: companyId(),
    username: "A123",
    username_normalized: "a123",
    full_name: "المدير الرئيسي",
    email: null,
    role: "super_admin",
    department: "إدارة النظام",
    title: "مدير النظام",
    active: true,
    permissions: ["all"],
    must_change_password: true,
    password_hash: hashPassword(bootstrapPassword),
    created_at: now,
    updated_at: now,
  });
  throwDatabaseError(insertError, "Failed to initialize the bootstrap administrator");
  await writeAuditLog({
    action: "bootstrap_account_created",
    module: "security",
    actorUserId: "user-super-admin",
    actorUsername: "A123",
    details: { message: "تم إنشاء حساب المدير الرئيسي الأولي" },
  });
}

export async function authenticateDatabaseUser(username: string, password: string) {
  await ensureBootstrapAdmin();
  const normalized = username.trim().toLocaleLowerCase();
  const { data, error } = await database()
    .from("erp_users")
    .select("*")
    .eq("company_id", companyId())
    .eq("username_normalized", normalized)
    .maybeSingle();
  throwDatabaseError(error, "Failed to authenticate user");
  if (!data) {
    await writeAuditLog({
      action: "login_failed",
      module: "security",
      details: { username, reason: "user_not_found" },
    });
    return { ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." } as const;
  }

  const user = mapDatabaseUser(data as DatabaseUserRow);
  if (!user.active) {
    await writeAuditLog({
      action: "login_failed",
      module: "security",
      actorUserId: user.id,
      actorUsername: user.username,
      details: { username, reason: "user_inactive" },
    });
    return { ok: false, message: "هذا المستخدم غير نشط." } as const;
  }

  const now = Date.now();
  const lastFailed = user.lastFailedLoginAt ? new Date(user.lastFailedLoginAt).getTime() : 0;
  if (user.failedLoginAttempts >= 5 && now - lastFailed < 1000 * 60 * 15) {
    return { ok: false, message: "تم حظر الحساب مؤقتاً بسبب محاولات تسجيل دخول متكررة." } as const;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const attempts = user.failedLoginAttempts + 1;
    const failedAt = new Date().toISOString();
    const { error: updateError } = await database()
      .from("erp_users")
      .update({ failed_login_attempts: attempts, last_failed_login_at: failedAt, updated_at: failedAt })
      .eq("company_id", companyId())
      .eq("id", user.id);
    throwDatabaseError(updateError, "Failed to update login attempts");
    await writeAuditLog({
      action: "login_failed",
      module: "security",
      actorUserId: user.id,
      actorUsername: user.username,
      details: { username, reason: "invalid_password" },
    });
    return { ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." } as const;
  }

  const { data: membership, error: membershipError } = await database()
    .from("erp_company_memberships")
    .select("user_id")
    .eq("company_id", companyId())
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  throwDatabaseError(membershipError, "Failed to verify login company membership");
  if (!membership) {
    await writeAuditLog({
      action: "login_failed",
      module: "security",
      actorUserId: user.id,
      actorUsername: user.username,
      details: { username, reason: "company_membership_inactive" },
    });
    return { ok: false, message: "لا يملك هذا المستخدم صلاحية الدخول إلى هذه المنشأة." } as const;
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRow, error: updateError } = await database()
    .from("erp_users")
    .update({
      failed_login_attempts: 0,
      last_failed_login_at: null,
      last_login_at: nowIso,
      updated_at: nowIso,
    })
    .eq("company_id", companyId())
    .eq("id", user.id)
    .eq("active", true)
    .select("*")
    .single();
  throwDatabaseError(updateError, "Failed to update login status");
  const updated = mapDatabaseUser(updatedRow as DatabaseUserRow);
  await writeAuditLog({
    action: "login_success",
    module: "security",
    actorUserId: updated.id,
    actorUsername: updated.username,
    details: { username },
  });
  return { ok: true, user: sanitizeUser(updated), mustChangePassword: updated.mustChangePassword } as const;
}

export async function createDatabaseSession(userId: string, rememberMe = false) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const ttl = rememberMe ? REMEMBERED_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { error: deleteError } = await database()
    .from("erp_sessions")
    .delete()
    .eq("company_id", companyId())
    .eq("user_id", userId);
  throwDatabaseError(deleteError, "Failed to replace existing sessions");

  const { error } = await database().from("erp_sessions").insert({
    id: createId("session"),
    company_id: companyId(),
    user_id: userId,
    token_hash: tokenHash,
    remember_me: rememberMe,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl).toISOString(),
  });
  throwDatabaseError(error, "Failed to create user session");
  return token;
}

export async function getDatabaseSessionUser(token?: string | null, options?: { touch?: boolean }) {
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const { data: session, error: sessionError } = await database()
    .from("erp_sessions")
    .select("id,user_id,company_id,remember_me")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now.toISOString())
    .maybeSingle();
  throwDatabaseError(sessionError, "Failed to validate user session");
  if (!session) return null;
  const requestCompanyId = databaseCompanyContext.getStore();
  if (requestCompanyId && requestCompanyId !== String(session.company_id)) return null;

  const { data: membership, error: membershipError } = await database()
    .from("erp_company_memberships")
    .select("role,permissions")
    .eq("company_id", session.company_id)
    .eq("user_id", session.user_id)
    .eq("is_active", true)
    .maybeSingle();
  throwDatabaseError(membershipError, "Failed to load user company membership");
  if (!membership) return null;

  const { data, error } = await database()
    .from("erp_users")
    .select("*")
    .eq("id", session.user_id)
    .eq("active", true)
    .maybeSingle();
  throwDatabaseError(error, "Failed to load session user");
  if (!data) return null;

  if (options?.touch !== false) {
    const ttl = session.remember_me ? REMEMBERED_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttl).toISOString();
    const { error: touchError } = await database()
      .from("erp_sessions")
      .update({ last_seen_at: now.toISOString(), expires_at: expiresAt })
      .eq("company_id", session.company_id)
      .eq("id", session.id);
    throwDatabaseError(touchError, "Failed to refresh user session");
  }

  const user = mapDatabaseUser(data as DatabaseUserRow);
  const role = Object.prototype.hasOwnProperty.call(ROLE_LIBRARY, membership.role)
    ? membership.role as RoleName
    : user.role;
  const permissions = Array.isArray(membership.permissions)
    ? membership.permissions.filter((permission): permission is string => typeof permission === "string")
    : [];
  return sanitizeUser({
    ...user,
    companyId: session.company_id,
    role,
    permissions,
  });
}

export async function destroyDatabaseSession(token?: string | null) {
  if (!token) return false;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { data, error } = await database()
    .from("erp_sessions")
    .delete()
    .eq("token_hash", tokenHash)
    .select("id");
  throwDatabaseError(error, "Failed to destroy user session");
  return (data?.length ?? 0) > 0;
}

export async function listDatabaseAuditLog() {
  const { data, error } = await database()
    .from("erp_audit_log")
    .select("*")
    .eq("company_id", companyId())
    .order("created_at", { ascending: false })
    .limit(500);
  throwDatabaseError(error, "Failed to load audit log");
  return ((data ?? []) as DatabaseAuditRow[]).map((row): AuthAuditEntry => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    action: row.action,
    module: row.module,
    details: row.details,
    createdAt: row.created_at,
  }));
}

export async function listDatabaseCompaniesForUser(userId: string, activeCompanyId?: string) {
  const { data: memberships, error: membershipError } = await database()
    .from("erp_company_memberships")
    .select("company_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  throwDatabaseError(membershipError, "Failed to list company memberships");

  const companyIds = (memberships ?? []).map((membership) => String(membership.company_id));
  if (companyIds.length === 0) return [];

  const { data: companies, error: companiesError } = await database()
    .from("erp_companies")
    .select("id,name")
    .in("id", companyIds)
    .order("name", { ascending: true });
  throwDatabaseError(companiesError, "Failed to list companies");

  return (companies ?? []).map((company) => ({
    id: String(company.id),
    name: String(company.name),
    active: String(company.id) === activeCompanyId,
  }));
}

export async function createDatabaseCompany(
  name: string,
  actor: Pick<AuthUser, "id" | "username" | "role" | "permissions">,
) {
  const { data, error } = await database().rpc("erp_create_company", {
    p_company_id: crypto.randomUUID(),
    p_name: name.trim(),
    p_user_id: actor.id,
    p_role: actor.role,
    p_permissions: actor.permissions,
    p_actor_username: actor.username,
    p_audit_id: createId("audit"),
  });
  throwDatabaseError(error, "Failed to create company");

  const company = Array.isArray(data) ? data[0] : data;
  if (!company || typeof company.id !== "string" || typeof company.name !== "string") {
    throw new Error("Company creation returned an invalid result.");
  }

  return { id: company.id, name: company.name };
}

export async function switchDatabaseSessionCompany(
  token: string,
  userId: string,
  targetCompanyId: string,
) {
  const { data: membership, error: membershipError } = await database()
    .from("erp_company_memberships")
    .select("company_id")
    .eq("company_id", targetCompanyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  throwDatabaseError(membershipError, "Failed to validate requested company");
  if (!membership) throw new Error("You do not have access to this company.");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { data: session, error: sessionError } = await database()
    .from("erp_sessions")
    .update({ company_id: targetCompanyId })
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .eq("company_id", companyId())
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  throwDatabaseError(sessionError, "Failed to switch active company");
  if (!session) throw new Error("unauthorized");

  const { data: company, error: companyError } = await database()
    .from("erp_companies")
    .select("id,name")
    .eq("id", targetCompanyId)
    .single();
  throwDatabaseError(companyError, "Failed to load selected company");
  if (!company) throw new Error("Selected company was not found.");
  return { id: String(company.id), name: String(company.name) };
}

export async function requireDatabasePermission(
  user: { role?: string; permissions?: string[] } | null,
  entity: string,
  action: PermissionAction,
) {
  if (!user) return false;
  if (user.role === "super_admin" || user.permissions?.includes("all")) return true;
  const permissions = (user.permissions ?? []).map((permission) => permission.toLocaleLowerCase());
  return permissions.some((permission) =>
    permission === `${entity.toLocaleLowerCase()}:${action}` ||
    permission === `${entity.toLocaleLowerCase()}:*` ||
    permission === `${entity.toLocaleLowerCase()}:all`
  );
}

export const databaseSessionCookieName = SESSION_COOKIE_NAME;

function mapTeamMessage(row: TeamMessageRow): TeamMessage {
  return {
    id: row.id, senderId: row.sender_id, senderName: row.sender_name,
    recipientId: row.recipient_id, recipientName: row.recipient_name,
    body: row.body, createdAt: row.created_at, readAt: row.read_at,
  };
}

export async function isDatabaseTeamAdmin(actor: TeamActor): Promise<boolean> {
  if (actor.role !== "super_admin") return false;
  const { data, error } = await database().from("erp_company_memberships")
    .select("role").eq("company_id", companyId()).eq("user_id", actor.id)
    .eq("is_active", true).maybeSingle();
  throwDatabaseError(error, "Failed to verify team administrator");
  return data?.role === "super_admin";
}

export async function listDatabaseTeamContacts(): Promise<TeamContact[]> {
  const memberIds: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await database().from("erp_company_memberships")
      .select("user_id").eq("company_id", companyId()).eq("is_active", true)
      .order("user_id").range(offset, offset + 499);
    throwDatabaseError(error, "Failed to load team memberships");
    const page = data ?? [];
    memberIds.push(...page.map((row) => String(row.user_id)));
    if (page.length < 500) break;
  }
  const contacts: TeamContact[] = [];
  for (let offset = 0; offset < memberIds.length; offset += 200) {
    const { data, error } = await database().from("erp_users")
      .select("id,full_name,username,department,title").eq("active", true)
      .in("id", memberIds.slice(offset, offset + 200));
    throwDatabaseError(error, "Failed to load team contacts");
    contacts.push(...(data ?? []).map((row) => ({
      id: String(row.id), fullName: String(row.full_name), username: String(row.username),
      department: String(row.department), title: String(row.title),
    })));
  }
  return contacts.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
}

export async function listDatabaseTeamMessages(actor: TeamActor, all: boolean, inbox = false): Promise<TeamMessage[]> {
  if (all && actor.role !== "super_admin") throw new Error("forbidden");
  if (inbox) {
    const { data, error } = await database().from("erp_team_messages").select("*")
      .eq("company_id", companyId()).eq("recipient_id", actor.id).is("read_at", null)
      .order("created_at", { ascending: false }).limit(200);
    throwDatabaseError(error, "Failed to load unread messages");
    return (data as TeamMessageRow[] ?? []).map(mapTeamMessage);
  }
  if (all) {
    const { data, error } = await database().from("erp_team_messages").select("*")
      .eq("company_id", companyId()).order("created_at", { ascending: false }).limit(200);
    throwDatabaseError(error, "Failed to load team messages");
    return (data as TeamMessageRow[] ?? []).map(mapTeamMessage);
  }
  const query = (column: "sender_id" | "recipient_id") => database().from("erp_team_messages")
    .select("*").eq("company_id", companyId()).eq(column, actor.id)
    .order("created_at", { ascending: false }).limit(200);
  const [sent, received] = await Promise.all([query("sender_id"), query("recipient_id")]);
  throwDatabaseError(sent.error, "Failed to load sent messages");
  throwDatabaseError(received.error, "Failed to load received messages");
  return [...(sent.data as TeamMessageRow[] ?? []), ...(received.data as TeamMessageRow[] ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .slice(0, 200).map(mapTeamMessage);
}

export async function countDatabaseUnreadMessages(actor: TeamActor): Promise<number> {
  const { count, error } = await database().from("erp_team_messages")
    .select("id", { count: "exact", head: true }).eq("company_id", companyId())
    .eq("recipient_id", actor.id).is("read_at", null);
  throwDatabaseError(error, "Failed to count unread messages");
  if (count === null) throw new Error("Failed to count unread messages: count missing");
  return count;
}

export async function listDatabaseTeamConversations(actor: TeamActor): Promise<TeamConversation[]> {
  const { data, error } = await database().rpc("erp_team_conversations", {
    p_company_id: companyId(), p_user_id: actor.id,
  });
  throwDatabaseError(error, "Failed to load team conversations");
  if (!Array.isArray(data)) throw new Error("Conversations returned an invalid result.");
  return data.map((row) => ({
    contactId: String(row.contact_id), contactName: String(row.contact_name),
    lastBody: String(row.last_body), lastAt: String(row.last_at),
    lastSenderId: String(row.last_sender_id), unreadCount: Number(row.unread_count),
  }));
}

export async function listDatabaseConversationMessages(
  actor: TeamActor, contactId: string, before?: TeamCursor,
): Promise<TeamMessage[]> {
  const { data, error } = await database().rpc("erp_team_conversation_messages", {
    p_company_id: companyId(), p_user_id: actor.id, p_contact_id: contactId,
    p_before_created_at: before?.createdAt ?? null, p_before_id: before?.id ?? null,
  });
  throwDatabaseError(error, "Failed to load conversation messages");
  if (!Array.isArray(data)) throw new Error("Conversation returned an invalid result.");
  return (data as TeamMessageRow[]).map(mapTeamMessage);
}

export async function markDatabaseConversationRead(actor: TeamActor, contactId: string, ids: string[]): Promise<void> {
  const { error } = await database().from("erp_team_messages")
    .update({ read_at: new Date().toISOString() }).eq("company_id", companyId())
    .eq("sender_id", contactId).eq("recipient_id", actor.id).is("read_at", null).in("id", ids);
  throwDatabaseError(error, "Failed to mark conversation read");
}

export async function sendDatabaseTeamMessage(actor: TeamActor, recipientId: string, body: string): Promise<TeamMessage> {
  const { data, error } = await database().rpc("erp_send_team_message", {
    p_company_id: companyId(), p_sender_id: actor.id, p_recipient_id: recipientId, p_body: body,
  });
  if (error?.message.includes("recipient_unavailable")) throw new Error("recipient_unavailable");
  throwDatabaseError(error, "Failed to send team message");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Message creation returned no result.");
  return mapTeamMessage(row as TeamMessageRow);
}

export async function markDatabaseTeamMessageRead(actor: TeamActor, id: string): Promise<boolean> {
  const { data, error } = await database().from("erp_team_messages")
    .update({ read_at: new Date().toISOString() }).eq("company_id", companyId())
    .eq("id", id).eq("recipient_id", actor.id).is("read_at", null).select("id").maybeSingle();
  throwDatabaseError(error, "Failed to mark message read");
  if (data) return true;
  const result = await database().from("erp_team_messages").select("id")
    .eq("company_id", companyId()).eq("id", id).eq("recipient_id", actor.id).maybeSingle();
  throwDatabaseError(result.error, "Failed to find message");
  return Boolean(result.data);
}

export type DatabaseOrganizationKind = "unitType" | "structureType" | "unit";
export type DatabaseOrganizationStatus = "active" | "inactive" | "archived";

export type DatabaseOrganizationValues = {
  code?: string;
  nameAr?: string;
  nameEn?: string | null;
  status?: DatabaseOrganizationStatus;
  unitTypeId?: string;
  allowsMultipleParents?: boolean;
};

function organizationTable(kind: DatabaseOrganizationKind) {
  if (kind === "unitType") return "erp_org_unit_types";
  if (kind === "structureType") return "erp_org_structure_types";
  return "erp_org_units";
}

function mapOrganizationRow(row: Record<string, unknown>, kind: DatabaseOrganizationKind) {
  const mapped: Record<string, unknown> = {
    id: String(row.id),
    code: String(row.code),
    nameAr: String(row.name_ar),
    nameEn: row.name_en === null ? null : String(row.name_en ?? ""),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (kind === "unit") mapped.unitTypeId = String(row.unit_type_id);
  if (kind === "structureType") mapped.allowsMultipleParents = Boolean(row.allows_multiple_parents);
  return mapped;
}

function mapOrganizationRelationship(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    structureTypeId: String(row.structure_type_id),
    parentUnitId: String(row.parent_unit_id),
    childUnitId: String(row.child_unit_id),
    validFrom: String(row.valid_from),
    validTo: row.valid_to === null ? null : String(row.valid_to),
    sourceEntity: row.source_entity === null ? null : String(row.source_entity ?? ""),
    sourceRecordId: row.source_record_id === null ? null : String(row.source_record_id ?? ""),
    approvedByUserId: row.approved_by_user_id === null ? null : String(row.approved_by_user_id ?? ""),
    createdByUserId: row.created_by_user_id === null ? null : String(row.created_by_user_id ?? ""),
    createdAt: String(row.created_at),
  };
}

function isDatabaseObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listDatabaseOrganization() {
  const [unitTypes, structureTypes, units, relationships] = await Promise.all([
    database().from("erp_org_unit_types")
      .select("id,code,name_ar,name_en,status,created_at,updated_at")
      .eq("company_id", companyId()).order("code", { ascending: true }),
    database().from("erp_org_structure_types")
      .select("id,code,name_ar,name_en,allows_multiple_parents,status,created_at,updated_at")
      .eq("company_id", companyId()).order("code", { ascending: true }),
    database().from("erp_org_units")
      .select("id,unit_type_id,code,name_ar,name_en,status,created_at,updated_at")
      .eq("company_id", companyId()).order("code", { ascending: true }),
    database().from("erp_org_unit_relationships")
      .select("id,structure_type_id,parent_unit_id,child_unit_id,valid_from,valid_to,source_entity,source_record_id,approved_by_user_id,created_by_user_id,created_at")
      .eq("company_id", companyId()).order("valid_from", { ascending: false }),
  ]);
  throwDatabaseError(unitTypes.error, "Failed to load organizational unit types");
  throwDatabaseError(structureTypes.error, "Failed to load organizational structure types");
  throwDatabaseError(units.error, "Failed to load organizational units");
  throwDatabaseError(relationships.error, "Failed to load organizational relationships");

  return {
    unitTypes: (unitTypes.data ?? []).map((row) => mapOrganizationRow(row, "unitType")),
    structureTypes: (structureTypes.data ?? []).map((row) => mapOrganizationRow(row, "structureType")),
    units: (units.data ?? []).map((row) => mapOrganizationRow(row, "unit")),
    relationships: (relationships.data ?? []).map((row) => mapOrganizationRelationship(row)),
  };
}

function mapOrganizationValues(values: DatabaseOrganizationValues) {
  const mapped: Record<string, unknown> = {};
  if (values.code !== undefined) mapped.code = values.code;
  if (values.nameAr !== undefined) mapped.name_ar = values.nameAr;
  if (values.nameEn !== undefined) mapped.name_en = values.nameEn;
  if (values.status !== undefined) mapped.status = values.status;
  if (values.unitTypeId !== undefined) mapped.unit_type_id = values.unitTypeId;
  if (values.allowsMultipleParents !== undefined) mapped.allows_multiple_parents = values.allowsMultipleParents;
  return mapped;
}

export async function createDatabaseOrganizationEntry(
  kind: DatabaseOrganizationKind,
  values: DatabaseOrganizationValues,
  actor: Pick<AuthUser, "id" | "username">,
) {
  const insertValues: Record<string, unknown> = {
    company_id: companyId(),
    code: values.code,
    name_ar: values.nameAr,
    name_en: values.nameEn ?? null,
  };
  if (kind === "unit") insertValues.unit_type_id = values.unitTypeId;
  if (kind === "structureType") {
    insertValues.allows_multiple_parents = values.allowsMultipleParents ?? false;
  }

  const { data, error } = await database().from(organizationTable(kind))
    .insert(insertValues).select("*").single();
  if (error?.code === "23505") throw new Error("organization_code_conflict");
  if (error?.code === "23503") throw new Error("organization_reference_invalid");
  throwDatabaseError(error, "Failed to create organizational entry");
  if (!data) throw new Error("Organization creation returned no result.");

  await writeAuditLog({
    action: `organization.${kind}.created`,
    module: "organization",
    details: { id: data.id, code: data.code },
    actorUserId: actor.id,
    actorUsername: actor.username,
  });
  return mapOrganizationRow(data, kind);
}

export async function updateDatabaseOrganizationEntry(
  kind: DatabaseOrganizationKind,
  id: string,
  values: DatabaseOrganizationValues,
  actor: Pick<AuthUser, "id" | "username">,
) {
  const { data, error } = await database().from(organizationTable(kind))
    .update({ ...mapOrganizationValues(values), updated_at: new Date().toISOString() })
    .eq("company_id", companyId())
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error?.code === "23505") throw new Error("organization_code_conflict");
  if (error?.code === "23503") throw new Error("organization_reference_invalid");
  throwDatabaseError(error, "Failed to update organizational entry");
  if (!data) return null;

  await writeAuditLog({
    action: `organization.${kind}.updated`,
    module: "organization",
    details: { id: data.id, code: data.code, changedFields: Object.keys(values) },
    actorUserId: actor.id,
    actorUsername: actor.username,
  });
  return mapOrganizationRow(data, kind);
}

function handleOrganizationRelationshipRpcError(
  error: { message: string } | null,
  operation: string,
) {
  if (!error) return;
  const knownErrors = [
    "organization_relationship_invalid",
    "organization_relationship_self_parent",
    "organization_relationship_backdate_not_allowed",
    "organization_relationship_cycle",
    "organization_relationship_data_conflict",
    "organization_relationship_already_active",
    "organization_relationship_future_conflict",
    "organization_relationship_not_found",
    "organization_relationship_already_ended",
    "organization_relationship_invalid_date",
    "organization_actor_unavailable",
    "organization_structure_type_unavailable",
    "organization_units_unavailable",
  ];
  const knownError = knownErrors.find((code) => error.message.includes(code));
  if (knownError) throw new Error(knownError);
  throwDatabaseError(error, operation);
}

export async function createDatabaseOrganizationRelationship(
  input: {
    structureTypeId: string;
    parentUnitId: string;
    childUnitId: string;
    validFrom: string;
    sourceEntity?: string | null;
    sourceRecordId?: string | null;
  },
  actor: Pick<AuthUser, "id" | "username">,
) {
  const { data, error } = await database().rpc("erp_save_org_unit_relationship", {
    p_id: crypto.randomUUID(),
    p_company_id: companyId(),
    p_structure_type_id: input.structureTypeId,
    p_parent_unit_id: input.parentUnitId,
    p_child_unit_id: input.childUnitId,
    p_valid_from: input.validFrom,
    p_source_entity: input.sourceEntity ?? null,
    p_source_record_id: input.sourceRecordId ?? null,
    p_actor_user_id: actor.id,
    p_actor_username: actor.username,
    p_audit_id: createId("audit"),
  });
  handleOrganizationRelationshipRpcError(error, "Failed to save organizational relationship");
  if (!isDatabaseObject(data)) {
    throw new Error("Organization relationship creation returned an invalid result.");
  }
  const closedIds = Array.isArray(data.closed_relationship_ids)
    ? data.closed_relationship_ids.filter((id): id is string => typeof id === "string")
    : [];
  return { relationship: mapOrganizationRelationship(data), closedRelationshipIds: closedIds };
}

export async function endDatabaseOrganizationRelationship(
  id: string,
  validTo: string,
  actor: Pick<AuthUser, "id" | "username">,
) {
  const { data, error } = await database().rpc("erp_end_org_unit_relationship", {
    p_company_id: companyId(),
    p_relationship_id: id,
    p_valid_to: validTo,
    p_actor_user_id: actor.id,
    p_actor_username: actor.username,
    p_audit_id: createId("audit"),
  });
  handleOrganizationRelationshipRpcError(error, "Failed to end organizational relationship");
  if (!isDatabaseObject(data)) {
    throw new Error("Organization relationship update returned an invalid result.");
  }
  return mapOrganizationRelationship(data);
}

export type DatabaseEmployeeProfile = Omit<EmployeeProfileInput, "email" | "phone" | "hiredOn"> & {
  id: string;
  email: string | null;
  phone: string | null;
  hiredOn: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapEmployeeProfile(row: Record<string, unknown>): DatabaseEmployeeProfile {
  return {
    id: String(row.id),
    employeeNumber: row.employee_number === null ? "" : String(row.employee_number ?? ""),
    fullName: String(row.full_name),
    email: row.email === null ? null : String(row.email ?? ""),
    phone: row.phone === null ? null : String(row.phone ?? ""),
    hiredOn: row.hired_on === null ? null : String(row.hired_on ?? ""),
    employmentStatus: String(row.employment_status) as EmployeeProfileInput["employmentStatus"],
    recordStatus: String(row.status) as EmployeeProfileInput["recordStatus"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function handleEmployeeProfileRpcError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new Error("employee_number_conflict");
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST204") {
    throw new Error("employee_profile_migration_required");
  }
  const knownErrors = [
    "employee_profile_invalid",
    "employee_profile_status_invalid",
    "employee_profile_record_status_invalid",
    "employee_profile_not_found",
    "employee_actor_unavailable",
  ];
  const knownError = knownErrors.find((code) => error.message.includes(code));
  if (knownError) throw new Error(knownError);
  throwDatabaseError(error, "Employee profile operation failed");
}

export async function listDatabaseEmployeeProfiles() {
  const { data, error } = await database()
    .from("erp_people")
    .select("id,employee_number,full_name,email,phone,hired_on,employment_status,status,created_at,updated_at")
    .eq("company_id", companyId())
    .order("employee_number", { ascending: true });
  handleEmployeeProfileRpcError(error);
  return (data ?? []).map((row) => mapEmployeeProfile(row));
}

export async function createDatabaseEmployeeProfile(
  input: EmployeeProfileInput,
  actor: Pick<AuthUser, "id" | "username">,
) {
  const { data, error } = await database().rpc("erp_create_employee_profile", {
    p_person_id: crypto.randomUUID(),
    p_company_id: companyId(),
    p_employee_number: input.employeeNumber,
    p_full_name: input.fullName,
    p_email: input.email,
    p_phone: input.phone,
    p_hired_on: input.hiredOn,
    p_employment_status: input.employmentStatus,
    p_actor_user_id: actor.id,
    p_actor_username: actor.username,
    p_audit_id: createId("audit"),
  });
  handleEmployeeProfileRpcError(error);
  if (!isDatabaseObject(data)) {
    throw new Error("Employee profile creation returned an invalid result.");
  }
  return mapEmployeeProfile(data);
}

export async function updateDatabaseEmployeeProfile(
  id: string,
  input: EmployeeProfileInput,
  actor: Pick<AuthUser, "id" | "username">,
) {
  const { data, error } = await database().rpc("erp_update_employee_profile", {
    p_person_id: id,
    p_company_id: companyId(),
    p_employee_number: input.employeeNumber,
    p_full_name: input.fullName,
    p_email: input.email,
    p_phone: input.phone,
    p_hired_on: input.hiredOn,
    p_employment_status: input.employmentStatus,
    p_record_status: input.recordStatus,
    p_actor_user_id: actor.id,
    p_actor_username: actor.username,
    p_audit_id: createId("audit"),
  });
  handleEmployeeProfileRpcError(error);
  if (!isDatabaseObject(data)) {
    throw new Error("Employee profile update returned an invalid result.");
  }
  return mapEmployeeProfile(data);
}
