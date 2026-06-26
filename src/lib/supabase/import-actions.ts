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
  retailPriceSnapshot: z.number().min(0).nullable(),
  payoutRateSnapshot: z.number().gt(0.08).nullable(),
  fbpFeeRateSnapshot: z.number().min(0).nullable(),
  payoutAmount: z.number().min(0).nullable(),
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
  sourceFilePath: z.string().optional(),
  sourceFileUrl: z.string().optional(),
  importedAt: z.string(),
  storeName: z.string(),
  lines: z.array(orderLineSchema).min(1),
});

export type SaveImportResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      message: string;
      orderIds?: Record<string, string>;
      attachedFileOnly?: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export type UploadOrderFileResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      path?: string;
      url?: string;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CreateOrderFileDownloadUrlResult =
  | {
      ok: true;
      url: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveBlockedImport(params: {
  clientId: string;
  supplierId: string;
  fileName: string;
  fileStoragePath?: string;
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
  const blockedBatchPayload = {
    id: batchId,
    client_id: params.clientId,
    supplier_id: params.supplierId,
    file_name: params.fileName,
    status: "blocked",
    ...(params.fileStoragePath ? { file_storage_path: params.fileStoragePath } : {}),
  };
  const { error: batchError } = await supabase.from("import_batches").insert(blockedBatchPayload);

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
  fileStoragePath?: string;
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
    if (params.fileStoragePath) {
      const lockedOrderIds: Record<string, string> = {};
      const lockedOrderNos = (existingOrders ?? [])
        .filter((order) => order.status !== "imported")
        .map((order) => {
          lockedOrderIds[order.order_no] = order.id;
          return order.order_no;
        });

      const { error: attachFileError } = await supabase
        .from("orders")
        .update({
          source_file: params.fileName,
          source_file_path: params.fileStoragePath,
        })
        .eq("client_id", params.clientId)
        .eq("supplier_id", params.supplierId)
        .in("order_no", lockedOrderNos);

      if (attachFileError) {
        return {
          ok: false,
          message: `既存受注へのPDF紐づけに失敗しました: ${attachFileError.message}`,
        };
      }

      const batchPayload = {
        id: crypto.randomUUID(),
        client_id: params.clientId,
        supplier_id: params.supplierId,
        file_name: params.fileName,
        status: "saved",
        file_storage_path: params.fileStoragePath,
      };
      const { error: batchError } = await supabase.from("import_batches").insert(batchPayload);

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
        message: "既存受注は上書きせず、PDFファイルだけ紐づけました。",
        orderIds: lockedOrderIds,
        attachedFileOnly: true,
      };
    }

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
      ...(params.fileStoragePath || order.sourceFilePath
        ? { source_file_path: params.fileStoragePath ?? order.sourceFilePath }
        : {}),
      imported_at: order.importedAt,
      store_name: order.storeName,
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
        retail_price_snapshot: line.retailPriceSnapshot,
        payout_rate_snapshot: line.payoutRateSnapshot,
        fbp_fee_rate_snapshot: line.fbpFeeRateSnapshot,
        payout_amount: line.payoutAmount,
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

  const batchPayload = {
    id: crypto.randomUUID(),
    client_id: params.clientId,
    supplier_id: params.supplierId,
    file_name: params.fileName,
    status: "saved",
    ...(params.fileStoragePath ? { file_storage_path: params.fileStoragePath } : {}),
  };
  const { error: batchError } = await supabase.from("import_batches").insert(batchPayload);

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

export async function uploadOrderFile(formData: FormData): Promise<UploadOrderFileResult> {
  const clientId = String(formData.get("clientId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const file = formData.get("file");

  if (!clientId || !supplierId || !(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      message: "発注書ファイルの保存に必要な情報が不足しています。",
    };
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "PDF以外のファイルはStorage保存をスキップしました。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、PDFはStorageに保存していません。",
    };
  }

  const supabase = createServerSupabaseClient();
  const fileName = sanitizeStorageFileName(file.name);
  const path = `${clientId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${fileName}`;
  const { error } = await supabase.storage.from("order-files").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (error) {
    return {
      ok: false,
      message: `PDFのStorage保存に失敗しました: ${error.message}`,
    };
  }

  const { data: signedUrlData } = await supabase.storage
    .from("order-files")
    .createSignedUrl(path, 60 * 60);

  return {
    ok: true,
    savedToSupabase: true,
    path,
    url: signedUrlData?.signedUrl,
    message: "PDFをStorageに保存しました。",
  };
}

export async function createOrderFileDownloadUrl(
  path: string,
): Promise<CreateOrderFileDownloadUrlResult> {
  if (!path) {
    return {
      ok: false,
      message: "PDFファイルの保存パスがありません。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: "Supabase環境変数が未設定のため、PDFをダウンロードできません。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from("order-files")
    .createSignedUrl(path, 60 * 10);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      message: `PDFのダウンロードURL作成に失敗しました: ${error?.message ?? "URLが取得できませんでした。"}`,
    };
  }

  return {
    ok: true,
    url: data.signedUrl,
  };
}

function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "order-file.pdf";
}
