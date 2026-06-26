"use server";

import { revalidatePath } from "next/cache";
import {
  parseStoreIntroductionWorkbook,
  summarizeStoreIntroduction,
} from "@/lib/store-introduction-parsers";
import { getStoreNameFromMemo } from "@/lib/store-matching";
import type { Store, StoreIntroductionEntry, StoreIntroductionImport } from "@/lib/types";
import { createId } from "@/lib/uuid";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

export type ImportStoreIntroductionResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      importBatch: StoreIntroductionImport;
      entries: StoreIntroductionEntry[];
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function importStoreIntroductionWorkbook(
  formData: FormData,
): Promise<ImportStoreIntroductionResult> {
  const clientId = String(formData.get("clientId") ?? "");
  const file = formData.get("file");
  const storesJson = String(formData.get("storesJson") ?? "[]");

  let stores: Store[] = [];

  try {
    stores = JSON.parse(storesJson) as Store[];
  } catch {
    stores = [];
  }

  if (!clientId || !(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      message: "導入店舗ファイルの取込に必要な情報が不足しています。",
    };
  }

  let parsed;

  try {
    const fileBuffer = await file.arrayBuffer();
    parsed = parseStoreIntroductionWorkbook(fileBuffer);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "導入店舗ファイルを読み取れませんでした。",
    };
  }

  if (parsed.entries.length === 0) {
    return {
      ok: false,
      message: "導入店舗データが1件も見つかりませんでした。",
    };
  }

  const summary = summarizeStoreIntroduction(parsed.entries);
  const importId = createId();
  const importedAt = new Date().toISOString();
  const entries: StoreIntroductionEntry[] = parsed.entries.map((entry) => ({
    id: createId(),
    importId,
    clientId,
    jan: entry.jan,
    productName: entry.productName,
    storeName: entry.storeName,
    storeCode: entry.storeCode,
    address: entry.address,
    postalCode: entry.postalCode,
    isIntroduced: entry.isIntroduced,
    matchedStoreName: getStoreNameFromMemo(entry.storeName, stores),
  }));

  const importBatch: StoreIntroductionImport = {
    id: importId,
    clientId,
    fileName: file.name,
    formatKey: parsed.formatKey,
    importedAt,
    totalStoreCount: summary.totalStoreCount,
    introducedStoreCount: summary.introducedStoreCount,
  };

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      importBatch,
      entries,
      message: `導入店舗 ${summary.introducedStoreCount}店舗を画面内に取り込みました（Supabase未設定）。`,
    };
  }

  const supabase = createServerSupabaseClient();
  const { error: importError } = await supabase.from("store_introduction_imports").insert({
    id: importBatch.id,
    client_id: importBatch.clientId,
    file_name: importBatch.fileName,
    format_key: importBatch.formatKey,
    imported_at: importBatch.importedAt,
    total_store_count: importBatch.totalStoreCount,
    introduced_store_count: importBatch.introducedStoreCount,
  });

  if (importError) {
    return {
      ok: false,
      message: `導入店舗の取込履歴保存に失敗しました: ${importError.message}`,
    };
  }

  const { error: entriesError } = await supabase.from("store_introduction_entries").insert(
    entries.map((entry) => ({
      id: entry.id,
      import_id: entry.importId,
      client_id: entry.clientId,
      jan: entry.jan,
      product_name: entry.productName,
      store_name: entry.storeName,
      store_code: entry.storeCode,
      address: entry.address,
      postal_code: entry.postalCode,
      is_introduced: entry.isIntroduced,
      matched_store_name: entry.matchedStoreName,
    })),
  );

  if (entriesError) {
    await supabase.from("store_introduction_imports").delete().eq("id", importBatch.id);
    return {
      ok: false,
      message: `導入店舗データの保存に失敗しました: ${entriesError.message}`,
    };
  }

  revalidatePath("/store-introductions");
  revalidatePath("/stores");

  const formatLabel = parsed.formatKey === "row-list" ? "店舗一覧表" : "0/1フラグ表";

  return {
    ok: true,
    savedToSupabase: true,
    importBatch,
    entries,
    message: `${formatLabel}として取り込みました。導入 ${summary.introducedStoreCount}店舗 / 全${summary.totalStoreCount}店舗（JAN ${summary.jans.length}件）。`,
  };
}

export async function readStoreIntroductionData(clientId: string) {
  if (!clientId || !hasSupabaseServerEnv()) {
    return {
      imports: [] as StoreIntroductionImport[],
      entries: [] as StoreIntroductionEntry[],
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: imports, error: importsError } = await supabase
    .from("store_introduction_imports")
    .select("id, client_id, file_name, format_key, imported_at, total_store_count, introduced_store_count")
    .eq("client_id", clientId)
    .order("imported_at", { ascending: false })
    .limit(20);

  if (importsError || !imports?.length) {
    return {
      imports: [] as StoreIntroductionImport[],
      entries: [] as StoreIntroductionEntry[],
    };
  }

  const importIds = imports.map((item) => item.id);
  const { data: entries, error: entriesError } = await supabase
    .from("store_introduction_entries")
    .select(
      "id, import_id, client_id, jan, product_name, store_name, store_code, address, postal_code, is_introduced, matched_store_name",
    )
    .in("import_id", importIds)
    .order("store_name")
    .limit(10000);

  if (entriesError) {
    return {
      imports: imports.map(mapStoreIntroductionImport),
      entries: [] as StoreIntroductionEntry[],
    };
  }

  return {
    imports: imports.map(mapStoreIntroductionImport),
    entries: (entries ?? []).map(mapStoreIntroductionEntry),
  };
}

function mapStoreIntroductionImport(row: {
  id: string;
  client_id: string;
  file_name: string;
  format_key: StoreIntroductionImport["formatKey"];
  imported_at: string;
  total_store_count: number;
  introduced_store_count: number;
}): StoreIntroductionImport {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    formatKey: row.format_key,
    importedAt: row.imported_at,
    totalStoreCount: row.total_store_count,
    introducedStoreCount: row.introduced_store_count,
  };
}

function mapStoreIntroductionEntry(row: {
  id: string;
  import_id: string;
  client_id: string;
  jan: string;
  product_name: string;
  store_name: string;
  store_code: string;
  address: string;
  postal_code: string;
  is_introduced: boolean;
  matched_store_name: string;
}): StoreIntroductionEntry {
  return {
    id: row.id,
    importId: row.import_id,
    clientId: row.client_id,
    jan: row.jan,
    productName: row.product_name,
    storeName: row.store_name,
    storeCode: row.store_code,
    address: row.address,
    postalCode: row.postal_code,
    isIntroduced: row.is_introduced,
    matchedStoreName: row.matched_store_name,
  };
}
