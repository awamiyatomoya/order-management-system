"use server";

import { revalidatePath } from "next/cache";
import { parseSelloutWorkbook, summarizeSelloutEntries } from "@/lib/sellout-parsers";
import {
  buildStoreLocationLookup,
  resolveStoreLocationMatch,
  type StoreLocation,
} from "@/lib/store-location-matching";
import { ensureOfficialChainStoreLocationsFromOfficialSite } from "@/lib/supabase/store-location-actions";
import { readStoreLocationRecords } from "@/lib/supabase/store-location-actions";
import type { SelloutEntry, SelloutImport } from "@/lib/types";
import { createId } from "@/lib/uuid";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

export type ImportSelloutResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      importBatch: SelloutImport;
      entries: SelloutEntry[];
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function importSelloutWorkbook(formData: FormData): Promise<ImportSelloutResult> {
  const clientId = String(formData.get("clientId") ?? "");
  const file = formData.get("file");

  if (!clientId || !(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      message: "セルアウトファイルの取込に必要な情報が不足しています。",
    };
  }

  const fileBuffer = await file.arrayBuffer();
  let parsed;

  try {
    parsed = parseSelloutWorkbook(fileBuffer);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "セルアウトファイルを読み取れませんでした。",
    };
  }

  await ensureStoreLocationsForRetailer(parsed.retailer);
  const storeLocations = await readStoreLocationRecords();
  const lookup = buildStoreLocationLookup(storeLocations);

  const enrichedEntries = parsed.entries.map((entry) => {
    const matched = resolveSelloutStoreMatch(entry, lookup, parsed.retailer);
    return {
      ...entry,
      storeCode: matched?.storeCode || entry.storeCode,
      matchedStoreCode: matched?.storeCode || "",
      matchedStoreName: matched?.storeName || "",
    };
  });

  const summary = summarizeSelloutEntries(enrichedEntries);
  const importId = createId();
  const importedAt = new Date().toISOString();

  const importBatch: SelloutImport = {
    id: importId,
    clientId,
    fileName: file.name,
    profileKey: parsed.profileKey,
    retailer: parsed.retailer,
    layoutType: parsed.layoutType,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    importedAt,
    entryCount: summary.entryCount,
    storeCount: summary.storeCount,
    totalQty: summary.totalQty,
    totalAmount: summary.totalAmount,
  };

  const entries: SelloutEntry[] = enrichedEntries.map((entry) => ({
    id: createId(),
    importId,
    clientId,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    retailer: entry.retailer,
    storeCode: entry.storeCode,
    storeName: entry.storeName,
    matchedStoreCode: entry.matchedStoreCode,
    matchedStoreName: entry.matchedStoreName,
    jan: entry.jan,
    productName: entry.productName,
    qty: entry.qty,
    amount: entry.amount,
    stock: entry.stock,
  }));

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      importBatch,
      entries,
      message: `${parsed.retailer} / ${parsed.profileKey} として ${summary.entryCount}件を読み取りました（DB未保存）。`,
    };
  }

  const supabase = createServerSupabaseClient();
  const { error: importError } = await supabase.from("sellout_imports").insert({
    id: importBatch.id,
    client_id: importBatch.clientId,
    file_name: importBatch.fileName,
    profile_key: importBatch.profileKey,
    retailer: importBatch.retailer,
    layout_type: importBatch.layoutType,
    period_start: importBatch.periodStart || null,
    period_end: importBatch.periodEnd || null,
    imported_at: importBatch.importedAt,
    entry_count: importBatch.entryCount,
    store_count: importBatch.storeCount,
    total_qty: importBatch.totalQty,
    total_amount: importBatch.totalAmount,
  });

  if (importError) {
    return {
      ok: false,
      message: `セルアウト取込の保存に失敗しました: ${importError.message}`,
    };
  }

  const chunkSize = 500;
  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const chunk = entries.slice(offset, offset + chunkSize).map((entry) => ({
      id: entry.id,
      import_id: entry.importId,
      client_id: entry.clientId,
      period_start: entry.periodStart || null,
      period_end: entry.periodEnd || null,
      retailer: entry.retailer,
      store_code: entry.storeCode,
      store_name: entry.storeName,
      matched_store_code: entry.matchedStoreCode,
      matched_store_name: entry.matchedStoreName,
      jan: entry.jan,
      product_name: entry.productName,
      qty: entry.qty,
      amount: entry.amount,
      stock: entry.stock,
    }));

    const { error: entriesError } = await supabase.from("sellout_entries").insert(chunk);
    if (entriesError) {
      await supabase.from("sellout_imports").delete().eq("id", importBatch.id);
      return {
        ok: false,
        message: `セルアウト明細の保存に失敗しました: ${entriesError.message}`,
      };
    }
  }

  revalidatePath("/sell-out");

  const periodLabel =
    importBatch.periodStart === importBatch.periodEnd
      ? importBatch.periodStart
      : `${importBatch.periodStart} 〜 ${importBatch.periodEnd}`;

  return {
    ok: true,
    savedToSupabase: true,
    importBatch,
    entries,
    message: `${importBatch.retailer}（${periodLabel}）として ${summary.entryCount}件 / ${summary.storeCount}店舗を取り込みました。`,
  };
}

