"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Product } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const productSchema = z.object({
  clientId: z.string().min(1),
  jan: z.string().min(1),
  internalSku: z.string(),
  cooolaCode: z.string().min(1),
  name: z.string().min(1),
  wholesalePrice: z.number().min(0),
  taxRate: z.number().min(0),
  memo: z.string(),
});

export type SaveProductResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveProduct(product: Product): Promise<SaveProductResult> {
  const result = productSchema.safeParse(product);

  if (!result.success) {
    return {
      ok: false,
      message: "商品情報に不足があります。JAN、商品名、COOOLa商品コードを確認してください。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、画面内だけに登録しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("products").upsert(
    {
      client_id: result.data.clientId,
      jan: result.data.jan,
      internal_sku: result.data.internalSku,
      cooola_code: result.data.cooolaCode,
      name: result.data.name,
      wholesale_price: result.data.wholesalePrice,
      tax_rate: result.data.taxRate,
      flags: result.data.memo ? { memo: result.data.memo } : {},
    },
    {
      onConflict: "client_id,jan",
    },
  );

  if (error) {
    return {
      ok: false,
      message: `Supabaseへの商品登録に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "Supabaseの商品マスタに登録しました。",
  };
}
