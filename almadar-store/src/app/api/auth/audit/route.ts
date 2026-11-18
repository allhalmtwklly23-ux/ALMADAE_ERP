import { connection, NextResponse } from "next/server";
import { getSessionTokenFromHeader, getSessionUserFromToken, listAuditLog } from "@/lib/erp/auth-system";
import {
  getDatabaseSessionUser,
  getPersistenceMode,
  listDatabaseAuditLog,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

export function GET(request: Request) {
  return withDatabaseRequestCompany(request, () => handleGet(request));
}

async function handleGet(request: Request) {
  await connection();
  const mode = getPersistenceMode();
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);

  if (!user || user.role !== "super_admin" || user.mustChangePassword) {
    return NextResponse.json({ success: false, message: "غير مصرح." }, { status: 403 });
  }

  const data = mode === "supabase" ? await listDatabaseAuditLog() : listAuditLog();
  return NextResponse.json({ success: true, data });
}
