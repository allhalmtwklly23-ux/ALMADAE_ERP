import { connection, NextResponse } from "next/server";
import {
  createDatabaseEmployeeProfile,
  getDatabaseSessionUser,
  getPersistenceMode,
  listDatabaseEmployeeProfiles,
  updateDatabaseEmployeeProfile,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";
import {
  getSessionTokenFromHeader,
  getSessionUserFromToken,
  userHasPermission,
} from "@/lib/erp/auth-system";
import { parseEmployeeProfileInput } from "@/lib/erp/hr-employee-profiles";

const PROFILE_FIELDS = [
  "employeeNumber",
  "fullName",
  "email",
  "phone",
  "hiredOn",
  "employmentStatus",
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const knownErrors: Record<string, { status: number; message: string }> = {
    employee_number_conflict: { status: 409, message: "الرقم الوظيفي مستخدم بالفعل في الشركة الحالية." },
    employee_profile_invalid: { status: 400, message: "بيانات ملف الموظف غير مكتملة." },
    employee_profile_status_invalid: { status: 400, message: "الحالة الوظيفية غير صالحة." },
    employee_profile_record_status_invalid: { status: 400, message: "حالة الملف غير صالحة." },
    employee_profile_not_found: { status: 404, message: "ملف الموظف غير موجود ضمن الشركة الحالية." },
    employee_actor_unavailable: { status: 403, message: "لا يمكن تنفيذ الإجراء بعضوية الشركة الحالية." },
    employee_profile_migration_required: { status: 503, message: "يتطلب سجل الموظفين تطبيق ترحيل قاعدة البيانات على بيئة اختبار معزولة." },
  };
  const knownError = knownErrors[message];
  if (knownError) return failure(knownError.message, knownError.status);
  console.error("Employee profile API failed:", error);
  return failure("تعذر تنفيذ طلب ملف الموظف.", 500);
}

async function getAuthorizedUser(request: Request, action: "view" | "create" | "edit") {
  const mode = getPersistenceMode();
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);

  if (!user || user.mustChangePassword) {
    return { response: failure("يلزم تسجيل الدخول وتغيير كلمة المرور أولاً.", 401) };
  }
  if (!userHasPermission(user, "employees", action)) {
    return { response: failure("لا توجد صلاحية لإدارة ملفات الموظفين.", 403) };
  }
  if (mode !== "supabase") {
    return { response: failure("ملفات الموظفين تتطلب قاعدة البيانات المؤسسية.", 503) };
  }
  return { user };
}

async function readJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function hasOnlyFields(body: Record<string, unknown>, fields: readonly string[]) {
  return Object.keys(body).every((key) => fields.includes(key));
}

export async function GET(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, async () => {
      await connection();
      const authorization = await getAuthorizedUser(request, "view");
      if (authorization.response) return authorization.response;
      return NextResponse.json({ success: true, data: await listDatabaseEmployeeProfiles() });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, async () => {
      await connection();
      const authorization = await getAuthorizedUser(request, "create");
      if (authorization.response) return authorization.response;

      const body = await readJson(request);
      if (!isRecord(body) || !hasOnlyFields(body, PROFILE_FIELDS)) {
        return failure("بيانات الطلب غير صالحة أو تحتوي حقولاً غير مسموحة.", 400);
      }
      const parsed = parseEmployeeProfileInput(body, false);
      if ("error" in parsed) return failure(parsed.error, 400);

      const data = await createDatabaseEmployeeProfile(parsed.input, authorization.user);
      return NextResponse.json({ success: true, message: "تم إنشاء ملف الموظف دون إنشاء حساب دخول.", data }, { status: 201 });
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, async () => {
      await connection();
      const authorization = await getAuthorizedUser(request, "edit");
      if (authorization.response) return authorization.response;

      const body = await readJson(request);
      if (
        !isRecord(body) ||
        !hasOnlyFields(body, ["id", ...PROFILE_FIELDS, "recordStatus"]) ||
        typeof body.id !== "string" ||
        !UUID_PATTERN.test(body.id)
      ) {
        return failure("معرف الموظف أو بيانات الطلب غير صالحة.", 400);
      }
      const parsed = parseEmployeeProfileInput(body, true);
      if ("error" in parsed) return failure(parsed.error, 400);

      const data = await updateDatabaseEmployeeProfile(body.id, parsed.input, authorization.user);
      return NextResponse.json({ success: true, message: "تم تحديث ملف الموظف.", data });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
