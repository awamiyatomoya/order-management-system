"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AUTH_PERMISSION_DENIED_MESSAGE,
  canUseFeature,
  createMemberAuthPermissions,
  isAuthFeatureId,
  isAuthPermissionLevel,
  resolveAuthPermissions,
  type AuthFeatureId,
  type AuthPermissionAction,
  type AuthPermissions,
} from "@/lib/auth-permissions";
import {
  resolveAuthAppOrigin,
  resolveAuthDisplayName,
  resolveAuthRole,
  validateAuthDisplayName,
  validateAuthEmail,
  validateAuthPassword,
  type AuthUserSummary,
} from "@/lib/auth-user";
import type { User } from "@supabase/supabase-js";
import { createAuthServerClient } from "@/lib/supabase/auth-client";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export type AuthActionResult = { ok: true; inviteUrl?: string } | { ok: false; message: string };

export async function getCurrentAuthUser(): Promise<AuthUserSummary | null> {
  if (!hasSupabaseServerEnv() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return await toAuthUserSummary(data.user);
}

export async function hasAnyAuthUser() {
  if (!hasSupabaseServerEnv()) {
    return false;
  }

  const admin = createServerSupabaseClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    return false;
  }

  return (data.users?.length ?? 0) > 0;
}

export async function loginWithPassword(email: string, password: string): Promise<AuthActionResult> {
  const emailResult = validateAuthEmail(email);
  if (!emailResult.ok) {
    return emailResult;
  }

  const passwordResult = validateAuthPassword(password);
  if (!passwordResult.ok) {
    return passwordResult;
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailResult.email,
    password: passwordResult.password,
  });

  if (error) {
    if (await isIncompleteInviteUser(emailResult.email)) {
      return {
        ok: false,
        message: "招待メールのリンクから、名前とパスワードを設定してください。",
      };
    }

    return { ok: false, message: "メールアドレスまたはパスワードが違います。" };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function createFirstAuthUser(
  displayName: string,
  email: string,
  password: string,
): Promise<AuthActionResult> {
  if (await hasAnyAuthUser()) {
    return { ok: false, message: "すでにアカウントがあります。ログインしてください。" };
  }

  return createAuthUserRecord(displayName, email, password, { signIn: true });
}

export async function inviteAuthUser(email: string): Promise<AuthActionResult> {
  const current = await getCurrentAuthUser();
  if (!current) {
    return { ok: false, message: "ログインしてください。" };
  }

  if (!canUseFeature(current.permissions, "users", "create")) {
    return { ok: false, message: AUTH_PERMISSION_DENIED_MESSAGE };
  }

  const emailResult = validateAuthEmail(email);
  if (!emailResult.ok) {
    return emailResult;
  }

  if (!hasSupabaseServerEnv()) {
    return { ok: false, message: "招待リンクを作れません。" };
  }

  const origin = await getAuthAppOrigin();
  if (!origin) {
    return { ok: false, message: "招待メールの戻り先URLを決められませんでした。" };
  }

  const admin = createServerSupabaseClient();
  const existing = await findAuthUserByEmail(admin, emailResult.email);
  if (existing && String(existing.user_metadata?.display_name ?? "").trim()) {
    return { ok: false, message: "このメールアドレスはすでに使われています。" };
  }

  const inviteUrl = await createInviteCallbackUrl(
    admin,
    emailResult.email,
    origin,
    Boolean(existing?.email_confirmed_at),
  );
  if (!inviteUrl) {
    return { ok: false, message: "招待リンクを作れませんでした。少し待ってからもう一度試してください。" };
  }

  revalidatePath("/users");
  return { ok: true, inviteUrl };
}

export async function completeInvitedProfile(
  displayName: string,
  password: string,
): Promise<AuthActionResult> {
  const nameResult = validateAuthDisplayName(displayName);
  if (!nameResult.ok) {
    return nameResult;
  }

  const passwordResult = validateAuthPassword(password);
  if (!passwordResult.ok) {
    return passwordResult;
  }

  const supabase = await createAuthServerClient();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return { ok: false, message: "招待リンクの有効期限が切れているか、無効です。もう一度招待してもらってください。" };
  }

  const { error } = await supabase.auth.updateUser({
    password: passwordResult.password,
    data: {
      display_name: nameResult.displayName,
      role: resolveAuthRole({
        email: data.user.email,
        user_metadata: { display_name: nameResult.displayName },
      }),
      permissions: resolveAuthPermissions(data.user.user_metadata?.permissions),
    },
  });
  if (error) {
    return { ok: false, message: `登録に失敗しました: ${error.message}` };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function listAuthUsers(): Promise<AuthUserSummary[]> {
  const current = await getCurrentAuthUser();
  if (!current || !canUseFeature(current.permissions, "users", "view") || !hasSupabaseServerEnv()) {
    return [];
  }

  const admin = createServerSupabaseClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) {
    return [];
  }

  return Promise.all(data.users.map((user) => toAuthUserSummary(user)));
}

export async function deleteAuthUser(userId: string): Promise<AuthActionResult> {
  const current = await getCurrentAuthUser();
  if (!current) {
    return { ok: false, message: "ログインしてください。" };
  }

  if (!canUseFeature(current.permissions, "users", "delete")) {
    return { ok: false, message: AUTH_PERMISSION_DENIED_MESSAGE };
  }

  if (current.id === userId) {
    return { ok: false, message: "自分のアカウントは削除できません。" };
  }

  const admin = createServerSupabaseClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user) {
    return { ok: false, message: "削除するユーザーが見つかりません。" };
  }

  if (resolveAuthRole(target.user) === "admin") {
    return { ok: false, message: "管理者は削除できません。" };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { ok: false, message: `ユーザーの削除に失敗しました: ${error.message}` };
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function updateAuthUserPermissions(
  userId: string,
  permissions: AuthPermissions,
): Promise<AuthActionResult> {
  const current = await getCurrentAuthUser();
  if (!current) {
    return { ok: false, message: "ログインしてください。" };
  }

  if (!canUseFeature(current.permissions, "users", "edit")) {
    return { ok: false, message: AUTH_PERMISSION_DENIED_MESSAGE };
  }

  if (!hasSupabaseServerEnv()) {
    return { ok: false, message: "権限を保存できません。" };
  }

  const admin = createServerSupabaseClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user) {
    return { ok: false, message: "ユーザーが見つかりません。" };
  }

  if (resolveAuthRole(target.user) === "admin") {
    return { ok: false, message: "管理者の権限は変更できません。" };
  }

  const nextPermissions = resolveAuthPermissions(permissions);
  for (const [feature, level] of Object.entries(nextPermissions)) {
    if (!isAuthFeatureId(feature) || !isAuthPermissionLevel(level)) {
      return { ok: false, message: "権限の内容が正しくありません。" };
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...target.user.user_metadata,
      permissions: nextPermissions,
    },
  });

  if (error) {
    return { ok: false, message: `権限の保存に失敗しました: ${error.message}` };
  }

  revalidatePath("/users");
  revalidatePath("/");
  return { ok: true };
}

