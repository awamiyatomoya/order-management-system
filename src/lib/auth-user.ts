import { MAX_OPERATOR_NAME_LENGTH, normalizeOperatorName } from "@/lib/operator-options";

export type AuthRole = "admin" | "member";

export type AuthUserSummary = {
  id: string;
  email: string;
  displayName: string;
  invited: boolean;
  isAdmin: boolean;
};

const ADMIN_DISPLAY_NAMES = new Set(["粟宮", "粟宮朋哉"]);

export function isAdminDisplayName(value: string) {
  const normalized = normalizeOperatorName(value);
  return ADMIN_DISPLAY_NAMES.has(normalized) || normalized.startsWith("粟宮");
}

export function resolveAuthRole(user: {
  email?: string | null;
  user_metadata?: { display_name?: unknown; role?: unknown };
}): AuthRole {
  if (user.user_metadata?.role === "admin") {
    return "admin";
  }

  if (isAdminDisplayName(resolveAuthDisplayName(user))) {
    return "admin";
  }

  return "member";
}

export function resolveAuthAppOrigin(input: {
  siteUrl?: string;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  vercelUrl?: string;
}) {
  const siteUrl = input.siteUrl?.trim().replace(/\/$/, "");
  if (siteUrl) {
    return siteUrl;
  }

  const host = (input.forwardedHost || input.host || "").split(",")[0]?.trim();
  if (host) {
    const proto = (input.forwardedProto || "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }

  const vercelUrl = input.vercelUrl?.trim().replace(/^https?:\/\//, "");
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "";
}

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
