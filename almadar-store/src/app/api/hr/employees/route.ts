import { connection, NextResponse } from "next/server";
import {
  createUserRecord,
  getSessionTokenFromHeader,
  getSessionUserFromToken,
  listUsers,
  updateUserRecord,
  userHasPermission,
} from "@/lib/erp/auth-system";
import {
  createDatabaseUser,
  getDatabaseSessionUser,
  getPersistenceMode,
  listDatabaseUsers,
  updateDatabaseUser,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";
import {
  canAssignHrEmployeePermissions,
  mergeHrEmployeePermissions,
} from "@/lib/erp/hr-employee-access";

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function unexpectedFailure(error: unknown, operation: string, message: string) {
  console.error(`HR employee ${operation} failed:`, error);
  return failure(message, 500);
}

function isDuplicateUsername(error: unknown) {
  return error instanceof Error && (
    error.message.includes("اسم المستخدم موجود بالفعل") ||
    error.message.toLocaleLowerCase().includes("duplicate key")
  );
}

async function getAuthorizedUser(request: Request, action: "view" | "create" | "edit") {
  const mode = getPersistenceMode();
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);

  if (!user || user.mustChangePassword) return { response: failure("يلزم تسجيل الدخول وتغيير كلمة المرور أولاً.", 401) };
  if (!userHasPermission(user, "employees", action)) return { response: failure("لا توجد صلاحية لإدارة حسابات الموظفين.", 403) };
  return { mode, user };
}

function parsePermissions(value: unknown, actor: { role?: string; permissions?: string[] }) {
  if (!canAssignHrEmployeePermissions(actor, value)) {
    return { error: "تحتوي قائمة الصلاحيات على قيمة غير مسموحة أو صلاحية لا تملك حق منحها." } as const;
  }
  return { permissions: value } as const;
}

function readFormString(body: Record<string, unknown>, key: string, maximum: number, required = false) {
  const value = body[key];
  if (value === undefined && !required) return { value: undefined };
  if (typeof value !== "string") return { error: `قيمة ${key} غير صالحة.` };
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) return { error: `تحقق من قيمة ${key}.` };
  return { value: normalized };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, () => handleGet(request));
  } catch (error) {
    return unexpectedFailure(error, "list", "تعذر تحميل حسابات الموظفين.");
  }
}

async function handleGet(request: Request) {
  await connection();
  const authorization = await getAuthorizedUser(request, "view");
  if (authorization.response) return authorization.response;

  try {
    const users = authorization.mode === "supabase" ? await listDatabaseUsers() : listUsers();
    return NextResponse.json({ success: true, data: users.filter((user) => user.role === "employee") });
  } catch (error) {
    return unexpectedFailure(error, "list", "تعذر تحميل حسابات الموظفين.");
  }
}

export async function POST(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, () => handlePost(request));
  } catch (error) {
    if (isDuplicateUsername(error)) return failure("اسم المستخدم مستخدم بالفعل.", 409);
    return unexpectedFailure(error, "create", "تعذر إنشاء حساب الموظف.");
  }
}

async function handlePost(request: Request) {
  await connection();
  const authorization = await getAuthorizedUser(request, "create");
  if (authorization.response) return authorization.response;

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return failure("بيانات الطلب غير صالحة.", 400);
  }
  if (!isRecord(parsedBody)) return failure("بيانات الطلب غير صالحة.", 400);
  const body = parsedBody;
  const allowedFields = new Set(["username", "fullName", "department", "title", "email", "password", "permissions"]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return failure("يحتوي الطلب على حقول غير مسموحة.", 400);
  }

  const username = readFormString(body, "username", 80, true);
  const fullName = readFormString(body, "fullName", 150, true);
  const department = readFormString(body, "department", 120, true);
  const title = readFormString(body, "title", 120, true);
  const email = readFormString(body, "email", 254);
  const password = body.password;
  const invalidField = [username, fullName, department, title, email].find((field) => field.error);
  if (invalidField?.error) return failure(invalidField.error, 400);
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return failure("كلمة المرور يجب أن تكون بين 8 و128 حرفاً.", 400);
  }
  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    return failure("البريد الإلكتروني غير صالح.", 400);
  }
  const permissions = parsePermissions(body.permissions, authorization.user);
  if (permissions.error) return failure(permissions.error, 400);

  try {
    const input = {
      username: username.value ?? "",
      fullName: fullName.value ?? "",
      role: "employee" as const,
      department: department.value ?? "",
      title: title.value ?? "",
      email: email.value ?? "",
      password,
      active: true,
      permissions: permissions.permissions,
      mustChangePassword: true,
    };
    const result = authorization.mode === "supabase"
      ? await createDatabaseUser(input, authorization.user)
      : createUserRecord(input, authorization.user);
    return NextResponse.json({ success: true, message: "تم إنشاء حساب الموظف بنجاح.", data: result });
  } catch (error) {
    if (isDuplicateUsername(error)) return failure("اسم المستخدم مستخدم بالفعل.", 409);
    return unexpectedFailure(error, "create", "تعذر إنشاء حساب الموظف.");
  }
}

