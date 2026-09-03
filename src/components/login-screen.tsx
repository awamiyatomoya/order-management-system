"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { extractAuthInviteParams, hasInviteAccessTokens } from "@/lib/auth-invite";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createFirstAuthUser, loginWithPassword } from "@/lib/supabase/auth-actions";

export function LoginScreen({ canCreateFirstUser }: { canCreateFirstUser: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewInviteGate = searchParams.get("preview") === "invite";
  const [showLoginForm, setShowLoginForm] = useState(canCreateFirstUser && !previewInviteGate);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const inviteParams = extractAuthInviteParams(search, hash);
    if (inviteParams || hasInviteAccessTokens(hash)) {
      router.replace(`/set-password${search}${hash}`);
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const result = canCreateFirstUser
      ? await createFirstAuthUser(displayName, email, password)
      : await loginWithPassword(email, password);

    setIsSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    const nextPath = searchParams.get("next") || "/";
    router.replace(nextPath);
    router.refresh();
  }

  if ((!canCreateFirstUser || previewInviteGate) && !showLoginForm) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">アカウント招待制です</p>
        <button
          type="button"
          className="mt-20 text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          onClick={() => setShowLoginForm(true)}
        >
          招待済みの方
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{canCreateFirstUser ? "最初のアカウントを作る" : "ログイン"}</CardTitle>
          <CardDescription>
            {canCreateFirstUser
              ? "最初の人は管理者になります。粟宮さんが、自分の名前で作ってください。"
              : "まだパスワードを決めていない人は、招待メールのリンクを開いてください。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {canCreateFirstUser ? (
                <Field>
                  <FieldLabel htmlFor="display-name">名前</FieldLabel>
                  <Input
                    id="display-name"
                    value={displayName}
                    placeholder="例: 山田太郎"
                    autoComplete="name"
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="email">メールアドレス</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="例: taro@example.com"
                  autoComplete="username"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">パスワード</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  placeholder="8文字以上"
                  autoComplete={canCreateFirstUser ? "new-password" : "current-password"}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  isSubmitting ||
                  !email.trim() ||
                  password.length < 8 ||
                  (canCreateFirstUser && !displayName.trim())
                }
              >
                {isSubmitting ? "処理中..." : canCreateFirstUser ? "アカウントを作ってはじめる" : "ログイン"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
