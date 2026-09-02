"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { completeInvitedPassword } from "@/lib/supabase/auth-actions";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";

export function SetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void prepareSession().then((ok) => {
      setIsReady(ok);
      if (!ok) {
        setErrorMessage("招待リンクの有効期限が切れているか、無効です。もう一度招待してもらってください。");
      }
    });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordConfirm) {
      setErrorMessage("パスワードが一致しません。");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    const result = await completeInvitedPassword(password);
    setIsSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>パスワードを設定</CardTitle>
          <CardDescription>招待メールのリンクから来た人だけが、ここで自分のパスワードを決めます。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-password">パスワード</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  placeholder="8文字以上"
                  autoComplete="new-password"
                  disabled={!isReady}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password-confirm">パスワード（確認）</FieldLabel>
                <Input
                  id="new-password-confirm"
                  type="password"
                  value={passwordConfirm}
                  placeholder="もう一度入力"
                  autoComplete="new-password"
                  disabled={!isReady}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                />
              </Field>
              {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
              <Button
                type="submit"
                className="w-full"
                disabled={!isReady || isSubmitting || password.length < 8}
              >
                {isSubmitting ? "設定中..." : "設定してはじめる"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

async function prepareSession() {
  const supabase = createAuthBrowserClient();
  const existing = await supabase.auth.getUser();
  if (existing.data.user) {
    return true;
  }

  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return !error;
  }

  const query = new URLSearchParams(window.location.search);
  const tokenHash = query.get("token_hash");
  const type = query.get("type");
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "recovery" | "signup" | "email",
    });
    return !error;
  }

  return false;
}
