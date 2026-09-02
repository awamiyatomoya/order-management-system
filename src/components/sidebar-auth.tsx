"use client";

import { useEffect, useState } from "react";
import { canUseFeature } from "@/lib/auth-permissions";
import { getCurrentAuthUser, logoutAuth } from "@/lib/supabase/auth-actions";

export function SidebarAuth() {
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewUsers, setCanViewUsers] = useState(false);

  useEffect(() => {
    void getCurrentAuthUser().then((user) => {
      setDisplayName(user?.displayName ?? "");
      setIsAdmin(Boolean(user?.isAdmin));
      setCanViewUsers(user ? canUseFeature(user.permissions, "users", "view") : false);
    });
  }, []);

  if (!displayName) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-sidebar-border pt-3">
      <p className="truncate px-2 text-xs text-sidebar-foreground/80" title={displayName}>
        {displayName}
        {isAdmin ? "（管理者）" : ""}
      </p>
      {canViewUsers ? (
        <a
          href="/users"
          className="mt-1 block rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        >
          ユーザー
        </a>
      ) : null}
      <button
        type="button"
        className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        onClick={() => {
          void logoutAuth();
        }}
      >
        ログアウト
      </button>
    </div>
  );
}
