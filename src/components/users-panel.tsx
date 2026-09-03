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
import {
  AUTH_FEATURES,
  AUTH_PERMISSION_LEVELS,
  canUseFeature,
  toggleAuthPermissionLevel,
  type AuthFeatureId,
  type AuthPermissionAction,
} from "@/lib/auth-permissions";
import type { AuthUserSummary } from "@/lib/auth-user";
import {
  deleteAuthUser,
  inviteAuthUser,
  listAuthUsers,
  updateAuthUserPermissions,
} from "@/lib/supabase/auth-actions";

export function UsersPanel({
  initialUsers,
  currentUser,
}: {
  initialUsers: AuthUserSummary[];
  currentUser: AuthUserSummary;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savingFeature, setSavingFeature] = useState<AuthFeatureId | null>(null);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const canInvite = canUseFeature(currentUser.permissions, "users", "create");
  const canEditPermissions = canUseFeature(currentUser.permissions, "users", "edit");
  const canDeleteUsers = canUseFeature(currentUser.permissions, "users", "delete");

  async function refreshUsers() {
    setUsers(await listAuthUsers());
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    const result = await inviteAuthUser(email);
    setIsSaving(false);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setEmail("");
    setNotice(
      result.inviteUrl
        ? `このリンクを相手に送ってください。ログイン画面に直接パスワードを入れても、まだ入れません。\n${result.inviteUrl}`
        : "招待メールを送りました。相手はメールのリンクから名前とパスワードを決めます。",
    );
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
      if (selectedUserId === user.id) {
        setSelectedUserId("");
      }
      await refreshUsers();
    }
  }

  async function handlePermissionClick(feature: AuthFeatureId, action: AuthPermissionAction) {
    if (!selectedUser || selectedUser.isAdmin || !canEditPermissions) {
      return;
    }

    const nextLevel = toggleAuthPermissionLevel(selectedUser.permissions[feature], action);
    const nextPermissions = {
      ...selectedUser.permissions,
      [feature]: nextLevel,
    };

    setSavingFeature(feature);
    setNotice("");
    const result = await updateAuthUserPermissions(selectedUser.id, nextPermissions);
    setSavingFeature(null);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === selectedUser.id ? { ...user, permissions: nextPermissions } : user,
      ),
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href="/" className="underline underline-offset-2">
            メイン画面に戻る
          </a>
        </p>
        <h1 className="mt-3 text-2xl font-semibold">ユーザー</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ユーザーを選ぶと、機能ごとに見る・追加・編集・削除をボタンで付けられます。同じボタンをもう一度押すと、その機能は使えなくなります。
        </p>
      </div>

      {canInvite ? (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={handleCreate}>
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
            {notice ? <p className="whitespace-pre-wrap break-all text-sm text-muted-foreground">{notice}</p> : null}
          </CardContent>
        </Card>
      ) : notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}

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
                  <TableRow
                    key={user.id}
                    className={selectedUserId === user.id ? "bg-muted/60" : "cursor-pointer"}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <TableCell>{user.displayName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.isAdmin ? "管理者" : user.invited ? "招待中" : "利用中"}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.id === currentUser.id ? (
                        <span className="text-xs text-muted-foreground">自分</span>
                      ) : user.isAdmin ? (
                        <span className="text-xs text-muted-foreground">管理者</span>
                      ) : canDeleteUsers ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDelete(user);
                          }}
                        >
                          削除
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedUser ? (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <div>
              <h2 className="text-lg font-semibold">{selectedUser.displayName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedUser.isAdmin
                  ? "管理者はすべての操作ができます。"
                  : canEditPermissions
                    ? "付けたい段階のボタンを押してください。"
                    : "権限を見るだけできます。変更はできません。"}
              </p>
            </div>
            <div className="grid gap-3">
              {AUTH_FEATURES.map((feature) => {
                const currentLevel = selectedUser.permissions[feature.id];
                return (
                  <div
                    key={feature.id}
                    className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-center"
                  >
                    <p className="text-sm font-medium">{feature.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {AUTH_PERMISSION_LEVELS.map((level) => {
                        const isActive = currentLevel === level.id;
                        return (
                          <Button
                            key={level.id}
                            type="button"
                            size="sm"
                            variant={isActive ? "default" : "outline"}
                            disabled={
                              selectedUser.isAdmin ||
                              !canEditPermissions ||
                              savingFeature === feature.id
                            }
                            onClick={() => void handlePermissionClick(feature.id, level.id)}
                          >
                            {level.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">権限を付ける人を、上の一覧から選んでください。</p>
      )}
    </main>
  );
}
