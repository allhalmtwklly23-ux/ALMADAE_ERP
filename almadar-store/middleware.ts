import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/login" ||
    pathname === "/account" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isAuthenticated = Boolean(request.cookies.get("erp_session")?.value);
  if (!isAuthenticated && pathname !== "/login") {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|api|static|.*\.).*)",
  ],
};
