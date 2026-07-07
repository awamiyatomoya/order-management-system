import { NextResponse, type NextRequest } from "next/server";
import { OPERATOR_COOKIE_NAME } from "@/lib/operator-session";
import { normalizeOperatorName } from "@/lib/operator-options";

function isPublicPath(pathname: string) {
  if (pathname === "/operator") {
    return true;
  }

  if (pathname.startsWith("/api/")) {
    return true;
  }

  if (pathname.startsWith("/_next/")) {
    return true;
  }

  if (pathname === "/favicon.ico") {
    return true;
  }

  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const operatorName = normalizeOperatorName(request.cookies.get(OPERATOR_COOKIE_NAME)?.value);
  if (operatorName) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/operator";
  redirectUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
