import crypto from "crypto";
import fs from "fs";
import path from "path";

export type RoleName =
  | "super_admin"
  | "finance_manager"
  | "sales_manager"
  | "inventory_manager"
  | "hr_manager"
  | "employee"
  | "auditor";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "post" | "print" | "export";

export type UserRoleDefinition = {
  label: string;
  permissions: string[];
};

export type AuthUser = {
  id: string;
  companyId?: string;
  username: string;
  fullName: string;
  role: RoleName;
  administration?: string;
  managerId?: string | null;
  department: string;
  title: string;
  active: boolean;
  email?: string;
  permissions: string[];
  mustChangePassword: boolean;
  passwordHash: string;
  failedLoginAttempts: number;
  lastFailedLoginAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  rememberMe?: boolean;
};

export type AuthAuditEntry = {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  module: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type AuthStore = {
  users: AuthUser[];
  sessions: AuthSession[];
  auditLog: AuthAuditEntry[];
  updatedAt: string;
};

export const SESSION_COOKIE_NAME = "erp_session";
export const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
export const REMEMBERED_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const ROLE_LIBRARY: Record<RoleName, UserRoleDefinition> = {
  super_admin: {
    label: "مدير النظام",
    permissions: ["all"],
  },
  finance_manager: {
    label: "مدير المحاسبة",
    permissions: [
      "accounts:view",
      "journalEntries:view",
      "journalEntries:create",
      "journalEntries:edit",
      "journalEntries:approve",
      "journalEntries:post",
      "cashVouchers:view",
      "cashVouchers:create",
      "cashVouchers:edit",
      "expenses:view",
      "expenses:create",
      "expenses:edit",
      "revenues:view",
      "revenues:create",
      "revenues:edit",
      "bankTransfers:view",
      "bankTransfers:create",
      "bankTransfers:edit",
      "customers:view",
      "vendors:view",
      "reports:view",
    ],
  },
  sales_manager: {
    label: "مدير المبيعات",
    permissions: [
      "salesInvoices:view",
      "salesInvoices:create",
      "salesInvoices:edit",
      "salesInvoices:approve",
      "salesInvoices:post",
      "salesReturns:view",
      "salesReturns:create",
      "customers:view",
      "customers:create",
      "customers:edit",
      "products:view",
      "products:create",
      "products:edit",
      "reports:view",
    ],
  },
  inventory_manager: {
    label: "مدير المخزون",
    permissions: [
      "products:view",
      "products:create",
      "products:edit",
      "warehouses:view",
      "warehouses:create",
      "warehouses:edit",
      "stockAdjustments:view",
      "stockAdjustments:create",
      "stockAdjustments:edit",
      "purchaseOrders:view",
      "purchaseOrders:create",
      "purchaseOrders:edit",
      "purchaseInvoices:view",
      "purchaseInvoices:create",
      "purchaseInvoices:edit",
      "purchaseInvoices:post",
      "reports:view",
    ],
  },
  hr_manager: {
    label: "مدير الموارد البشرية",
    permissions: [
      "employees:view",
      "employees:create",
      "employees:edit",
      "payroll:view",
      "payroll:create",
      "payroll:edit",
      "payrollRuns:view",
      "payrollRuns:create",
      "payrollRuns:edit",
      "attendance:view",
      "reports:view",
      "reportJobs:view",
    ],
  },
  employee: {
    label: "موظف",
    permissions: [],
  },
  auditor: {
    label: "المراجع الداخلي",
    permissions: [
      "audit:view",
      "audit:export",
      "reports:view",
      "accounts:view",
      "journalEntries:view",
      "salesInvoices:view",
      "purchaseInvoices:view",
      "cashVouchers:view",
    ],
  },
};

const AUTH_STORE_PATH = path.join(process.cwd(), "data", "auth-store.json");

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `pbkdf2$${salt}$${derived}`;
}

export function verifyPassword(password: string, hashedPassword: string) {
  if (!hashedPassword || !hashedPassword.startsWith("pbkdf2$")) {
    return false;
  }

  const parts = hashedPassword.split("$");
  if (parts.length !== 3) return false;
  const [, salt, storedHash] = parts;
  if (!salt || !storedHash) return false;

  const candidate = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  const stored = Buffer.from(storedHash, "hex");
  const candidateBuf = Buffer.from(candidate, "hex");
  return stored.length === candidateBuf.length && crypto.timingSafeEqual(stored, candidateBuf);
}

