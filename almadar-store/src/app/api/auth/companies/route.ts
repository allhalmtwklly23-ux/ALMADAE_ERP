import { connection, NextResponse } from "next/server";
import { getSessionTokenFromHeader } from "@/lib/erp/auth-system";
import {
  getDatabaseSessionUser,
  getPersistenceMode,
  createDatabaseCompany,
  listDatabaseCompaniesForUser,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

export function GET(request: Request) {
  return withDatabaseRequestCompany(request, async () => {
    await connection();
    if (getPersistenceMode() !== "supabase") {
      return NextResponse.json({ success: true, data: [] });
    }

    const token = getSessionTokenFromHeader(request.headers.get("cookie"));
    const user = await getDatabaseSessionUser(token);
    if (!user) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول." }, { status: 401 });
    }

    const companies = await listDatabaseCompaniesForUser(user.id, user.companyId);
    return NextResponse.json({ success: true, data: companies });
  });
}

export function POST(request: Request) {
  return withDatabaseRequestCompany(request, async () => {
    await connection();
    if (getPersistenceMode() !== "supabase") {
      return NextResponse.json(
        { success: false, message: "إنشاء منشأة جديدة يتطلب قاعدة بيانات Supabase." },
        { status: 409 },
      );
    }

    const token = getSessionTokenFromHeader(request.headers.get("cookie"));
    const user = await getDatabaseSessionUser(token);
    if (!user || user.mustChangePassword) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول." }, { status: 401 });
    }
    if (user.role !== "super_admin") {
      return NextResponse.json({ success: false, message: "لا توجد صلاحية لإنشاء منشأة." }, { status: 403 });
    }

    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    if (!name || name.length > 150) {
      return NextResponse.json({ success: false, message: "اسم المنشأة مطلوب ولا يتجاوز 150 حرفاً." }, { status: 400 });
    }

    try {
      const company = await createDatabaseCompany(name, user);
      return NextResponse.json({ success: true, message: "تم إنشاء المنشأة بنجاح.", data: company });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء المنشأة.";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  });
}
