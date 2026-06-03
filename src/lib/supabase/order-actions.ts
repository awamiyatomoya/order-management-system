"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const orderIdentitySchema = z.object({
  clientId: z.string().min(1),
  orderId: z.string().min(1),
});

export type SaveOrderStatusResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function confirmOrderInSupabase(params: {
  clientId: string;
  orderId: string;
}): Promise<SaveOrderStatusResult> {
  if (!params.clientId || !params.orderId) {
    return {
      ok: false,
      message: "受注確定に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、確定は画面内だけに反映しました。",
    };
  }

  const identity = orderIdentitySchema.safeParse(params);
  if (!identity.success) {
    return {
      ok: false,
      message: "受注確定に必要な情報が不足しています。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId)
    .single();

  if (orderError || !order) {
    return {
      ok: false,
      message: `受注の確認に失敗しました: ${orderError?.message ?? "受注が見つかりません"}`,
    };
  }

  if (order.status !== "imported") {
    return {
      ok: false,
      message: "imported 状態の受注だけ確定できます。",
    };
  }

  const { data: lines, error: linesError } = await supabase
    .from("order_lines")
    .select("id, jan, qty")
    .eq("client_id", identity.data.clientId)
    .eq("order_id", identity.data.orderId);

  if (linesError || !lines?.length) {
    return {
      ok: false,
      message: `受注明細の確認に失敗しました: ${linesError?.message ?? "明細がありません"}`,
    };
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("jan, wholesale_price, tax_rate")
    .eq("client_id", identity.data.clientId)
    .in(
      "jan",
      lines.map((line) => line.jan),
    );

  if (productsError || !products) {
    return {
      ok: false,
      message: `商品マスタの確認に失敗しました: ${productsError?.message ?? "商品が見つかりません"}`,
    };
  }

  const productsByJan = new Map(products.map((product) => [product.jan, product]));
  for (const line of lines) {
    const product = productsByJan.get(line.jan);
    if (!product) {
      return {
        ok: false,
        message: `商品マスタに未登録のJANがあります: ${line.jan}`,
      };
    }

    const unitPrice = Number(product.wholesale_price);
    const taxRate = Number(product.tax_rate);
    const { error: updateLineError } = await supabase
      .from("order_lines")
      .update({
        unit_price_snapshot: unitPrice,
        tax_rate_snapshot: taxRate,
        amount: unitPrice * line.qty,
      })
      .eq("client_id", identity.data.clientId)
      .eq("id", line.id);

    if (updateLineError) {
      return {
        ok: false,
        message: `受注明細の確定に失敗しました: ${updateLineError.message}`,
      };
    }
  }

  const { error: updateOrderError } = await supabase
    .from("orders")
    .update({ status: "confirmed" })
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId);

  if (updateOrderError) {
    return {
      ok: false,
      message: `受注ステータスの更新に失敗しました: ${updateOrderError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "受注をSupabase上でも confirmed にしました。",
  };
}

export async function undoOrderConfirmationInSupabase(params: {
  clientId: string;
  orderId: string;
}): Promise<SaveOrderStatusResult> {
  if (!params.clientId || !params.orderId) {
    return {
      ok: false,
      message: "確定取消に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、確定取消は画面内だけに反映しました。",
    };
  }

  const identity = orderIdentitySchema.safeParse(params);
  if (!identity.success) {
    return {
      ok: false,
      message: "確定取消に必要な情報が不足しています。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId)
    .single();

  if (orderError || !order) {
    return {
      ok: false,
      message: `受注の確認に失敗しました: ${orderError?.message ?? "受注が見つかりません"}`,
    };
  }

  if (order.status !== "confirmed") {
    return {
      ok: false,
      message: "confirmed 状態の受注だけ確定取消できます。",
    };
  }

  const { error: linesError } = await supabase
    .from("order_lines")
    .update({
      unit_price_snapshot: null,
      tax_rate_snapshot: null,
      amount: null,
    })
    .eq("client_id", identity.data.clientId)
    .eq("order_id", identity.data.orderId);

  if (linesError) {
    return {
      ok: false,
      message: `受注明細の確定取消に失敗しました: ${linesError.message}`,
    };
  }

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({ status: "imported" })
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId);

  if (orderUpdateError) {
    return {
      ok: false,
      message: `受注ステータスの確定取消に失敗しました: ${orderUpdateError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "受注をSupabase上でも imported に戻しました。",
  };
}

export async function deleteOrderInSupabase(params: {
  clientId: string;
  orderId: string;
}): Promise<SaveOrderStatusResult> {
  if (!params.clientId || !params.orderId) {
    return {
      ok: false,
      message: "受注削除に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、削除は画面内だけに反映しました。",
    };
  }

  const identity = orderIdentitySchema.safeParse(params);
  if (!identity.success) {
    return {
      ok: false,
      message: "受注削除に必要な情報が不足しています。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId)
    .single();

  if (orderError || !order) {
    return {
      ok: false,
      message: `受注の確認に失敗しました: ${orderError?.message ?? "受注が見つかりません"}`,
    };
  }

  if (order.status === "shipping_instructed" || order.status === "shipped") {
    return {
      ok: false,
      message: "出荷指示済み、または出荷済みの受注は削除できません。",
    };
  }

  const { error: linesDeleteError } = await supabase
    .from("order_lines")
    .delete()
    .eq("client_id", identity.data.clientId)
    .eq("order_id", identity.data.orderId);

  if (linesDeleteError) {
    return {
      ok: false,
      message: `受注明細の削除に失敗しました: ${linesDeleteError.message}`,
    };
  }

  const { error: orderDeleteError } = await supabase
    .from("orders")
    .delete()
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId);

  if (orderDeleteError) {
    return {
      ok: false,
      message: `受注の削除に失敗しました: ${orderDeleteError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "受注をSupabaseから削除しました。",
  };
}
