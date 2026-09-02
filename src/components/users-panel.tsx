"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuthUserSummary } from "@/lib/auth-user";
import { deleteAuthUser, inviteAuthUser, listAuthUsers } from "@/lib/supabase/auth-actions";

export function UsersPanel({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AuthUserSummary[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function refreshUsers() {
    setUsers(await listAuthUsers());
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    const result = await inviteAuthUser(displayName, email);
    setIsSaving(false);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setDisplayName("");
    setEmail("");
    setNotice("招待メールを送りました。相手がリンクから自分でパスワードを設定します。");
    await refreshUsers();
  }

  async function handleDelete(user: AuthUserSummary) {
    const confirmed = window.confirm(`${user.displayName}（${user.email}）を削除します。よろしいですか？`);
    if (!confirmed) {
      return;
    }

    const result = await deleteAuthUser(user.id);
    setNotice(result.ok ? "削除しました。" : result.message);
    if (result.ok) {
      await refreshUsers();
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href="/" className="underline underline-offset-2">
            メイン画面に戻る
          </a>
        </p>
        <h1 className="mt-3 text-2xl font-semibold">ユーザー</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          名前とメールを入れて招待します。相手がメールのリンクから、自分でパスワードを決めます。
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <Field>
              <FieldLabel htmlFor="new-name">名前</FieldLabel>
              <Input
                id="new-name"
                value={displayName}
                placeholder="例: 山田太郎"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-email">メールアドレス</FieldLabel>
              <Input
                id="new-email"
                type="email"
                value={email}
                placeholder="例: taro@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "送信中..." : "招待メールを送る"}
              </Button>
            </div>
          </form>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">ユーザーがいません。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.displayName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.invited ? "招待中" : "利用中"}</TableCell>
                    <TableCell className="text-right">
                      {user.id === currentUserId ? (
                        <span className="text-xs text-muted-foreground">自分</span>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(user)}>
                          削除
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
