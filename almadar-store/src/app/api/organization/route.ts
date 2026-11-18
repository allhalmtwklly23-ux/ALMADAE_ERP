import { connection, NextResponse } from "next/server";
import {
  type DatabaseOrganizationKind,
  type DatabaseOrganizationStatus,
  type DatabaseOrganizationValues,
  createDatabaseOrganizationEntry,
  createDatabaseOrganizationRelationship,
  endDatabaseOrganizationRelationship,
  getPersistenceMode,
  getDatabaseSessionUser,
  listDatabaseOrganization,
  requireDatabasePermission,
  updateDatabaseOrganizationEntry,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";
import {
  getSessionTokenFromHeader,
  getSessionUserFromToken,
  userHasPermission,
} from "@/lib/erp/auth-system";

const KINDS: DatabaseOrganizationKind[] = ["unitType", "structureType", "unit"];
const STATUSES: DatabaseOrganizationStatus[] = ["active", "inactive", "archived"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is DatabaseOrganizationKind {
  return typeof value === "string" && KINDS.includes(value as DatabaseOrganizationKind);
}

function parseName(value: unknown, required: boolean): string | null | undefined {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return undefined;
  return trimmed;
}

function parseCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 64 ? trimmed : undefined;
}

function parseIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

async function getAuthorizedUser(request: Request, action: "view" | "create" | "edit") {
  const mode = getPersistenceMode();
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);
  if (!user || user.mustChangePassword) return { mode, user: null };
  const allowed = mode === "supabase"
    ? await requireDatabasePermission(user, "organization", action)
    : userHasPermission(user, "organization", action);
  return { mode, user: allowed ? user : null };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const relationshipErrors: Record<string, { status: number; message: string }> = {
    organization_relationship_invalid: { status: 400, message: "بيانات العلاقة غير مكتملة." },
    organization_relationship_self_parent: { status: 400, message: "لا يمكن ربط الوحدة بنفسها." },
    organization_relationship_backdate_not_allowed: { status: 400, message: "لا يسمح بإضافة علاقة بتاريخ سابق؛ استخدم تاريخ اليوم أو تاريخًا لاحقًا." },
    organization_relationship_cycle: { status: 409, message: "رفض النظام العلاقة لأنها تُنشئ دورة في الهيكل التنظيمي." },
    organization_relationship_data_conflict: { status: 409, message: "توجد علاقات متداخلة غير متوافقة؛ راجع السجل التاريخي قبل المتابعة." },
    organization_relationship_already_active: { status: 409, message: "العلاقة نفسها موجودة ونافذة بالفعل." },
    organization_relationship_future_conflict: { status: 409, message: "تتعارض العلاقة مع تكليف مستقبلي محفوظ." },
    organization_relationship_not_found: { status: 404, message: "العلاقة غير موجودة ضمن الشركة الحالية." },
    organization_relationship_already_ended: { status: 409, message: "العلاقة منتهية مسبقًا ولا يمكن إنهاؤها مرة أخرى." },
    organization_relationship_invalid_date: { status: 400, message: "تاريخ نهاية العلاقة يجب ألا يسبق تاريخ بدايتها." },
    organization_actor_unavailable: { status: 403, message: "لا يمكن تنفيذ الإجراء بعضوية الشركة الحالية." },
    organization_structure_type_unavailable: { status: 400, message: "نوع الهيكل غير نشط أو غير موجود." },
    organization_units_unavailable: { status: 400, message: "يجب اختيار وحدتين نشطتين من الشركة الحالية." },
  };
  const relationshipError = Object.prototype.hasOwnProperty.call(relationshipErrors, message)
    ? relationshipErrors[message]
    : undefined;
  if (relationshipError) {
    return NextResponse.json(
      { success: false, message: relationshipError.message },
      { status: relationshipError.status },
    );
  }
  if (message === "organization_code_conflict") {
    return NextResponse.json({ success: false, message: "يوجد سجل آخر بنفس الرمز." }, { status: 409 });
  }
  if (message === "organization_reference_invalid") {
    return NextResponse.json({ success: false, message: "المرجع المحدد غير موجود ضمن الشركة الحالية." }, { status: 400 });
  }
  console.error("Organization API failed:", error);
  return NextResponse.json({ success: false, message: "تعذر تنفيذ طلب الهيكل التنظيمي." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, () => handleGet(request));
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleGet(request: Request) {
  await connection();
  try {
    const { mode, user } = await getAuthorizedUser(request, "view");
    if (!user) {
      return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
    }
    if (mode !== "supabase") {
      return NextResponse.json(
        { success: false, message: "الهيكل التنظيمي يتطلب إعداد قاعدة البيانات المؤسسية." },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, data: await listDatabaseOrganization() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, () => handlePost(request));
  } catch (error) {
    return errorResponse(error);
  }
}

async function handlePost(request: Request) {
  await connection();
  try {
    const { mode, user } = await getAuthorizedUser(request, "create");
    if (!user) {
      return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
    }
    if (mode !== "supabase") {
      return NextResponse.json(
        { success: false, message: "الهيكل التنظيمي يتطلب إعداد قاعدة البيانات المؤسسية." },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ success: false, message: "صيغة الطلب غير صالحة." }, { status: 400 });
      }
      throw error;
    }
    if (!isRecord(body)) {
      return NextResponse.json({ success: false, message: "نوع السجل غير صالح." }, { status: 400 });
    }

    if (body.kind === "relationship") {
      if (
        typeof body.structureTypeId !== "string" || !UUID_PATTERN.test(body.structureTypeId) ||
        typeof body.parentUnitId !== "string" || !UUID_PATTERN.test(body.parentUnitId) ||
        typeof body.childUnitId !== "string" || !UUID_PATTERN.test(body.childUnitId)
      ) {
        return NextResponse.json({ success: false, message: "اختر نوع الهيكل والوحدتين." }, { status: 400 });
      }
      const validFrom = parseIsoDate(body.validFrom);
      if (!validFrom) {
        return NextResponse.json({ success: false, message: "تاريخ بداية العلاقة غير صالح." }, { status: 400 });
      }
      if (body.sourceEntity !== undefined && (typeof body.sourceEntity !== "string" || body.sourceEntity.length > 100)) {
        return NextResponse.json({ success: false, message: "مصدر العلاقة غير صالح." }, { status: 400 });
      }
      if (body.sourceRecordId !== undefined && (typeof body.sourceRecordId !== "string" || body.sourceRecordId.length > 200)) {
        return NextResponse.json({ success: false, message: "معرف مصدر العلاقة غير صالح." }, { status: 400 });
      }

      const result = await createDatabaseOrganizationRelationship({
        structureTypeId: body.structureTypeId,
        parentUnitId: body.parentUnitId,
        childUnitId: body.childUnitId,
        validFrom,
        sourceEntity: typeof body.sourceEntity === "string" ? body.sourceEntity : null,
        sourceRecordId: typeof body.sourceRecordId === "string" ? body.sourceRecordId : null,
      }, user);
      return NextResponse.json({
        success: true,
        data: result.relationship,
        closedRelationshipIds: result.closedRelationshipIds,
      }, { status: 201 });
    }

    if (!isKind(body.kind)) {
      return NextResponse.json({ success: false, message: "نوع السجل غير صالح." }, { status: 400 });
    }

    const code = parseCode(body.code);
    const nameAr = parseName(body.nameAr, true);
    const nameEn = body.nameEn === undefined ? null : parseName(body.nameEn, false);
    if (!code || !nameAr || nameEn === undefined) {
      return NextResponse.json({ success: false, message: "الرمز والاسم العربي مطلوبان، والحقول النصية محدودة الطول." }, { status: 400 });
    }

    const values: DatabaseOrganizationValues = { code, nameAr, nameEn };
    if (body.kind === "unit") {
      if (typeof body.unitTypeId !== "string" || !UUID_PATTERN.test(body.unitTypeId)) {
        return NextResponse.json({ success: false, message: "نوع الوحدة التنظيمية مطلوب." }, { status: 400 });
      }
      values.unitTypeId = body.unitTypeId;
    }
    if (body.kind === "structureType") {
      if (body.allowsMultipleParents !== undefined && typeof body.allowsMultipleParents !== "boolean") {
        return NextResponse.json({ success: false, message: "إعداد تعدد الآباء غير صالح." }, { status: 400 });
      }
      values.allowsMultipleParents = body.allowsMultipleParents === true;
    }

    const data = await createDatabaseOrganizationEntry(body.kind, values, user);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    return await withDatabaseRequestCompany(request, () => handlePatch(request));
  } catch (error) {
    return errorResponse(error);
  }
}

async function handlePatch(request: Request) {
  await connection();
  try {
    const { mode, user } = await getAuthorizedUser(request, "edit");
    if (!user) {
      return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
    }
    if (mode !== "supabase") {
      return NextResponse.json(
        { success: false, message: "الهيكل التنظيمي يتطلب إعداد قاعدة البيانات المؤسسية." },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ success: false, message: "صيغة الطلب غير صالحة." }, { status: 400 });
      }
      throw error;
    }
    if (!isRecord(body) || typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) {
      return NextResponse.json({ success: false, message: "نوع السجل أو معرفه غير صالح." }, { status: 400 });
    }

    if (body.kind === "relationship") {
      const validTo = parseIsoDate(body.validTo);
      if (!validTo) {
        return NextResponse.json({ success: false, message: "تاريخ نهاية العلاقة غير صالح." }, { status: 400 });
      }
      const data = await endDatabaseOrganizationRelationship(body.id, validTo, user);
      return NextResponse.json({ success: true, data });
    }
    if (!isKind(body.kind)) {
      return NextResponse.json({ success: false, message: "نوع السجل غير صالح." }, { status: 400 });
    }

    const values: DatabaseOrganizationValues = {};
    if (body.code !== undefined) {
      const code = parseCode(body.code);
      if (!code) return NextResponse.json({ success: false, message: "الرمز غير صالح." }, { status: 400 });
      values.code = code;
    }
    if (body.nameAr !== undefined) {
      const nameAr = parseName(body.nameAr, true);
      if (!nameAr) return NextResponse.json({ success: false, message: "الاسم العربي غير صالح." }, { status: 400 });
      values.nameAr = nameAr;
    }
    if (body.nameEn !== undefined) {
      const nameEn = parseName(body.nameEn, false);
      if (nameEn === undefined) return NextResponse.json({ success: false, message: "الاسم الإنجليزي غير صالح." }, { status: 400 });
      values.nameEn = nameEn;
    }
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !STATUSES.includes(body.status as DatabaseOrganizationStatus)) {
        return NextResponse.json({ success: false, message: "حالة السجل غير صالحة." }, { status: 400 });
      }
      values.status = body.status as DatabaseOrganizationStatus;
    }
    if (body.kind === "unit" && body.unitTypeId !== undefined) {
      if (typeof body.unitTypeId !== "string" || !UUID_PATTERN.test(body.unitTypeId)) {
        return NextResponse.json({ success: false, message: "نوع الوحدة التنظيمية غير صالح." }, { status: 400 });
      }
      values.unitTypeId = body.unitTypeId;
    }
    if (body.kind === "structureType" && body.allowsMultipleParents !== undefined) {
      if (typeof body.allowsMultipleParents !== "boolean") {
        return NextResponse.json({ success: false, message: "إعداد تعدد الآباء غير صالح." }, { status: 400 });
      }
      values.allowsMultipleParents = body.allowsMultipleParents;
    }
    if (Object.keys(values).length === 0) {
      return NextResponse.json({ success: false, message: "لا توجد حقول صالحة للتعديل." }, { status: 400 });
    }

    const data = await updateDatabaseOrganizationEntry(body.kind, body.id, values, user);
    if (!data) {
      return NextResponse.json({ success: false, message: "السجل غير موجود ضمن الشركة الحالية." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}
