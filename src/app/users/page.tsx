import { redirect } from "next/navigation";
import { UsersPanel } from "@/components/users-panel";
import { canUseFeature, firstAllowedPath } from "@/lib/auth-permissions";
import { getCurrentAuthUser, listAuthUsers } from "@/lib/supabase/auth-actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const current = await getCurrentAuthUser();
  if (!current) {
    redirect("/login?next=/users");
  }

  if (!canUseFeature(current.permissions, "users", "view")) {
    redirect(firstAllowedPath(current.permissions) || "/");
  }

  const users = await listAuthUsers();

  return <UsersPanel initialUsers={users} currentUser={current} />;
}
