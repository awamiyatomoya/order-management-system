import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-client";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextPath = "/set-password";

  const supabase = await createAuthServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "recovery" | "signup" | "email" | "email_change" | "magiclink",
    });
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
