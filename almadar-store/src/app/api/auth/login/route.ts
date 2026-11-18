import { connection, NextResponse } from "next/server";
import {
  authenticateUser,
  createSession,
  DEFAULT_SESSION_TTL_MS,
  REMEMBERED_SESSION_TTL_MS,
  SESSION_COOKIE_NAME,
} from "@/lib/erp/auth-system";
import {
  authenticateDatabaseUser,
  createDatabaseSession,
  getPersistenceMode,
} from "@/lib/erp/database";

export async function POST(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const body = await request.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    const rememberMe = body?.rememberMe === true;

    if (!username || !password) {
      return NextResponse.json({ success: false, message: "اسم المستخدم وكلمة المرور مطلوبان." }, { status: 400 });
    }

    const result = mode === "supabase"
      ? await authenticateDatabaseUser(username, password)
      : authenticateUser(username, password);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: 401 });
    }

    const token = mode === "supabase"
      ? await createDatabaseSession(result.user.id, rememberMe)
      : createSession(result.user.id, rememberMe);
    const response = NextResponse.json({
      success: true,
      message: result.mustChangePassword ? "يجب تغيير كلمة المرور أولاً." : "تم تسجيل الدخول بنجاح.",
      user: result.user,
      mustChangePassword: Boolean(result.mustChangePassword),
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: (rememberMe ? REMEMBERED_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS) / 1000,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل تسجيل الدخول.";
    const status = message.includes("not configured") || message.includes("required.") || message.includes("AUTH_BOOTSTRAP_PASSWORD") ? 503 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
