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
  AUTH_PERMISSION_CHOICES,
  canUseFeature,
  type AuthFeatureId,
  type AuthPermissionLevel,
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

  async function handleResend(user: AuthUserSummary) {
    setIsSaving(true);
    setNotice("");
    const result = await inviteAuthUser(user.email);
    setIsSaving(false);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setNotice(
      result.inviteUrl
        ? `新しいリンクです。これを相手に送ってください。\n${result.inviteUrl}`
        : "招待リンクを作りました。",
    );
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

  async function handlePermissionChange(feature: AuthFeatureId, nextLevel: AuthPermissionLevel) {
    if (!selectedUser || selectedUser.isAdmin || !canEditPermissions) {
      return;
    }

    if (selectedUser.permissions[feature] === nextLevel) {
      return;
    }

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
          「権限を編集」を押すと、機能ごとに権限を選べます。「なし」にすると、その画面は見えません。
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
                  {isSaving ? "作成中..." : "招待リンクを作る"}
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
                    className={selectedUserId === user.id ? "bg-muted/60" : undefined}
                  >
                    <TableCell>{user.displayName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.isAdmin ? "管理者" : user.invited ? "招待中" : "利用中"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canInvite && !user.isAdmin && user.needsSetup ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => {
                              void handleResend(user);
                            }}
                          >
                            リンクを再発行
                          </Button>
                        ) : null}
                        {!user.isAdmin ? (
                          <Button
                            type="button"
                            variant={selectedUserId === user.id ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              setSelectedUserId((current) => (current === user.id ? "" : user.id))
                            }
                          >
                            権限を編集
                          </Button>
                        ) : null}
                        {user.id === currentUser.id ? (
                          <span className="text-xs text-muted-foreground">自分</span>
                        ) : user.isAdmin ? (
                          <span className="text-xs text-muted-foreground">管理者</span>
                        ) : canDeleteUsers ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void handleDelete(user);
                            }}
                          >
                            削除
                          </Button>
                        ) : null}
                      </div>
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
                    ? "丸を選んでください。「なし」はその画面を見せません。"
                    : "権限を見るだけできます。変更はできません。"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[6rem]">機能</TableHead>
                    {AUTH_PERMISSION_CHOICES.map((choice) => (
                      <TableHead key={choice.id} className="text-center">
                        {choice.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {AUTH_FEATURES.map((feature) => {
                    const currentLevel = selectedUser.permissions[feature.id];
                    const isBusy = savingFeature === feature.id;
                    const disabled =
                      selectedUser.isAdmin || !canEditPermissions || isBusy;
                    return (
                      <TableRow key={feature.id}>
                        <TableCell className="font-medium">{feature.label}</TableCell>
                        {AUTH_PERMISSION_CHOICES.map((choice) => (
                          <TableCell key={choice.id} className="text-center">
                            <label className="inline-flex cursor-pointer items-center justify-center">
                              <input
                                type="radio"
                                className="size-5 accent-foreground"
                                name={`permission-${feature.id}`}
                                value={choice.id}
                                checked={currentLevel === choice.id}
                                disabled={disabled}
                                onChange={() =>
                                  void handlePermissionChange(feature.id, choice.id)
                                }
                              />
                              <span className="sr-only">
                                {feature.label}を{choice.label}
                              </span>
                            </label>
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">権限を変える人の「権限を編集」を押してください。</p>
      )}
    </main>
  );
}
