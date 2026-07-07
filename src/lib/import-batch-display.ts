import type { ImportBatch } from "@/lib/types";

export function filterImportBatchesForOrderFiles(batches: ImportBatch[]) {
  return batches.filter((batch) => batch.status === "saved");
}
