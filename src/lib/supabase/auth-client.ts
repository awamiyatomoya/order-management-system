import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getAuthEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are not set.");
  }

  return { url, anonKey };
}

export async function createAuthServerClient() {
  const { url, anonKey } = getAuthEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // 画面表示中はCookieを書けない。更新はmiddleware側で行う。
        }
      },
    },
  });
}
