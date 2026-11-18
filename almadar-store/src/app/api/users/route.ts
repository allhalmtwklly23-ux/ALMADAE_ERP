import { connection, NextResponse } from "next/server";
import {
  type RoleName,
  createUserRecord,
  deleteUserRecord,
  getSessionTokenFromHeader,
  getSessionUserFromToken,
  listUsers,
  updateUserRecord,
} from "@/lib/erp/auth-system";
import {
  createDatabaseUser,
  deleteDatabaseUser,
  getDatabaseSessionUser,
  getPersistenceMode,
  listDatabaseUsers,
  updateDatabaseUser,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

const ROLE_NAMES: RoleName[] = [
  "super_admin",
  "finance_manager",
  "sales_manager",
  "inventory_manager",
  "hr_manager",
  "employee",
  "auditor",
];

function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && ROLE_NAMES.includes(value as RoleName);
}

async function requireSuperAdmin(request: Request, mode: "json" | "supabase") {
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);
  if (!user || user.role !== "super_admin" || user.mustChangePassword) {
    return null;
  }
  return user;
}

export function GET(request: Request) {
  return withDatabaseRequestCompany(request, () => handleGet(request));
}

async function handleGet(request: Request) {
  await connection();
  const mode = getPersistenceMode();
  const user = await requireSuperAdmin(request, mode);
  if (!user) {
    return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
  }

  const users = mode === "supabase" ? await listDatabaseUsers() : listUsers();
  return NextResponse.json({ success: true, data: users });
}

export function POST(request: Request) {
  return withDatabaseRequestCompany(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  await connection();
  const mode = getPersistenceMode();
  const user = await requireSuperAdmin(request, mode);
  if (!user) {
    return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
  }

  const body = await request.json();
  if (body.role !== undefined && (!isRoleName(body.role) || body.role === "super_admin")) {
    return NextResponse.json({ success: false, message: "الدور المحدد غير مسموح." }, { status: 400 });
  }
  if (body.permissions !== undefined && (!Array.isArray(body.permissions) || !body.permissions.every((permission: unknown) => typeof permission === "string"))) {
    return NextResponse.json({ success: false, message: "قائمة الصلاحيات غير صالحة." }, { status: 400 });
  }
  const input = {
    username: String(body.username ?? ""),
    fullName: String(body.fullName ?? ""),
    role: body.role as RoleName | undefined,
    department: String(body.department ?? "عام"),
    title: String(body.title ?? "موظف"),
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    active: body.active !== false,
    permissions: Array.isArray(body.permissions) ? body.permissions : undefined,
    mustChangePassword: body.mustChangePassword === true,
  };
  const result = mode === "supabase"
    ? await createDatabaseUser(input, user)
    : createUserRecord(input, user);

  return NextResponse.json({ success: true, message: "تم إنشاء المستخدم بنجاح.", data: result });
}

export function PUT(request: Request) {
  return withDatabaseRequestCompany(request, () => handlePut(request));
}

async function handlePut(request: Request) {
  await connection();
  const mode = getPersistenceMode();
  const user = await requireSuperAdmin(request, mode);
  if (!user) {
    return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
  }

  const body = await request.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ success: false, message: "معرف المستخدم مطلوب." }, { status: 400 });
  }
  if (body.role !== undefined && !isRoleName(body.role)) {
    return NextResponse.json({ success: false, message: "الدور المحدد غير صالح." }, { status: 400 });
  }
  if (body.permissions !== undefined && (!Array.isArray(body.permissions) || !body.permissions.every((permission: unknown) => typeof permission === "string"))) {
    return NextResponse.json({ success: false, message: "قائمة الصلاحيات غير صالحة." }, { status: 400 });
  }
  if (
    id === user.id &&
    ((body.role !== undefined && body.role !== user.role) ||
      (body.permissions !== undefined && JSON.stringify(body.permissions) !== JSON.stringify(user.permissions)) ||
      (body.active !== undefined && body.active !== user.active) ||
      Boolean(body.password))
  ) {
    return NextResponse.json({ success: false, message: "لا يمكنك تغيير صلاحيات أو حالة حسابك من هذه الصفحة." }, { status: 403 });
  }

  const patch = {
    username: body.username,
    fullName: body.fullName,
    role: body.role as RoleName | undefined,
    department: body.department,
    title: body.title,
    email: body.email,
    active: body.active,
    permissions: Array.isArray(body.permissions) ? body.permissions : undefined,
    mustChangePassword: body.mustChangePassword,
    password: body.password ? String(body.password) : undefined,
  };
  const result = mode === "supabase"
    ? await updateDatabaseUser(id, patch, user)
    : updateUserRecord(id, patch, user);

  return NextResponse.json({ success: true, message: "تم تحديث المستخدم بنجاح.", data: result });
}

export function DELETE(request: Request) {
  return withDatabaseRequestCompany(request, () => handleDelete(request));
}

async function handleDelete(request: Request) {
  await connection();
  const mode = getPersistenceMode();
  const user = await requireSuperAdmin(request, mode);
  if (!user) {
    return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
  }

  const body = await request.json();
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ success: false, message: "معرف المستخدم مطلوب." }, { status: 400 });
  }

  if (id === user.id) {
    return NextResponse.json({ success: false, message: "لا يمكنك حذف حسابك." }, { status: 403 });
  }

  if (mode === "supabase") await deleteDatabaseUser(id, user);
  else deleteUserRecord(id, user);
  return NextResponse.json({ success: true, message: "تم حذف المستخدم بنجاح." });
}