export async function readSelloutData(clientId: string) {
  if (!clientId || !hasSupabaseServerEnv()) {
    return {
      imports: [] as SelloutImport[],
      entries: [] as SelloutEntry[],
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: imports, error: importsError } = await supabase
    .from("sellout_imports")
    .select(
      "id, client_id, file_name, profile_key, retailer, layout_type, period_start, period_end, imported_at, entry_count, store_count, total_qty, total_amount",
    )
    .eq("client_id", clientId)
    .order("imported_at", { ascending: false })
    .limit(100);

  if (importsError || !imports?.length) {
    return {
      imports: [] as SelloutImport[],
      entries: [] as SelloutEntry[],
    };
  }

  const mappedImports = imports.map(mapSelloutImport);
  const latestImportIds = getLatestImportIdsByRetailer(mappedImports);
  const { data: entries, error: entriesError } = await supabase
    .from("sellout_entries")
    .select(
      "id, import_id, client_id, period_start, period_end, retailer, store_code, store_name, matched_store_code, matched_store_name, jan, product_name, qty, amount, stock",
    )
    .in("import_id", latestImportIds)
    .order("store_name");

  if (entriesError) {
    return {
      imports: mappedImports,
      entries: [] as SelloutEntry[],
    };
  }

  return {
    imports: mappedImports,
    entries: (entries ?? []).map(mapSelloutEntry),
  };
}

function getLatestImportIdsByRetailer(imports: SelloutImport[]) {
  const latestImportIdByRetailer = new Map<string, string>();

  imports.forEach((importBatch) => {
    const retailer = importBatch.retailer.trim();
    if (retailer && !latestImportIdByRetailer.has(retailer)) {
      latestImportIdByRetailer.set(retailer, importBatch.id);
    }
  });

  const importIds = Array.from(latestImportIdByRetailer.values());
  if (importIds.length > 0) {
    return importIds;
  }

  return imports[0] ? [imports[0].id] : [];
}

async function ensureStoreLocationsForRetailer(retailer: string) {
  if (retailer === "ロフト" || retailer === "ハンズ") {
    try {
      await ensureOfficialChainStoreLocationsFromOfficialSite(retailer);
    } catch {
      // 公式サイト取得に失敗しても既存マスタで続行する。
    }
  }
}

function resolveSelloutStoreMatch(
  entry: Pick<StoreLocation, "storeCode" | "storeName">,
  lookup: ReturnType<typeof buildStoreLocationLookup>,
  retailer: string,
) {
  if (retailer === "ロフト" && /^\d{2,4}$/.test(entry.storeCode.trim())) {
    const loftMatch = lookup.byCode.get(`loft-${entry.storeCode.trim()}`);
    if (loftMatch) {
      return loftMatch;
    }
  }

  return resolveStoreLocationMatch(
    {
      storeCode: entry.storeCode,
      storeName: entry.storeName,
      postalCode: "",
      address: "",
    },
    lookup,
  );
}

function mapSelloutImport(row: {
  id: string;
  client_id: string;
  file_name: string;
  profile_key: string;
  retailer: string;
  layout_type: SelloutImport["layoutType"];
  period_start: string | null;
  period_end: string | null;
  imported_at: string;
  entry_count: number;
  store_count: number;
  total_qty: number;
  total_amount: number | string;
}): SelloutImport {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    profileKey: row.profile_key,
    retailer: row.retailer,
    layoutType: row.layout_type,
    periodStart: row.period_start ?? "",
    periodEnd: row.period_end ?? "",
    importedAt: row.imported_at,
    entryCount: row.entry_count,
    storeCount: row.store_count,
    totalQty: row.total_qty,
    totalAmount: Number(row.total_amount),
  };
}

function mapSelloutEntry(row: {
  id: string;
  import_id: string;
  client_id: string;
  period_start: string | null;
  period_end: string | null;
  retailer: string;
  store_code: string;
  store_name: string;
  matched_store_code: string;
  matched_store_name: string;
  jan: string;
  product_name: string;
  qty: number;
  amount: number | string;
  stock: number | null;
}): SelloutEntry {
  return {
    id: row.id,
    importId: row.import_id,
    clientId: row.client_id,
    periodStart: row.period_start ?? "",
    periodEnd: row.period_end ?? "",
    retailer: row.retailer,
    storeCode: row.store_code,
    storeName: row.store_name,
    matchedStoreCode: row.matched_store_code,
    matchedStoreName: row.matched_store_name,
    jan: row.jan,
    productName: row.product_name,
    qty: row.qty,
    amount: Number(row.amount),
    stock: row.stock,
  };
}
