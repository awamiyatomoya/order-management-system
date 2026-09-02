import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/login-screen";
import { hasAnyAuthUser } from "@/lib/supabase/auth-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "招待制",
  description: "アカウント招待制です",
};

export default async function LoginPage() {
  const canCreateFirstUser = !(await hasAnyAuthUser());

  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <LoginScreen canCreateFirstUser={canCreateFirstUser} />
    </Suspense>
  );
}