export async function requirePermission(
  feature: AuthFeatureId,
  action: AuthPermissionAction,
): Promise<{ ok: true; user: AuthUserSummary } | { ok: false; message: string }> {
  const user = await getCurrentAuthUser();
  if (!user) {
    return { ok: false, message: "ログインしてください。" };
  }

  if (!canUseFeature(user.permissions, feature, action)) {
    return { ok: false, message: AUTH_PERMISSION_DENIED_MESSAGE };
  }

  return { ok: true, user };
}

export async function logoutAuth() {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
  redirect("/login");
}

async function createAuthUserRecord(
  displayName: string,
  email: string,
  password: string,
  options: { signIn: boolean },
): Promise<AuthActionResult> {
  const nameResult = validateAuthDisplayName(displayName);
  if (!nameResult.ok) {
    return nameResult;
  }

  const emailResult = validateAuthEmail(email);
  if (!emailResult.ok) {
    return emailResult;
  }

  const passwordResult = validateAuthPassword(password);
  if (!passwordResult.ok) {
    return passwordResult;
  }

  if (!hasSupabaseServerEnv()) {
    return { ok: false, message: "ユーザーを作成できません。" };
  }

  const admin = createServerSupabaseClient();
  const { error } = await admin.auth.admin.createUser({
    email: emailResult.email,
    password: passwordResult.password,
    email_confirm: true,
    user_metadata: { display_name: nameResult.displayName, role: "admin" },
  });

  if (error) {
    if (/already/.test(error.message)) {
      return { ok: false, message: "このメールアドレスはすでに使われています。" };
    }

    return { ok: false, message: `アカウントの作成に失敗しました: ${error.message}` };
  }

  if (options.signIn) {
    const supabase = await createAuthServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailResult.email,
      password: passwordResult.password,
    });
    if (signInError) {
      return { ok: false, message: "アカウントは作りましたが、ログインに失敗しました。" };
    }
  }

  revalidatePath("/");
  revalidatePath("/users");
  return { ok: true };
}

