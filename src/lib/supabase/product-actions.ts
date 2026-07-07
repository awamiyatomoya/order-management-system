"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeProductImageForUpload } from "@/lib/normalize-product-image";
import { calculatePayoutRateFromPrices } from "@/lib/payout-rate";
import { productMasterExtraFields } from "@/lib/product-master-fields";
import type { Product } from "@/lib/types";
import { mapProduct, productSelectColumns, type ProductRow, attachProductImageUrls } from "./read-order-data";
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

export type UploadProductImageResult =
  | {
      ok: true;
      path: string;
      url?: string;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type FetchProductsResult =
  | {
      ok: true;
      products: Product[];
      totalCount: number;
    }
  | {
      ok: false;
      products: Product[];
      totalCount: number;
      message: string;
    };

export async function fetchProductMasterProducts({
  clientId,
  search,
  page,
  pageSize,
}: {
  clientId: string;
  search: string;
  page: number;
  pageSize: number;
}): Promise<FetchProductsResult> {
  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      products: [],
      totalCount: 0,
      message: "Supabase環境変数が未設定のため、商品マスタを読み込めません。",
    };
  }

  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 200);
  const normalizedPage = Math.max(page, 0);
  const from = normalizedPage * normalizedPageSize;
  const to = from + normalizedPageSize - 1;
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("products")
    .select(productSelectColumns, { count: "exact" })
    .order("name")
    .range(from, to);

  if (clientId !== "all") {
    query = query.eq("client_id", clientId);
  }

  const keyword = search.trim();
  if (keyword) {
    const pattern = `%${keyword.replaceAll("%", "").replaceAll(",", " ")}%`;
    const textColumns = [
      "jan",
      "name",
      "internal_sku",
      "cooola_code",
      ...productMasterExtraFields
        .filter((field) => field.type === "text")
        .map((field) => field.column),
    ];
    query = query.or(textColumns.map((column) => `${column}.ilike.${pattern}`).join(","));
  }

  const { data, error, count } = await query;

  if (error) {
    return {
      ok: false,
      products: [],
      totalCount: 0,
      message: `商品マスタの読み込みに失敗しました: ${error.message}`,
    };
  }

  return {
    ok: true,
    products: await attachProductImageUrls(
      ((data ?? []) as unknown as ProductRow[]).map(mapProduct),
    ),
    totalCount: count ?? 0,
  };
}

export async function fetchProductsForProductMasterImport(clientId: string): Promise<FetchProductsResult> {
  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      products: [],
      totalCount: 0,
      message: "Supabase環境変数が未設定のため、既存の商品マスタを読み込めません。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error, count } = await supabase
    .from("products")
    .select(productSelectColumns, { count: "exact" })
    .eq("client_id", clientId)
    .order("name");

  if (error) {
    return {
      ok: false,
      products: [],
      totalCount: 0,
      message: `既存の商品マスタの読み込みに失敗しました: ${error.message}`,
    };
  }

  return {
    ok: true,
    products: await attachProductImageUrls(
      ((data ?? []) as unknown as ProductRow[]).map(mapProduct),
    ),
    totalCount: count ?? 0,
  };
}

export async function uploadProductImage(formData: FormData): Promise<UploadProductImageResult> {
  const clientId = String(formData.get("clientId") ?? "");
  const jan = String(formData.get("jan") ?? "").trim();
  const file = formData.get("file");

  if (!clientId || !(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      message: "商品画像の保存に必要な情報が不足しています。",
    };
  }

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((extension) =>
    lowerName.endsWith(extension),
  );

  if (!allowedTypes.has(file.type) && !hasAllowedExtension) {
    return {
      ok: false,
      message: "JPEG、PNG、WebP、GIF形式の画像だけ登録できます。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: "Supabase環境変数が未設定のため、商品画像を保存できません。",
    };
  }

  const supabase = createServerSupabaseClient();
  let processedImage: Buffer;

  try {
    processedImage = await normalizeProductImageForUpload(file);
  } catch {
    return {
      ok: false,
      message: "画像の処理に失敗しました。別の画像をお試しください。",
    };
  }

  const fileName = sanitizeProductImageFileName(file.name);
  const folder = jan || "draft";
  const path = `${clientId}/${folder}/${crypto.randomUUID()}-${fileName}`;
  const { error } = await supabase.storage.from("product-images").upload(path, processedImage, {
    contentType: "image/jpeg",
    upsert: false,
  });

  if (error) {
    return {
      ok: false,
      message: `商品画像の保存に失敗しました: ${error.message}`,
    };
  }

  const { data: signedUrlData } = await supabase.storage
    .from("product-images")
    .createSignedUrl(path, 60 * 60);

  return {
    ok: true,
    path,
    url: signedUrlData?.signedUrl,
    message: "商品画像を保存しました。",
  };
}

export async function saveProduct(
  product: Product,
  options?: { previousJan?: string },
): Promise<SaveProductResult> {
  const productWithPayoutRate: Product = {
    ...product,
    payoutRate: calculatePayoutRateFromPrices(product.wholesalePrice, product.retailPrice),
  };
  const result = productSchema.safeParse(productWithPayoutRate);

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
  const previousJan = options?.previousJan?.trim();
  const janChanged = Boolean(previousJan && previousJan !== result.data.jan);

  if (janChanged) {
    const { data: conflictingProduct, error: conflictError } = await supabase
      .from("products")
      .select("jan")
      .eq("client_id", result.data.clientId)
      .eq("jan", result.data.jan)
      .maybeSingle();

    if (conflictError) {
      return {
        ok: false,
        message: `JANコードの変更前確認に失敗しました: ${conflictError.message}`,
      };
    }

    if (conflictingProduct) {
      return {
        ok: false,
        message: `JANコード ${result.data.jan} は同じクライアントですでに登録されています。`,
      };
    }
  }

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
    product_image_path: product.productImagePath?.trim() || null,
  };
  let savedExtraFields = true;
  let savedProductImagePath = true;
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

  if (error && error.message.includes("product_image_path")) {
    savedProductImagePath = false;
    const { product_image_path: _productImagePath, ...payloadWithoutImage } = basePayload;
    const retryResult = await supabase.from("products").upsert(
      { ...payloadWithoutImage, ...extraPayload },
      {
        onConflict: "client_id,jan",
      },
    );
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

  if (janChanged && previousJan) {
    const { error: orderLineError } = await supabase
      .from("order_lines")
      .update({ jan: result.data.jan })
      .eq("client_id", result.data.clientId)
      .eq("jan", previousJan);

    if (orderLineError) {
      await supabase
        .from("products")
        .delete()
        .eq("client_id", result.data.clientId)
        .eq("jan", result.data.jan);

      return {
        ok: false,
        message: `JANコード変更時の受注明細更新に失敗しました: ${orderLineError.message}`,
      };
    }

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("client_id", result.data.clientId)
      .eq("jan", previousJan);

    if (deleteError) {
      return {
        ok: false,
        message: `JANコード変更後の旧商品削除に失敗しました: ${deleteError.message}`,
      };
    }
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: savedExtraFields
      ? janChanged
        ? "Supabaseの商品マスタを更新し、JANコードを変更しました。"
        : savedProductImagePath
          ? "Supabaseの商品マスタに登録しました。"
          : "Supabaseの商品マスタに登録しました。商品画像を保存するには商品画像マイグレーションを適用してください。"
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

function sanitizeProductImageFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/\.[^.]+$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${normalized || "product-image"}.jpg`;
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
