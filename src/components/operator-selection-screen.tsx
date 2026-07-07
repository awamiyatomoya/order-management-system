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
import { setOperatorSession } from "@/lib/supabase/operator-actions";

export function OperatorSelectionScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [operatorName, setOperatorName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const result = await setOperatorSession(operatorName);
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
          <CardTitle>担当者入力</CardTitle>
          <CardDescription>
            操作を始める前に担当者名を入力してください。入力内容はブラウザを閉じるまで保持され、取込・チェック・送信・削除の履歴に記録されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="operator-name">担当者名</FieldLabel>
                <Input
                  id="operator-name"
                  className="w-full"
                  value={operatorName}
                  placeholder="例: 山田太郎"
                  autoComplete="name"
                  onChange={(event) => setOperatorName(event.target.value)}
                />
              </Field>
              {errorMessage ? (
                <p className="text-sm text-destructive">{errorMessage}</p>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={!operatorName.trim() || isSubmitting}
              >
                {isSubmitting ? "設定中..." : "はじめる"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
