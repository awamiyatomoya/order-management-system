import { redirect } from "next/navigation";
import { UsersPanel } from "@/components/users-panel";
import { AUTH_PERMISSION_DENIED_MESSAGE, canUseFeature } from "@/lib/auth-permissions";
import { getCurrentAuthUser, listAuthUsers } from "@/lib/supabase/auth-actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const current = await getCurrentAuthUser();
  if (!current) {
    redirect("/login?next=/users");
  }

  if (!canUseFeature(current.permissions, "users", "view")) {
    return (
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8">
        <p className="text-sm text-muted-foreground">
          <a href="/" className="underline underline-offset-2">
            メイン画面に戻る
          </a>
        </p>
        <p className="text-sm">{AUTH_PERMISSION_DENIED_MESSAGE}</p>
      </main>
    );
  }

  const users = await listAuthUsers();

  return <UsersPanel initialUsers={users} currentUser={current} />;
}
