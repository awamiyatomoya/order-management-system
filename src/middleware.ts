import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthCallbackSearch, extractAuthInviteParams } from "@/lib/auth-invite";

function isPublicPath(pathname: string) {
  if (
    pathname === "/login" ||
    pathname === "/operator" ||
    pathname === "/set-password" ||
    pathname.startsWith("/auth/")
  ) {
    return true;
  }

  if (
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname === "/share" ||
    pathname.startsWith("/share/")
  ) {
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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const inviteParams = extractAuthInviteParams(search);
  if (inviteParams && pathname !== "/auth/callback") {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    callbackUrl.search = buildAuthCallbackSearch(inviteParams);
    return NextResponse.redirect(callbackUrl);
  }

  if (pathname === "/operator") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = search;
    return NextResponse.redirect(loginUrl);
  }

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && user) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }

    return response;
  }

  if (user) {
    return response;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
