"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export type AuthActionResult = { ok: true } | { ok: false; message: string };

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

  if (!current.isAdmin) {
    return { ok: false, message: "ユーザーの招待は管理者だけができます。" };
  }

  const emailResult = validateAuthEmail(email);
  if (!emailResult.ok) {
    return emailResult;
  }

  if (!hasSupabaseServerEnv()) {
    return { ok: false, message: "招待メールを送れません。" };
  }

  const origin = await getAuthAppOrigin();
  if (!origin) {
    return { ok: false, message: "招待メールの戻り先URLを決められませんでした。" };
  }

  const redirectTo = `${origin}/set-password`;
  const admin = createServerSupabaseClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(emailResult.email, {
    data: { role: "member" },
    redirectTo,
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { ok: false, message: "このメールアドレスはすでに使われています。" };
    }

    return { ok: false, message: `招待メールの送信に失敗しました: ${error.message}` };
  }

  revalidatePath("/users");
  return { ok: true };
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
  if (!current?.isAdmin || !hasSupabaseServerEnv()) {
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

  if (!current.isAdmin) {
    return { ok: false, message: "ユーザーの削除は管理者だけができます。" };
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
    isAdmin,
  };
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
