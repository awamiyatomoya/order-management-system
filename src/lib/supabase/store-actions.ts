"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Store } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const storeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  aliases: z.array(z.string()),
});

export type SaveStoreResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      store: Store;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveStore(store: Store): Promise<SaveStoreResult> {
  const result = storeSchema.safeParse(store);

  if (!result.success) {
    return {
      ok: false,
      message: "店舗名を入力してください。",
    };
  }

  const normalizedStore: Store = {
    id: result.data.id,
    name: result.data.name,
    aliases: Array.from(
      new Set(result.data.aliases.map((alias) => alias.trim()).filter(Boolean)),
    ),
  };

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      store: normalizedStore,
      message: "Supabase環境変数が未設定のため、画面内だけに店舗マスタを保存しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("stores").upsert(
    {
      id: normalizedStore.id,
      name: normalizedStore.name,
      aliases: normalizedStore.aliases,
    },
    { onConflict: "id" },
  );

  if (error) {
    return {
      ok: false,
      message: `Supabaseへの店舗マスタ保存に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");
  revalidatePath("/stores");

  return {
    ok: true,
    savedToSupabase: true,
    store: normalizedStore,
    message: "Supabaseの店舗マスタに保存しました。",
  };
}
