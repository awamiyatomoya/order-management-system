"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Supplier } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const supplierSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1),
  mappingKey: z.string().min(1),
});

export type SaveSupplierResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      supplier: Supplier;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveSupplier(params: {
  clientId: string;
  name: string;
  mappingKey: string;
}): Promise<SaveSupplierResult> {
  const result = supplierSchema.safeParse(params);

  if (!result.success) {
    return {
      ok: false,
      message: "卸先名を入力してください。",
    };
  }

  const supplierId = crypto.randomUUID();
  const supplier: Supplier = {
    id: supplierId,
    clientId: result.data.clientId,
    name: result.data.name,
    mappingKey: `${result.data.mappingKey}:${supplierId}`,
  };

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      supplier,
      message: "Supabase環境変数が未設定のため、画面内だけに卸先を追加しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("suppliers").insert({
    id: supplier.id,
    client_id: supplier.clientId,
    name: supplier.name,
    mapping_key: supplier.mappingKey,
  });

  if (error) {
    return {
      ok: false,
      message: `Supabaseへの卸先登録に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    supplier,
    message: "Supabaseに卸先を登録しました。",
  };
}
