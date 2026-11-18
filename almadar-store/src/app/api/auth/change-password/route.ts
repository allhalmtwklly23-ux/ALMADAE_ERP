import { connection, NextResponse } from "next/server";
import {
  changeUserPassword,
  getSessionTokenFromHeader,
  getSessionUserFromToken,
} from "@/lib/erp/auth-system";
import {
  changeDatabasePassword,
  getDatabaseSessionUser,
  getPersistenceMode,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

export function POST(request: Request) {
  return withDatabaseRequestCompany(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const token = getSessionTokenFromHeader(request.headers.get("cookie"));
    const user = mode === "supabase"
      ? await getDatabaseSessionUser(token)
      : getSessionUserFromToken(token);
    if (!user) {
      return NextResponse.json({ success: false, message: "انتهت الجلسة، يرجى تسجيل الدخول." }, { status: 401 });
    }

    const body = await request.json();
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, message: "أدخل كلمة المرور الحالية والجديدة." }, { status: 400 });
    }

    if (mode === "supabase") {
      await changeDatabasePassword(user.id, currentPassword, newPassword);
    } else {
      changeUserPassword(user.id, currentPassword, newPassword);
    }

    return NextResponse.json({ success: true, message: "تم تغيير كلمة المرور بنجاح." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تغيير كلمة المرور.";
    const status = message.includes("not configured") || message.includes("required.") ? 503 : message.startsWith("Failed to") ? 500 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
