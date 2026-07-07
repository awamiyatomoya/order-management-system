import type { DeletionLog, DeletionTargetType } from "./types";

type DeletionLogRow = {
  id: string;
  client_id: string;
  target_type: DeletionTargetType;
  target_id: string | null;
  order_no: string;
  file_name: string;
  order_status: string;
  line_count: number | null;
  operator_name: string;
  deleted_at: string;
};

export function mapDeletionLog(row: DeletionLogRow): DeletionLog {
  return {
    id: row.id,
    clientId: row.client_id,
    targetType: row.target_type,
    targetId: row.target_id,
    orderNo: row.order_no,
    fileName: row.file_name,
    orderStatus: row.order_status,
    lineCount: row.line_count,
    operatorName: row.operator_name,
    deletedAt: row.deleted_at,
  };
}

export type { DeletionLogRow };
