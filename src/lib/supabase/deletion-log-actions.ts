"use server";

import { mapDeletionLog, type DeletionLogRow } from "@/lib/deletion-log";
import { requireOperatorName } from "@/lib/operator-session";
import type { DeletionLog, DeletionTargetType } from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

export async function insertDeletionLog(params: {
  clientId: string;
  targetType: DeletionTargetType;
  targetId?: string | null;
  orderNo?: string;
  fileName?: string;
  orderStatus?: string;
  lineCount?: number | null;
}): Promise<{ ok: true; log: DeletionLog } | { ok: false; message: string }> {
  const operatorResult = await requireOperatorName();
  if (!operatorResult.ok) {
    return {
      ok: false,
      message: operatorResult.message,
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: "Supabase環境変数が未設定のため、削除履歴を保存できません。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("deletion_logs")
    .insert({
      client_id: params.clientId,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      order_no: params.orderNo ?? "",
      file_name: params.fileName ?? "",
      order_status: params.orderStatus ?? "",
      line_count: params.lineCount ?? null,
      operator_name: operatorResult.operatorName,
    })
    .select(
      "id, client_id, target_type, target_id, order_no, file_name, order_status, line_count, operator_name, deleted_at",
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      message: `削除履歴の保存に失敗しました: ${error?.message ?? "不明なエラー"}`,
    };
  }

  return {
    ok: true,
    log: mapDeletionLog(data as DeletionLogRow),
  };
}
