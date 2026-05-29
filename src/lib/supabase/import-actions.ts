"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ImportError, Order } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const importErrorSchema = z.object({
  row: z.number().int().min(0),
  field: z.string().min(1),
  message: z.string().min(1),
});

const orderLineSchema = z.object({
  id: z.string().min(1),
  lineNo: z.number().int().positive(),
  jan: z.string().min(1),
  qty: z.number().int().positive(),
  qtyCase: z.number().int().positive().nullable().optional(),
  qtyLoose: z.number().int().min(0).nullable().optional(),
  unitPriceSnapshot: z.number().min(0).nullable(),
  taxRateSnapshot: z.number().min(0).nullable(),
  amount: z.number().min(0).nullable(),
  memo: z.string(),
});

const orderSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  supplierId: z.string().min(1),
  orderNo: z.string().min(1),
  orderDate: z.string().min(1),
  arrivalDueDate: z.string(),
  deliveryDueDate: z.string(),
  shipToName: z.string().min(1),
  shipToCenter: z.string(),
  shipToAddress: z.string(),
  shipToTel: z.string(),
  warehouse: z.string(),
  status: z.literal("imported"),
  sourceFile: z.string(),
  importedAt: z.string(),
  lines: z.array(orderLineSchema).min(1),
});

export type SaveImportResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      message: string;
      orderIds?: Record<string, string>;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveBlockedImport(params: {
  clientId: string;
  supplierId: string;
  fileName: string;
  errors: ImportError[];
}): Promise<SaveImportResult> {
  const errorsResult = z.array(importErrorSchema).safeParse(params.errors);

  if (!params.clientId || !params.supplierId || !params.fileName || !errorsResult.success) {
    return {
      ok: false,
      message: "取込エラー履歴の保存に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、取込エラーは画面内だけに記録しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const batchId = crypto.randomUUID();
  const { error: batchError } = await supabase.from("import_batches").insert({
    id: batchId,
    client_id: params.clientId,
    supplier_id: params.supplierId,
    file_name: params.fileName,
    status: "blocked",
  });

  if (batchError) {
    return {
      ok: false,
      message: `取込エラー履歴の保存に失敗しました: ${batchError.message}`,
    };
  }

  const { error: errorsError } = await supabase.from("import_errors").insert(
    errorsResult.data.map((error) => ({
      client_id: params.clientId,
      import_batch_id: batchId,
      row_number: error.row === 0 ? null : error.row,
      field: error.field,
      message: error.message,
    })),
  );

  if (errorsError) {
    return {
      ok: false,
      message: `取込エラー明細の保存に失敗しました: ${errorsError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "取込エラー履歴をSupabaseに保存しました。",
  };
}

export async function saveImportedOrders(params: {
  clientId: string;
  supplierId: string;
  fileName: string;
  orders: Order[];
}): Promise<SaveImportResult> {
  if (!params.clientId || !params.supplierId || !params.fileName || params.orders.length === 0) {
    return {
      ok: false,
      message: "受注保存に必要な情報が不足しています。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、受注は画面内だけに保存しました。",
    };
  }

  const ordersResult = z.array(orderSchema).min(1).safeParse(params.orders);

  if (!ordersResult.success) {
    return {
      ok: false,
      message: "受注保存に必要な情報が不足しています。",
    };
  }

  const supabase = createServerSupabaseClient();
  const orderNos = ordersResult.data.map((order) => order.orderNo);
  const orderIds: Record<string, string> = {};
  const { data: existingOrders, error: existingError } = await supabase
    .from("orders")
    .select("id, order_no, status")
    .eq("client_id", params.clientId)
    .eq("supplier_id", params.supplierId)
    .in("order_no", orderNos);

  if (existingError) {
    return {
      ok: false,
      message: `既存受注の確認に失敗しました: ${existingError.message}`,
    };
  }

  const lockedOrder = existingOrders?.find((order) => order.status !== "imported");
  if (lockedOrder) {
    return {
      ok: false,
      message: `発注番号 ${lockedOrder.order_no} は確定済みのため再取り込みできません。`,
    };
  }

  for (const order of ordersResult.data) {
    const existingOrder = existingOrders?.find((candidate) => candidate.order_no === order.orderNo);
    const orderId = existingOrder?.id ?? order.id;
    orderIds[order.orderNo] = orderId;
    const orderPayload = {
      id: orderId,
      client_id: order.clientId,
      supplier_id: order.supplierId,
      order_no: order.orderNo,
      order_date: order.orderDate,
      arrival_due_date: order.arrivalDueDate || null,
      delivery_due_date: order.deliveryDueDate || null,
      ship_to_name: order.shipToName,
      ship_to_center: order.shipToCenter,
      ship_to_address: order.shipToAddress,
      ship_to_tel: order.shipToTel,
      warehouse: order.warehouse,
      status: "imported",
      source_file: order.sourceFile,
      imported_at: order.importedAt,
    };

    const { error: orderError } = existingOrder
      ? await supabase
          .from("orders")
          .update(orderPayload)
          .eq("client_id", order.clientId)
          .eq("id", orderId)
      : await supabase.from("orders").insert(orderPayload);

    if (orderError) {
      return {
        ok: false,
        message: `受注 ${order.orderNo} の保存に失敗しました: ${orderError.message}`,
      };
    }

    if (existingOrder) {
      const { error: deleteLinesError } = await supabase
        .from("order_lines")
        .delete()
        .eq("client_id", order.clientId)
        .eq("order_id", orderId);

      if (deleteLinesError) {
        return {
          ok: false,
          message: `受注 ${order.orderNo} の明細更新準備に失敗しました: ${deleteLinesError.message}`,
        };
      }
    }

    const { error: linesError } = await supabase.from("order_lines").insert(
      order.lines.map((line) => ({
        id: line.id,
        client_id: order.clientId,
        order_id: orderId,
        line_no: line.lineNo,
        jan: line.jan,
        qty: line.qty,
        unit_price_snapshot: line.unitPriceSnapshot,
        tax_rate_snapshot: line.taxRateSnapshot,
        amount: line.amount,
        memo: line.memo,
      })),
    );

    if (linesError) {
      return {
        ok: false,
        message: `受注 ${order.orderNo} の明細保存に失敗しました: ${linesError.message}`,
      };
    }
  }

  const { error: batchError } = await supabase.from("import_batches").insert({
    id: crypto.randomUUID(),
    client_id: params.clientId,
    supplier_id: params.supplierId,
    file_name: params.fileName,
    status: "saved",
  });

  if (batchError) {
    return {
      ok: false,
      message: `取込履歴の保存に失敗しました: ${batchError.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "受注と取込履歴をSupabaseに保存しました。",
    orderIds,
  };
}
