import { connection, NextResponse } from "next/server";
import { destroySession, getSessionTokenFromHeader, SESSION_COOKIE_NAME } from "@/lib/erp/auth-system";
import { destroyDatabaseSession, getPersistenceMode } from "@/lib/erp/database";

export async function POST(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const token = getSessionTokenFromHeader(request.headers.get("cookie"));
    if (mode === "supabase") await destroyDatabaseSession(token);
    else destroySession(token);

    const response = NextResponse.json({ success: true, message: "تم تسجيل الخروج بنجاح." });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تسجيل الخروج.";
    return NextResponse.json({ success: false, message }, { status: 503 });
  }
}