function readStore(): AuthStore {
  const storeDir = path.dirname(AUTH_STORE_PATH);
  fs.mkdirSync(storeDir, { recursive: true });

  if (!fs.existsSync(AUTH_STORE_PATH)) {
    const bootstrapPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
    if (!bootstrapPassword) {
      throw new Error("AUTH_BOOTSTRAP_PASSWORD is not configured.");
    }

    const defaultUser: AuthUser = {
      id: "user-super-admin",
      username: "A123",
      fullName: "المدير الرئيسي",
      role: "super_admin",
      department: "إدارة النظام",
      title: "مدير النظام",
      active: true,
      email: "admin@almadar.local",
      permissions: ["all"],
      mustChangePassword: true,
      passwordHash: hashPassword(bootstrapPassword),
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initialStore: AuthStore = {
      users: [defaultUser],
      sessions: [],
      auditLog: [
        {
          id: createId("audit"),
          actorUserId: defaultUser.id,
          actorUsername: defaultUser.username,
          action: "bootstrap_account_created",
          module: "security",
          details: { message: "تم إنشاء حساب المدير الرئيسي الأولي" },
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(initialStore, null, 2), "utf8");
    return initialStore;
  }

  try {
    const raw = fs.readFileSync(AUTH_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthStore>;
    if (
      !parsed || typeof parsed !== "object" || !Array.isArray(parsed.users) ||
      (parsed.sessions !== undefined && !Array.isArray(parsed.sessions)) ||
      (parsed.auditLog !== undefined && !Array.isArray(parsed.auditLog))
    ) {
      throw new Error("تنسيق ملف المستخدمين غير صالح.");
    }
    const safeStore: AuthStore = {
      users: parsed.users,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };

    if (!safeStore.users.some((user) => user.username === "A123")) {
      const bootstrapPassword = process.env.AUTH_BOOTSTRAP_PASSWORD;
      if (!bootstrapPassword) {
        throw new Error("AUTH_BOOTSTRAP_PASSWORD is not configured.");
      }

      safeStore.users.push({
        id: "user-super-admin",
        username: "A123",
        fullName: "المدير الرئيسي",
        role: "super_admin",
        department: "إدارة النظام",
        title: "مدير النظام",
        active: true,
        email: "admin@almadar.local",
        permissions: ["all"],
        mustChangePassword: true,
        passwordHash: hashPassword(bootstrapPassword),
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      safeStore.updatedAt = new Date().toISOString();
    }

    fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(safeStore, null, 2), "utf8");
    return safeStore;
  } catch (error) {
    throw new Error("تعذر قراءة أو تحديث ملف المستخدمين؛ لم تتم إعادة تهيئة البيانات.", { cause: error });
  }
}

function writeStore(nextStore: AuthStore) {
  nextStore.updatedAt = new Date().toISOString();
  fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(nextStore, null, 2), "utf8");
  return nextStore;
}

function sanitizeUser(user: AuthUser) {
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return safeUser;
}

export function listUsers() {
  return readStore().users.map((user) => sanitizeUser(user));
}

export function getUserById(userId: string) {
  return readStore().users.find((user) => user.id === userId) ?? null;
}

export function getUserByUsername(username: string) {
  return readStore().users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase()) ?? null;
}

export function getRolePermissions(role: RoleName) {
  return ROLE_LIBRARY[role]?.permissions ?? [];
}

export function createUserRecord(input: {
  username: string;
  fullName: string;
  role?: RoleName;
  department?: string;
  title?: string;
  email?: string;
  password: string;
  active?: boolean;
  permissions?: string[];
  administration?: string;
  managerId?: string | null;
  mustChangePassword?: boolean;
}, actor?: Pick<AuthUser, "id" | "username">) {
  const store = readStore();
  const username = input.username.trim();
  if (!username) throw new Error("اسم المستخدم مطلوب.");
  if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("اسم المستخدم موجود بالفعل.");
  }

  const role = input.role ?? "sales_manager";
  if (role === "super_admin") throw new Error("لا يمكن إنشاء مدير رئيسي إضافي.");
  const permissions = input.permissions?.length ? input.permissions : getRolePermissions(role);
  const user: AuthUser = {
    id: createId("user"),
    username,
    fullName: input.fullName.trim() || username,
    role,
    administration: input.administration?.trim() || "عام",
    managerId: input.managerId ?? null,
    department: input.department ?? "عام",
    title: input.title ?? "موظف",
    active: input.active ?? true,
    email: input.email ?? undefined,
    permissions,
    mustChangePassword: input.mustChangePassword ?? false,
    passwordHash: hashPassword(input.password),
    failedLoginAttempts: 0,
    lastFailedLoginAt: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.users.push(user);
  writeStore(store);
  recordAuditLog({
    action: "user_created",
    module: "security",
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { userId: user.id, username: user.username, role: user.role },
  });
  return sanitizeUser(user);
}

export function updateUserRecord(
  userId: string,
  patch: Partial<AuthUser> & { password?: string },
  actor?: Pick<AuthUser, "id" | "username">,
) {
  const store = readStore();
  const index = store.users.findIndex((user) => user.id === userId);
  if (index === -1) throw new Error("المستخدم غير موجود.");

  const existing = store.users[index];
  if (patch.role === "super_admin" && existing.role !== "super_admin") {
    throw new Error("لا يمكن تعيين دور المدير الرئيسي.");
  }
  if (existing.role === "super_admin" && (patch.role !== undefined || patch.permissions !== undefined)) {
    throw new Error("لا يمكن تعديل دور أو صلاحيات المدير الرئيسي.");
  }
  if (patch.managerId === userId || (patch.managerId && !store.users.some((user) => user.id === patch.managerId && user.active))) {
    throw new Error("المدير المباشر غير صالح.");
  }
  if (patch.managerId) {
    let managerId: string | null = patch.managerId;
    const visited = new Set([userId]);
    while (managerId) {
      if (visited.has(managerId)) throw new Error("تعيين المدير ينشئ تسلسلاً إدارياً دائرياً.");
      visited.add(managerId);
      managerId = store.users.find((user) => user.id === managerId)?.managerId ?? null;
    }
  }

  const nextUser: AuthUser = {
    ...existing,
    ...patch,
    username: patch.username?.trim() || existing.username,
    fullName: patch.fullName?.trim() || existing.fullName,
    department: patch.department ?? existing.department,
    title: patch.title ?? existing.title,
    administration: patch.administration?.trim() || existing.administration || "عام",
    managerId: patch.managerId !== undefined ? patch.managerId : existing.managerId ?? null,
    permissions: patch.permissions ?? existing.permissions,
    updatedAt: new Date().toISOString(),
  };

  if (patch.password) {
    nextUser.passwordHash = hashPassword(patch.password);
    nextUser.mustChangePassword = patch.mustChangePassword ?? true;
  }

  if (existing.role === "super_admin" && patch.active === false) {
    throw new Error("لا يمكن تعطيل حساب المدير الرئيسي.");
  }

  store.users[index] = nextUser;
  writeStore(store);
  recordAuditLog({
    action: "user_updated",
    module: "security",
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { userId: nextUser.id, username: nextUser.username, fields: Object.keys(patch) },
  });
  return sanitizeUser(nextUser);
}

export function changeUserPassword(userId: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error("كلمة المرور يجب ألا تقل عن 8 أحرف.");
  const store = readStore();
  const user = store.users.find((candidate) => candidate.id === userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    throw new Error("كلمة المرور الحالية غير صحيحة.");
  }

  user.passwordHash = hashPassword(newPassword);
  user.mustChangePassword = false;
  user.failedLoginAttempts = 0;
  user.lastFailedLoginAt = null;
  user.updatedAt = new Date().toISOString();
  writeStore(store);
  recordAuditLog({
    actorUserId: user.id,
    actorUsername: user.username,
    action: "password_changed",
    module: "security",
    details: { userId: user.id },
  });
  return true;
}

export function deleteUserRecord(userId: string, actor?: Pick<AuthUser, "id" | "username">) {
  const store = readStore();
  const target = store.users.find((user) => user.id === userId);
  if (!target) throw new Error("المستخدم غير موجود.");
  if (target.role === "super_admin") {
    throw new Error("لا يمكن حذف حساب المدير الرئيسي.");
  }

  store.users = store.users.filter((user) => user.id !== userId);
  writeStore(store);
  recordAuditLog({
    action: "user_deleted",
    module: "security",
    actorUserId: actor?.id,
    actorUsername: actor?.username,
    details: { userId, username: target.username },
  });
  return { success: true };
}

export function recordAuditLog(input: {
  action: string;
  module: string;
  details: Record<string, unknown>;
  actorUserId?: string | null;
  actorUsername?: string | null;
}) {
  const store = readStore();
  const entry: AuthAuditEntry = {
    id: createId("audit"),
    actorUserId: input.actorUserId ?? null,
    actorUsername: input.actorUsername ?? null,
    action: input.action,
    module: input.module,
    details: input.details,
    createdAt: new Date().toISOString(),
  };
  store.auditLog = [entry, ...store.auditLog].slice(0, 500);
  writeStore(store);
  return entry;
}

export function authenticateUser(username: string, password: string) {
  const store = readStore();
  const user = store.users.find((candidate) => candidate.username.toLowerCase() === username.trim().toLowerCase());

  if (!user) {
    recordAuditLog({
      action: "login_failed",
      module: "security",
      details: { username, reason: "user_not_found" },
    });
    return { ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." } as const;
  }

  if (!user.active) {
    recordAuditLog({
      action: "login_failed",
      module: "security",
      details: { username, reason: "user_inactive" },
      actorUserId: user.id,
      actorUsername: user.username,
    });
    return { ok: false, message: "هذا المستخدم غير نشط." } as const;
  }

  const now = Date.now();
  const lastFailed = user.lastFailedLoginAt ? new Date(user.lastFailedLoginAt).getTime() : 0;
  if (user.failedLoginAttempts >= 5 && now - lastFailed < 1000 * 60 * 15) {
    recordAuditLog({
      action: "login_blocked",
      module: "security",
      details: { username, message: "تم حظر تسجيل الدخول مؤقتاً" },
      actorUserId: user.id,
      actorUsername: user.username,
    });
    return { ok: false, message: "تم حظر الحساب مؤقتاً بسبب محاولات تسجيل دخول متكررة." } as const;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    user.failedLoginAttempts += 1;
    user.lastFailedLoginAt = new Date().toISOString();
    writeStore(store);
    recordAuditLog({
      action: "login_failed",
      module: "security",
      details: { username, reason: "invalid_password" },
      actorUserId: user.id,
      actorUsername: user.username,
    });
    return { ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة." } as const;
  }

  user.failedLoginAttempts = 0;
  user.lastFailedLoginAt = null;
  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();
  writeStore(store);
  recordAuditLog({
    action: "login_success",
    module: "security",
    details: { username },
    actorUserId: user.id,
    actorUsername: user.username,
  });

  return { ok: true, user: sanitizeUser(user), mustChangePassword: user.mustChangePassword } as const;
}

export function createSession(userId: string, rememberMe = false) {
  const store = readStore();
  const token = crypto.randomBytes(32).toString("hex");
  const ttl = rememberMe ? REMEMBERED_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS;
  const session: AuthSession = {
    id: createId("session"),
    userId,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl).toISOString(),
    rememberMe,
  };
  store.sessions = [session, ...store.sessions.filter((item) => item.userId !== userId)].slice(0, 50);
  writeStore(store);
  return token;
}

export function getSessionTokenFromHeader(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  const sessionCookie = cookies.find((entry) => entry.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) return null;
  return decodeURIComponent(sessionCookie.split("=")[1] ?? "").trim();
}

export function getSessionUserFromToken(token?: string | null, options?: { touch?: boolean }) {
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const store = readStore();
  const session = store.sessions.find((candidate) => candidate.tokenHash === hash);
  if (!session) return null;

  const now = Date.now();
  if (new Date(session.expiresAt).getTime() < now) {
    store.sessions = store.sessions.filter((candidate) => candidate.id !== session.id);
    writeStore(store);
    return null;
  }

  if (options?.touch !== false) {
    session.lastSeenAt = new Date().toISOString();
    const ttl = session.rememberMe ? REMEMBERED_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS;
    session.expiresAt = new Date(now + ttl).toISOString();
    writeStore(store);
  }

  const user = store.users.find((candidate) => candidate.id === session.userId);
  if (!user || !user.active) return null;
  return sanitizeUser(user);
}

export function destroySession(token?: string | null) {
  if (!token) return false;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const store = readStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.tokenHash !== hash);
  writeStore(store);
  return before !== store.sessions.length;
}

export function userHasPermission(user: { role?: string; permissions?: string[] } | null, entity: string, action: PermissionAction) {
  if (!user) return false;
  if (user.role === "super_admin" || user.permissions?.includes("all")) return true;

  const permissions = (user.permissions ?? []).map((permission) => permission.toLowerCase());
  const candidates = new Set([
    `${entity.toLowerCase()}:${action}`,
    `${entity.toLowerCase()}:*`,
    `${entity.toLowerCase()}:all`,
  ]);

  return permissions.some((permission) => candidates.has(permission));
}

export function listAuditLog() {
  return readStore().auditLog;
}
