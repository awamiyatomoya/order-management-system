import { redirect } from "next/navigation";
import { UsersPanel } from "@/components/users-panel";
import { getCurrentAuthUser, listAuthUsers } from "@/lib/supabase/auth-actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const current = await getCurrentAuthUser();
  if (!current) {
    redirect("/login?next=/users");
  }

  if (!current.isAdmin) {
    redirect("/");
  }

  const users = await listAuthUsers();

  return <UsersPanel initialUsers={users} currentUserId={current.id} />;
}
