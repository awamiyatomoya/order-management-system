"use server";

import { revalidatePath } from "next/cache";
import { parseSelloutWorkbook, summarizeSelloutEntries } from "@/lib/sellout-parsers";
import {
  buildStoreLocationLookup,
  resolveStoreLocationMatch,
  type StoreLocation,
  type StoreLocationMatchOptions,
} from "@/lib/store-location-matching";
import {
  belongsToStoreLocationChain,
  hasOfficialChainStoreMaster,
} from "@/lib/store-location-groups";
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
  const lookup = buildSelloutStoreLocationLookup(storeLocations, parsed.retailer);
  const introducedStoreCodes = await loadIntroducedStoreCodes(
    clientId,
    parsed.retailer,
    storeLocations,
  );

  const enrichedEntries = parsed.entries.map((entry) => {
    const matched = resolveSelloutStoreMatch(entry, lookup, parsed.retailer, {
      introducedStoreCodes,
    });
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
  let fileStoragePath = "";

  if (hasSupabaseServerEnv()) {
    const uploadResult = await uploadSelloutFileToStorage(clientId, file);
    if (!uploadResult.ok) {
      return {
        ok: false,
        message: uploadResult.message,
      };
    }
    fileStoragePath = uploadResult.path;
  }

  const importBatch: SelloutImport = {
    id: importId,
    clientId,
    fileName: file.name,
    fileStoragePath: fileStoragePath || undefined,
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
    file_storage_path: importBatch.fileStoragePath || null,
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
    if (fileStoragePath) {
      await supabase.storage.from("sellout-files").remove([fileStoragePath]);
    }
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
      if (fileStoragePath) {
        await supabase.storage.from("sellout-files").remove([fileStoragePath]);
      }
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
      "id, client_id, file_name, file_storage_path, profile_key, retailer, layout_type, period_start, period_end, imported_at, entry_count, store_count, total_qty, total_amount",
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
  // 小売企業×対象期間ごとに最新取込だけ使う（月次ファイルを積み上げて見られるようにする）
  const activeImportIds = getLatestImportIdsByRetailerAndPeriod(mappedImports);
  if (activeImportIds.length === 0) {
    return {
      imports: mappedImports,
      entries: [] as SelloutEntry[],
    };
  }

  const { data: entries, error: entriesError } = await supabase
    .from("sellout_entries")
    .select(
      "id, import_id, client_id, period_start, period_end, retailer, store_code, store_name, matched_store_code, matched_store_name, jan, product_name, qty, amount, stock",
    )
    .in("import_id", activeImportIds)
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

/** imports は imported_at DESC 前提。同一小売×期間は最新1件だけ残す。 */
function getLatestImportIdsByRetailerAndPeriod(imports: SelloutImport[]) {
  const latestImportIdByKey = new Map<string, string>();

  imports.forEach((importBatch) => {
    const retailer = importBatch.retailer.trim();
    if (!retailer) {
      return;
    }

    const key = `${retailer}|${importBatch.periodStart}|${importBatch.periodEnd}`;
    if (!latestImportIdByKey.has(key)) {
      latestImportIdByKey.set(key, importBatch.id);
    }
  });

  return Array.from(latestImportIdByKey.values());
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

function buildSelloutStoreLocationLookup(
  storeLocations: Array<StoreLocation & { chainName?: string }>,
  retailer: string,
) {
  if (hasOfficialChainStoreMaster(retailer)) {
    const scoped = storeLocations.filter((location) =>
      belongsToStoreLocationChain(location, retailer),
    );
    if (scoped.length >= 5) {
      return buildStoreLocationLookup(scoped);
    }
  }

  return buildStoreLocationLookup(storeLocations);
}

function resolveSelloutStoreMatch(
  entry: Pick<StoreLocation, "storeCode" | "storeName">,
  lookup: ReturnType<typeof buildStoreLocationLookup>,
  retailer: string,
  options?: StoreLocationMatchOptions,
) {
  // ExcelのPOS店舗CDと公式サイトの shop_id は別体系。コードでの直接照合はしない。
  return resolveStoreLocationMatch(
    {
      storeCode: entry.storeCode,
      storeName: entry.storeName,
      postalCode: "",
      address: "",
    },
    lookup,
    options,
  );
}

async function loadIntroducedStoreCodes(
  clientId: string,
  retailer: string,
  storeLocations: Array<StoreLocation & { chainName?: string }>,
) {
  const codes = new Set<string>();

  if (!clientId || !hasSupabaseServerEnv()) {
    return codes;
  }

  const supabase = createServerSupabaseClient();
  const { data: imports, error: importsError } = await supabase
    .from("store_introduction_imports")
    .select("id, chain_name, imported_at")
    .eq("client_id", clientId)
    .order("imported_at", { ascending: false });

  if (importsError || !imports?.length) {
    return codes;
  }

  const latestImportIdByChain = new Map<string, string>();
  imports.forEach((importBatch) => {
    const chainName = (importBatch.chain_name ?? "").trim();
    if (!chainName || latestImportIdByChain.has(chainName)) {
      return;
    }
    latestImportIdByChain.set(chainName, importBatch.id);
  });

  const targetImportIds = retailer && latestImportIdByChain.has(retailer)
    ? [latestImportIdByChain.get(retailer)!]
    : Array.from(latestImportIdByChain.values());

  if (targetImportIds.length === 0) {
    return codes;
  }

  const { data: entries, error: entriesError } = await supabase
    .from("store_introduction_entries")
    .select("store_code, store_name, is_introduced, import_id")
    .eq("client_id", clientId)
    .eq("is_introduced", true)
    .in("import_id", targetImportIds);

  if (entriesError || !entries?.length) {
    return codes;
  }

  const scopedLocations = hasOfficialChainStoreMaster(retailer)
    ? storeLocations.filter(
        (location) =>
          location.storeCode && belongsToStoreLocationChain(location, retailer),
      )
    : storeLocations;
  const lookup = buildStoreLocationLookup(
    (scopedLocations.length >= 5 ? scopedLocations : storeLocations).map((location) => ({
      storeCode: location.storeCode,
      storeName: location.storeName,
      postalCode: location.postalCode,
      address: location.address,
      tel: location.tel,
    })),
  );

  entries.forEach((entry) => {
    const matched = resolveStoreLocationMatch(
      {
        storeCode: entry.store_code ?? "",
        storeName: entry.store_name ?? "",
        postalCode: "",
        address: "",
      },
      lookup,
    );

    if (matched?.storeCode) {
      codes.add(matched.storeCode);
    }

    const rawCode = (entry.store_code ?? "").trim();
    if (
      rawCode.startsWith("hands-") ||
      rawCode.startsWith("loft-") ||
      rawCode.startsWith("ainz-") ||
      rawCode.startsWith("atcosme-")
    ) {
      codes.add(rawCode);
    }
  });

  return codes;
}

function mapSelloutImport(row: {
  id: string;
  client_id: string;
  file_name: string;
  file_storage_path?: string | null;
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
    fileStoragePath: row.file_storage_path || undefined,
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

type UploadSelloutFileResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

export type CreateSelloutFileDownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

async function uploadSelloutFileToStorage(
  clientId: string,
  file: File,
): Promise<UploadSelloutFileResult> {
  const supabase = createServerSupabaseClient();
  const fileName = sanitizeSelloutStorageFileName(file.name);
  const path = `${clientId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${fileName}`;
  const contentType = resolveSelloutContentType(file);

  const { error } = await supabase.storage.from("sellout-files").upload(path, file, {
    contentType,
    upsert: false,
  });

  if (error) {
    return {
      ok: false,
      message: `セルアウトExcelのStorage保存に失敗しました: ${error.message}`,
    };
  }

  return { ok: true, path };
}

export async function createSelloutFileDownloadUrl(
  path: string,
): Promise<CreateSelloutFileDownloadUrlResult> {
  if (!path) {
    return {
      ok: false,
      message: "セルアウトファイルの保存パスがありません。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: "Supabase環境変数が未設定のため、セルアウトファイルをダウンロードできません。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from("sellout-files")
    .createSignedUrl(path, 60 * 10);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      message: `セルアウトファイルのダウンロードURL作成に失敗しました: ${error?.message ?? "URLが取得できませんでした。"}`,
    };
  }

  return {
    ok: true,
    url: data.signedUrl,
  };
}

function sanitizeSelloutStorageFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "sellout.xlsx";
}

function resolveSelloutContentType(file: File) {
  if (file.type) {
    return file.type;
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsm")) {
    return "application/vnd.ms-excel.sheet.macroEnabled.12";
  }
  if (lower.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }

  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
