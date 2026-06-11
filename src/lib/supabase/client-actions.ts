"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Client, Supplier } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const clientNameSchema = z.string().trim().min(1);
const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  fbpFeeRate: z.number().min(0),
});
const defaultSupplierName = "サンプル卸";
const defaultSupplierMappingKey = "sample-cosme-wholesale";

export type SaveClientResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      client: Client;
      supplier: Supplier;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type UpdateClientResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      client: Client;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveClient(name: string): Promise<SaveClientResult> {
  const result = clientNameSchema.safeParse(name);

  if (!result.success) {
    return {
      ok: false,
      message: "クライアント名を入力してください。",
    };
  }

  const client: Client = {
    id: crypto.randomUUID(),
    name: result.data,
    fbpFeeRate: 0.08,
  };
  const supplier: Supplier = {
    id: crypto.randomUUID(),
    clientId: client.id,
    name: defaultSupplierName,
    mappingKey: defaultSupplierMappingKey,
  };

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      client,
      supplier,
      message: "Supabase環境変数が未設定のため、画面内だけにクライアントを追加しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error: clientError } = await supabase.from("clients").insert({
    id: client.id,
    name: client.name,
  });

  if (clientError) {
    return {
      ok: false,
      message: `Supabaseへのクライアント登録に失敗しました: ${clientError.message}`,
    };
  }

  const { error: supplierError } = await supabase.from("suppliers").insert({
    id: supplier.id,
    client_id: supplier.clientId,
    name: supplier.name,
    mapping_key: supplier.mappingKey,
  });

  if (supplierError) {
    return {
      ok: false,
      message: `クライアントは登録しましたが、標準卸先の登録に失敗しました: ${supplierError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    client,
    supplier,
    message: "Supabaseにクライアントと標準卸先を登録しました。",
  };
}

export async function updateClient(params: {
  id: string;
  name: string;
  fbpFeeRate: number;
}): Promise<UpdateClientResult> {
  const result = updateClientSchema.safeParse(params);

  if (!result.success) {
    return {
      ok: false,
      message: "クライアント名とFBP手数料率を確認してください。",
    };
  }

  const client: Client = {
    id: result.data.id,
    name: result.data.name,
    fbpFeeRate: result.data.fbpFeeRate,
  };

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      client,
      message: "Supabase環境変数が未設定のため、画面内だけでクライアント情報を更新しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: client.name,
      fbp_fee_rate: client.fbpFeeRate,
    })
    .eq("id", client.id);

  if (error) {
    if (error.message.includes("fbp_fee_rate")) {
      return {
        ok: false,
        message:
          "SupabaseにFBP手数料率のカラムがまだ反映されていません。マイグレーションを適用してから保存してください。",
      };
    }

    return {
      ok: false,
      message: `Supabaseへのクライアント更新に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    client,
    message: "Supabaseのクライアント情報を更新しました。",
  };
}
