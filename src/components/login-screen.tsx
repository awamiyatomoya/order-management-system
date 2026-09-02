"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{canCreateFirstUser ? "最初のアカウントを作る" : "ログイン"}</CardTitle>
          <CardDescription>
            {canCreateFirstUser
              ? "このシステムの最初の人として、名前・メール・パスワードを登録します。あとから仲間を追加できます。"
              : "登録したメールアドレスとパスワードで入ってください。作業した人の記録にも使います。"}
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