async function toAuthUserSummary(user: User): Promise<AuthUserSummary> {
  const displayName = resolveAuthDisplayName(user);
  const isAdmin = resolveAuthRole(user) === "admin";

  if (isAdmin && user.user_metadata?.role !== "admin" && hasSupabaseServerEnv()) {
    await createServerSupabaseClient().auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: "admin" },
    });
  }

  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
    invited: !user.email_confirmed_at,
    needsSetup: !String(user.user_metadata?.display_name ?? "").trim(),
    isAdmin,
    permissions: resolveAuthPermissions(user.user_metadata?.permissions, { isAdmin }),
  };
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createServerSupabaseClient>,
  email: string,
) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) {
    return null;
  }

  return data.users.find((item) => (item.email ?? "").toLowerCase() === email) ?? null;
}

async function createInviteCallbackUrl(
  admin: ReturnType<typeof createServerSupabaseClient>,
  email: string,
  origin: string,
  preferRecovery: boolean,
) {
  const firstType = preferRecovery ? "recovery" : "invite";
  const firstUrl = await generateInviteOrRecoveryUrl(admin, email, origin, firstType);
  if (firstUrl) {
    return firstUrl;
  }

  return generateInviteOrRecoveryUrl(
    admin,
    email,
    origin,
    preferRecovery ? "invite" : "recovery",
  );
}

async function generateInviteOrRecoveryUrl(
  admin: ReturnType<typeof createServerSupabaseClient>,
  email: string,
  origin: string,
  type: "invite" | "recovery",
) {
  const redirectTo = `${origin}/set-password`;
  const result =
    type === "recovery"
      ? await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        })
      : await admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            redirectTo,
            data: { role: "member", permissions: createMemberAuthPermissions() },
          },
        });

  const tokenHash = result.data?.properties?.hashed_token;
  if (result.error || !tokenHash) {
    return "";
  }

  return `${origin}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
}

async function isIncompleteInviteUser(email: string) {
  if (!hasSupabaseServerEnv()) {
    return false;
  }

  const admin = createServerSupabaseClient();
  const user = await findAuthUserByEmail(admin, email);
  return Boolean(user && !String(user.user_metadata?.display_name ?? "").trim());
}

async function getAuthAppOrigin() {
  const headerStore = await headers();
  return resolveAuthAppOrigin({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    forwardedProto: headerStore.get("x-forwarded-proto"),
    forwardedHost: headerStore.get("x-forwarded-host"),
    host: headerStore.get("host"),
    vercelUrl: process.env.VERCEL_URL,
  });
}
