"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calculatePayoutLineAmount } from "@/lib/import-orders";
import { requireOperatorName } from "@/lib/operator-session";
import { resolveProductPayoutRate } from "@/lib/payout-rate";
import type { DeletionLog } from "@/lib/types";
import { insertDeletionLog } from "./deletion-log-actions";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const orderIdentitySchema = z.object({
  clientId: z.string().min(1),
  orderId: z.string().min(1),
});
const orderArrivalDueDateSchema = orderIdentitySchema.extend({
  arrivalDueDate: z.string().min(1),
});
const orderStoreNameSchema = orderIdentitySchema.extend({
  storeName: z.string(),
});

export type SaveOrderStatusResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      message: string;
      deletionLog?: DeletionLog;
      checkedByName?: string;
      shippedByName?: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function updateOrderArrivalDueDateInSupabase(params: {
  clientId: string;
  orderId: string;
  arrivalDueDate: string;
}): Promise<SaveOrderStatusResult> {
  const result = orderArrivalDueDateSchema.safeParse(params);

  if (!result.success || Number.isNaN(Date.parse(params.arrivalDueDate))) {
    return {
      ok: false,
      message: "到着指定日を日付で入力してください。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、到着指定日は画面内だけに反映しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("orders")
    .update({
      arrival_due_date: result.data.arrivalDueDate,
      delivery_due_date: result.data.arrivalDueDate,
    })
    .eq("client_id", result.data.clientId)
    .eq("id", result.data.orderId);

  if (error) {
    return {
      ok: false,
      message: `到着指定日の更新に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "到着指定日を更新しました。",
  };
}

export async function updateOrderStoreNameInSupabase(params: {
  clientId: string;
  orderId: string;
  storeName: string;
}): Promise<SaveOrderStatusResult> {
  const result = orderStoreNameSchema.safeParse(params);

  if (!result.success) {
    return {
      ok: false,
      message: "店舗名の更新に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、店舗名は画面内だけに反映しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("orders")
    .update({
      store_name: result.data.storeName,
    })
    .eq("client_id", result.data.clientId)
    .eq("id", result.data.orderId);

  if (error) {
    return {
      ok: false,
      message: `店舗名の更新に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "店舗名を更新しました。",
  };
}

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

  const operatorResult = await requireOperatorName();
  if (!operatorResult.ok) {
    return {
      ok: false,
      message: operatorResult.message,
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
  const [{ data: order, error: orderError }, { data: client, error: clientError }] = await Promise.all([
    supabase
    .from("orders")
    .select("id, status")
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId)
      .single(),
    supabase
      .from("clients")
      .select("id, fbp_fee_rate")
      .eq("id", identity.data.clientId)
      .single(),
  ]);

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

  if (clientError || !client) {
    return {
      ok: false,
      message: `クライアント情報の確認に失敗しました: ${clientError?.message ?? "クライアントが見つかりません"}`,
    };
  }

  const fbpFeeRate = Number(client.fbp_fee_rate ?? 0.08);

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
    .select("jan, wholesale_price, tax_rate, retail_price")
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
    const retailPrice = product.retail_price == null ? null : Number(product.retail_price);
    const payoutRate = resolveProductPayoutRate({
      wholesalePrice: Number(product.wholesale_price),
      retailPrice,
    });
    const payoutAmount = calculatePayoutLineAmount({
      qty: line.qty,
      retailPrice,
      payoutRate,
      fbpFeeRate,
    });

    if (payoutAmount === null) {
      return {
        ok: false,
        message: `JAN ${line.jan} の定価・仕切価格・FBP手数料率を確認してください。定価と仕切価格から掛け率を算出できないため、チェック済みにできません。`,
      };
    }

    const { error: updateLineError } = await supabase
      .from("order_lines")
      .update({
        unit_price_snapshot: unitPrice,
        tax_rate_snapshot: taxRate,
        amount: unitPrice * line.qty,
        retail_price_snapshot: retailPrice,
        payout_rate_snapshot: payoutRate,
        fbp_fee_rate_snapshot: fbpFeeRate,
        payout_amount: payoutAmount,
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
    .update({
      status: "confirmed",
      checked_by_name: operatorResult.operatorName,
    })
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
    checkedByName: operatorResult.operatorName,
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
      retail_price_snapshot: null,
      payout_rate_snapshot: null,
      fbp_fee_rate_snapshot: null,
      payout_amount: null,
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
    .update({
      status: "imported",
      checked_by_name: null,
    })
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

export async function markOrderShippedInSupabase(params: {
  clientId: string;
  orderId: string;
}): Promise<SaveOrderStatusResult> {
  if (!params.clientId || !params.orderId) {
    return {
      ok: false,
      message: "発送済みにするために必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、発送済みは画面内だけに反映しました。",
    };
  }

  const operatorResult = await requireOperatorName();
  if (!operatorResult.ok) {
    return {
      ok: false,
      message: operatorResult.message,
    };
  }

  const identity = orderIdentitySchema.safeParse(params);
  if (!identity.success) {
    return {
      ok: false,
      message: "発送済みにするために必要な情報が不足しています。",
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
      message: "confirmed 状態の受注だけ発送済みにできます。",
    };
  }

  const { data: incompleteLines, error: incompleteLinesError } = await supabase
    .from("order_lines")
    .select("id")
    .eq("client_id", identity.data.clientId)
    .eq("order_id", identity.data.orderId)
    .or(
      "retail_price_snapshot.is.null,payout_rate_snapshot.is.null,fbp_fee_rate_snapshot.is.null,payout_amount.is.null",
    )
    .limit(1);

  if (incompleteLinesError) {
    return {
      ok: false,
      message: `振込計算の保存値確認に失敗しました: ${incompleteLinesError.message}`,
    };
  }

  if ((incompleteLines ?? []).length > 0) {
    return {
      ok: false,
      message:
        "上代（税抜）・仕切価格・FBP手数料率の保存値がない明細があります。受注を一度 imported に戻して、商品マスタを確認してから再度チェック済みにしてください。",
    };
  }

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      status: "shipped",
      shipped_by_name: operatorResult.operatorName,
    })
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId);

  if (orderUpdateError) {
    return {
      ok: false,
      message: `発送済みへの更新に失敗しました: ${orderUpdateError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "受注をSupabase上でも shipped にしました。",
    shippedByName: operatorResult.operatorName,
  };
}

export async function markOrderCheckedInSupabase(params: {
  clientId: string;
  orderId: string;
}): Promise<SaveOrderStatusResult> {
  if (!params.clientId || !params.orderId) {
    return {
      ok: false,
      message: "発送済みを解除するために必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、発送済み解除は画面内だけに反映しました。",
    };
  }

  const identity = orderIdentitySchema.safeParse(params);
  if (!identity.success) {
    return {
      ok: false,
      message: "発送済みを解除するために必要な情報が不足しています。",
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

  if (order.status !== "shipped") {
    return {
      ok: false,
      message: "shipped 状態の受注だけ発送済みを解除できます。",
    };
  }

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      shipped_by_name: null,
    })
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId);

  if (orderUpdateError) {
    return {
      ok: false,
      message: `発送済み解除に失敗しました: ${orderUpdateError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "受注をチェック済みに戻しました。",
  };
}

export async function deleteOrderInSupabase(params: {
  clientId: string;
  orderId: string;
  supplierId: string;
  orderNo: string;
}): Promise<SaveOrderStatusResult> {
  if (!params.clientId || !params.orderId || !params.supplierId || !params.orderNo) {
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

  const operatorResult = await requireOperatorName();
  if (!operatorResult.ok) {
    return {
      ok: false,
      message: operatorResult.message,
    };
  }

  const identity = orderIdentitySchema
    .extend({
      supplierId: z.string().min(1),
      orderNo: z.string().min(1),
    })
    .safeParse(params);
  if (!identity.success) {
    return {
      ok: false,
      message: "受注削除に必要な情報が不足しています。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: orderById, error: orderByIdError } = await supabase
    .from("orders")
    .select(
      `
      id,
      status,
      order_no,
      source_file,
      order_lines ( id )
    `,
    )
    .eq("client_id", identity.data.clientId)
    .eq("id", identity.data.orderId)
    .maybeSingle();

  if (orderByIdError) {
    return {
      ok: false,
      message: `受注の確認に失敗しました: ${orderByIdError.message}`,
    };
  }

  let order = orderById;

  if (!order) {
    const { data: orderByNumber, error: orderByNumberError } = await supabase
      .from("orders")
      .select(
        `
        id,
        status,
        order_no,
        source_file,
        order_lines ( id )
      `,
      )
      .eq("client_id", identity.data.clientId)
      .eq("supplier_id", identity.data.supplierId)
      .eq("order_no", identity.data.orderNo)
      .maybeSingle();

    if (orderByNumberError) {
      return {
        ok: false,
        message: `受注の確認に失敗しました: ${orderByNumberError.message}`,
      };
    }

    order = orderByNumber;
  }

  if (!order) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "受注は既に削除済みです。画面を更新しました。",
    };
  }

  if (order.status === "shipping_instructed" || order.status === "shipped") {
    return {
      ok: false,
      message: "出荷指示済み、または出荷済みの受注は削除できません。",
    };
  }

  const lineCount = Array.isArray(order.order_lines) ? order.order_lines.length : null;
  const deletionLogResult = await insertDeletionLog({
    clientId: identity.data.clientId,
    targetType: "order",
    targetId: order.id,
    orderNo: order.order_no ?? identity.data.orderNo,
    fileName: order.source_file ?? "",
    orderStatus: order.status,
    lineCount,
  });

  if (!deletionLogResult.ok) {
    return {
      ok: false,
      message: deletionLogResult.message,
    };
  }

  const { error: linesDeleteError } = await supabase
    .from("order_lines")
    .delete()
    .eq("client_id", identity.data.clientId)
    .eq("order_id", order.id);

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
    .eq("id", order.id);

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
    deletionLog: deletionLogResult.log,
  };
}
