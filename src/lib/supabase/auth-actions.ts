"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  resolveAuthDisplayName,
  validateAuthDisplayName,
  validateAuthEmail,
  validateAuthPassword,
  type AuthUserSummary,
} from "@/lib/auth-user";
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

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    displayName: resolveAuthDisplayName(data.user),
  };
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

export async function createAuthUser(
  displayName: string,
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const current = await getCurrentAuthUser();
  if (!current) {
    return { ok: false, message: "ログインしてください。" };
  }

  return createAuthUserRecord(displayName, email, password, { signIn: false });
}

export async function listAuthUsers(): Promise<AuthUserSummary[]> {
  const current = await getCurrentAuthUser();
  if (!current || !hasSupabaseServerEnv()) {
    return [];
  }

  const admin = createServerSupabaseClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) {
    return [];
  }

  return data.users.map((user) => ({
    id: user.id,
    email: user.email ?? "",
    displayName: resolveAuthDisplayName(user),
  }));
}

export async function deleteAuthUser(userId: string): Promise<AuthActionResult> {
  const current = await getCurrentAuthUser();
  if (!current) {
    return { ok: false, message: "ログインしてください。" };
  }

  if (current.id === userId) {
    return { ok: false, message: "自分のアカウントは削除できません。" };
  }

  const admin = createServerSupabaseClient();
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
    user_metadata: { display_name: nameResult.displayName },
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
