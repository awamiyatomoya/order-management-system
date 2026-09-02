import { getCurrentAuthUser } from "@/lib/supabase/auth-actions";

export const OPERATOR_COOKIE_NAME = "oms-operator-name";

export async function getOperatorNameFromSession() {
  const user = await getCurrentAuthUser();
  return user?.displayName ?? "";
}

export async function requireOperatorName(): Promise<
  { ok: true; operatorName: string } | { ok: false; message: string }
> {
  const user = await getCurrentAuthUser();

  if (!user?.displayName) {
    return {
      ok: false,
      message: "ログインしてください。",
    };
  }

  return { ok: true, operatorName: user.displayName };
}
