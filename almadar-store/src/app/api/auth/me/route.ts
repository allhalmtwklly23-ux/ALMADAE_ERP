import { connection, NextResponse, type NextRequest } from "next/server";
import { getSessionTokenFromHeader, getSessionUserFromToken } from "@/lib/erp/auth-system";
import {
  getDatabaseSessionUser,
  getPersistenceMode,
  listDatabaseCompaniesForUser,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

export function GET(request: NextRequest) {
  return withDatabaseRequestCompany(request, () => handleGet(request));
}

async function handleGet(request: NextRequest) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const token = getSessionTokenFromHeader(request.headers.get("cookie"));
    const user = mode === "supabase"
      ? await getDatabaseSessionUser(token)
      : getSessionUserFromToken(token);

    if (!user) {
      return NextResponse.json({ authenticated: false, error: "unauthorized" }, { status: 401 });
    }

    const companies = mode === "supabase"
      ? await listDatabaseCompaniesForUser(user.id, user.companyId)
      : [];

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        companyId: user.companyId ?? null,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        department: user.department,
        title: user.title,
        email: user.email ?? null,
        permissions: user.permissions ?? [],
        mustChangePassword: user.mustChangePassword,
      },
      companies,
      multiTenantEnabled: mode === "supabase",
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, error: "auth_verification_unavailable" },
      { status: 503 },
    );
  }
}
