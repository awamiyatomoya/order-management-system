"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { validateOperatorName } from "@/lib/operator-options";
import { OPERATOR_COOKIE_NAME } from "@/lib/operator-session";

export type SetOperatorSessionResult =
  | { ok: true; operatorName: string }
  | { ok: false; message: string };

export async function setOperatorSession(operatorName: string): Promise<SetOperatorSessionResult> {
  const validated = validateOperatorName(operatorName);

  if (!validated.ok) {
    return validated;
  }

  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_COOKIE_NAME, validated.operatorName, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/");

  return {
    ok: true,
    operatorName: validated.operatorName,
  };
}
