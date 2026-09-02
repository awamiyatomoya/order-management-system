import { MAX_OPERATOR_NAME_LENGTH, normalizeOperatorName } from "@/lib/operator-options";

export type AuthUserSummary = {
  id: string;
  email: string;
  displayName: string;
};

export function resolveAuthDisplayName(user: {
  email?: string | null;
  user_metadata?: { display_name?: unknown };
}) {
  const named = normalizeOperatorName(String(user.user_metadata?.display_name ?? ""));
  if (named) {
    return named;
  }

  return String(user.email ?? "").trim();
}

export function validateAuthEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, message: "メールアドレスを正しく入力してください。" };
  }

  return { ok: true as const, email };
}

export function validateAuthPassword(value: string) {
  if (value.length < 8) {
    return { ok: false as const, message: "パスワードは8文字以上にしてください。" };
  }

  return { ok: true as const, password: value };
}

export function validateAuthDisplayName(value: string) {
  const displayName = normalizeOperatorName(value);
  if (!displayName) {
    return { ok: false as const, message: "名前を入力してください。" };
  }

  if (displayName.length > MAX_OPERATOR_NAME_LENGTH) {
    return { ok: false as const, message: "名前が長すぎます。" };
  }

  return { ok: true as const, displayName };
}
