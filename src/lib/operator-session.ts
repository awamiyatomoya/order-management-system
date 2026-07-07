import { cookies } from "next/headers";
import { normalizeOperatorName } from "./operator-options";

export const OPERATOR_COOKIE_NAME = "oms-operator-name";

export async function getOperatorNameFromSession() {
  const cookieStore = await cookies();
  return normalizeOperatorName(cookieStore.get(OPERATOR_COOKIE_NAME)?.value);
}

export async function requireOperatorName(): Promise<
  { ok: true; operatorName: string } | { ok: false; message: string }
> {
  const operatorName = await getOperatorNameFromSession();

  if (!operatorName) {
    return {
      ok: false,
      message: "担当者が未選択です。担当者入力画面から名前を入力し直してください。",
    };
  }

  return { ok: true, operatorName };
}