export async function PUT(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, () => handlePut(request));
  } catch (error) {
    if (isDuplicateUsername(error)) return failure("اسم المستخدم مستخدم بالفعل.", 409);
    return unexpectedFailure(error, "update", "تعذر تحديث حساب الموظف.");
  }
}

async function handlePut(request: Request) {
  await connection();
  const authorization = await getAuthorizedUser(request, "edit");
  if (authorization.response) return authorization.response;

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return failure("بيانات الطلب غير صالحة.", 400);
  }
  if (!isRecord(parsedBody)) return failure("بيانات الطلب غير صالحة.", 400);
  const body = parsedBody;
  const allowedFields = new Set(["id", "username", "fullName", "department", "title", "email", "active", "permissions", "password"]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return failure("يحتوي الطلب على حقول غير مسموحة.", 400);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return failure("معرف الموظف مطلوب.", 400);
  if (id === authorization.user.id) return failure("لا يمكنك تعديل حسابك من إدارة الموظفين.", 403);

  try {
    const users = authorization.mode === "supabase" ? await listDatabaseUsers() : listUsers();
    const employee = users.find((candidate) => candidate.id === id && candidate.role === "employee");
    if (!employee) return failure("حساب الموظف غير موجود.", 404);

    const patch: {
      username?: string;
      fullName?: string;
      department?: string;
      title?: string;
      email?: string;
      active?: boolean;
      permissions?: string[];
      password?: string;
    } = {};
    for (const [key, maximum, required] of [
      ["username", 80, true],
      ["fullName", 150, true],
      ["department", 120, true],
      ["title", 120, true],
      ["email", 254, false],
    ] as const) {
      if (body[key] === undefined) continue;
      const field = readFormString(body, key, maximum, required);
      if (field.error) return failure(field.error, 400);
      if (key === "username") patch.username = field.value;
      if (key === "fullName") patch.fullName = field.value;
      if (key === "department") patch.department = field.value;
      if (key === "title") patch.title = field.value;
      if (key === "email") patch.email = field.value;
    }
    if (
      patch.username !== undefined &&
      users.some((candidate) => candidate.id !== id && candidate.username.toLocaleLowerCase() === patch.username?.toLocaleLowerCase())
    ) {
      return failure("اسم المستخدم مستخدم بالفعل.", 409);
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") return failure("حالة الحساب غير صالحة.", 400);
      patch.active = body.active;
    }
    if (body.permissions !== undefined) {
      const permissions = parsePermissions(body.permissions, authorization.user);
      if (permissions.error) return failure(permissions.error, 400);
      const mergedPermissions = mergeHrEmployeePermissions(authorization.user, employee.permissions ?? [], permissions.permissions);
      if (!mergedPermissions) return failure("لا يمكن منح صلاحيات خارج النطاق المسموح.", 400);
      patch.permissions = mergedPermissions;
    }
    if (body.password !== undefined && body.password !== "") {
      if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
        return failure("كلمة المرور يجب أن تكون بين 8 و128 حرفاً.", 400);
      }
      patch.password = body.password;
    }

    const result = authorization.mode === "supabase"
      ? await updateDatabaseUser(id, patch, authorization.user)
      : updateUserRecord(id, patch, authorization.user);
    return NextResponse.json({ success: true, message: "تم تحديث حساب الموظف بنجاح.", data: result });
  } catch (error) {
    if (isDuplicateUsername(error)) return failure("اسم المستخدم مستخدم بالفعل.", 409);
    return unexpectedFailure(error, "update", "تعذر تحديث حساب الموظف.");
  }
}
