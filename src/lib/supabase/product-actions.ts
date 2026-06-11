"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { productMasterExtraFields } from "@/lib/product-master-fields";
import type { Product } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const productSchema = z.object({
  clientId: z.string().min(1),
  jan: z.string().min(1),
  internalSku: z.string(),
  cooolaCode: z.string(),
  name: z.string().min(1),
  wholesalePrice: z.number().min(0),
  taxRate: z.number().min(0),
  retailPrice: z.number().min(0).nullable(),
  payoutRate: z.number().gt(0.08).nullable(),
  memo: z.string(),
}).passthrough();

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
      message: "商品情報に不足があります。JAN、商品名、下代（税抜）を確認してください。",
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
  const extraPayload = Object.fromEntries(
    productMasterExtraFields.map((field) => [
      field.column,
      normalizeProductMasterColumnValue(product[field.key], field.type),
    ]),
  );
  const basePayload = {
    client_id: result.data.clientId,
    jan: result.data.jan,
    internal_sku: result.data.internalSku,
    cooola_code: result.data.cooolaCode,
    name: result.data.name,
    wholesale_price: result.data.wholesalePrice,
    tax_rate: result.data.taxRate,
    retail_price: result.data.retailPrice,
    payout_rate: result.data.payoutRate,
    flags: result.data.memo ? { memo: result.data.memo } : {},
  };
  let savedExtraFields = true;
  let { error } = await supabase.from("products").upsert(
    { ...basePayload, ...extraPayload },
    {
      onConflict: "client_id,jan",
    },
  );

  if (error && isMissingProductMasterExtraColumnError(error.message)) {
    savedExtraFields = false;
    const retryResult = await supabase.from("products").upsert(basePayload, {
      onConflict: "client_id,jan",
    });
    error = retryResult.error;
  }

  if (error) {
    if (error.message.includes("retail_price") || error.message.includes("payout_rate")) {
      return {
        ok: false,
        message:
          "Supabaseに振込計算用のカラムがまだ反映されていません。マイグレーションを適用してから、上代（税抜）と掛け率を保存してください。",
      };
    }

    return {
      ok: false,
      message: `Supabaseへの商品登録に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: savedExtraFields
      ? "Supabaseの商品マスタに登録しました。"
      : "Supabaseの商品マスタに登録しました。追加項目を保存するには商品マスタ拡張マイグレーションを適用してください。",
  };
}

function isMissingProductMasterExtraColumnError(message: string) {
  return productMasterExtraFields.some((field) => message.includes(field.column));
}

function normalizeProductMasterColumnValue(
  value: string | number | null | undefined,
  type: "text" | "number",
) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (type === "number") {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return String(value);
}

export async function deleteProduct(params: {
  clientId: string;
  jan: string;
}): Promise<SaveProductResult> {
  if (!params.clientId || !params.jan) {
    return {
      ok: false,
      message: "商品削除に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、画面内だけで削除しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("client_id", params.clientId)
    .eq("jan", params.jan);

  if (error) {
    if (error.message.includes("order_lines_client_id_jan_fkey")) {
      return {
        ok: false,
        message: "この商品は受注明細で使用されているため削除できません。商品名や下代（税抜）の編集はできます。",
      };
    }

    return {
      ok: false,
      message: `Supabaseの商品削除に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "Supabaseの商品マスタから削除しました。",
  };
}
