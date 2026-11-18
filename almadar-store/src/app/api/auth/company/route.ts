import { connection, NextResponse } from "next/server";
import { getSessionTokenFromHeader } from "@/lib/erp/auth-system";
import {
  getDatabaseSessionUser,
  getPersistenceMode,
  switchDatabaseSessionCompany,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

export function POST(request: Request) {
  return withDatabaseRequestCompany(request, async () => {
    await connection();
    if (getPersistenceMode() !== "supabase") {
      return NextResponse.json(
        { success: false, message: "تبديل المنشأة يتطلب قاعدة بيانات Supabase." },
        { status: 409 },
      );
    }

    const token = getSessionTokenFromHeader(request.headers.get("cookie"));
    const user = await getDatabaseSessionUser(token);
    if (!user || !token) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول." }, { status: 401 });
    }

    const body = await request.json();
    const targetCompanyId = String(body?.companyId ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetCompanyId)) {
      return NextResponse.json({ success: false, message: "معرف المنشأة غير صالح." }, { status: 400 });
    }

    try {
      const company = await switchDatabaseSessionCompany(token, user.id, targetCompanyId);
      return NextResponse.json({ success: true, data: company });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تبديل المنشأة.";
      const status = message === "unauthorized" ? 401 : message.includes("do not have access") ? 403 : 500;
      const responseMessage = message.includes("do not have access")
        ? "لا تملك صلاحية الوصول إلى هذه المنشأة."
        : status === 401
          ? "انتهت الجلسة، يرجى تسجيل الدخول."
          : message;
      return NextResponse.json({ success: false, message: responseMessage }, { status });
    }
  });
}
