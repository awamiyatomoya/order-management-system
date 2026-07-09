"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import {
  buildPromotionalAddressBook,
  parseStoreIntroductionWorkbook,
  resolveIntroductionProduct,
  summarizeStoreIntroduction,
} from "@/lib/store-introduction-parsers";
import { detectIntroductionChainName } from "@/lib/store-introduction-kpi";
import {
  fetchHandsStoreLocationsFromOfficialSite,
  mergeHandsLocationsWithExisting,
} from "@/lib/hands-store-locations";
import {
  fetchLoftStoreLocationsFromOfficialSite,
  mergeLoftLocationsWithExisting,
} from "@/lib/loft-store-locations";
import {
  buildStoreLocationLookup,
  resolveStoreLocationAddress,
  resolveStoreLocationMatch,
  type StoreLocation,
} from "@/lib/store-location-matching";
import {
  getMatchedStoreNameForIntroduction,
  isHandsSeriesIntroductionSheet,
  isLoftSeriesIntroductionSheet,
} from "@/lib/store-matching";
import type { Product, Store, StoreIntroductionEntry, StoreIntroductionImport } from "@/lib/types";
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
  const productsJson = String(formData.get("productsJson") ?? "[]");

  let stores: Store[] = [];
  let products: Product[] = [];

  try {
    stores = JSON.parse(storesJson) as Store[];
  } catch {
    stores = [];
  }

  try {
    products = JSON.parse(productsJson) as Product[];
  } catch {
    products = [];
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
    await upsertStoreLocationsFromWorkbook(fileBuffer);
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
  const isLoftSeriesSheet = isLoftSeriesIntroductionSheet(parsed.formatKey, parsed.entries);
  const isHandsSeriesSheet = isHandsSeriesIntroductionSheet(parsed.formatKey, parsed.entries);

  if (isLoftSeriesSheet) {
    await syncLoftStoreLocationsFromOfficialSite();
  }

  if (isHandsSeriesSheet) {
    await syncHandsStoreLocationsFromOfficialSite();
  }

  const storeLocationLookup = buildStoreLocationLookup(await readStoreLocations());
  const importId = createId();
  const importedAt = new Date().toISOString();
  const entries: StoreIntroductionEntry[] = parsed.entries.map((entry) => {
    const resolvedProduct = resolveIntroductionProduct(entry.jan, entry.productName, clientId, products);
    const matchedLocation = resolveStoreLocationMatch(entry, storeLocationLookup);
    const enrichedAddress = resolveStoreLocationAddress(entry, storeLocationLookup);

    return {
      id: createId(),
      importId,
      clientId,
      jan: resolvedProduct.jan,
      productName: resolvedProduct.productName,
      storeName: entry.storeName,
      storeCode: entry.storeCode,
      address: enrichedAddress || entry.address,
      postalCode: matchedLocation?.postalCode || entry.postalCode,
      isIntroduced: entry.isIntroduced,
      matchedStoreName: getMatchedStoreNameForIntroduction(
        entry,
        parsed.formatKey,
        stores,
        isLoftSeriesSheet,
        isHandsSeriesSheet,
      ),
    };
  });

  const chainName = detectIntroductionChainName(entries, isLoftSeriesSheet, isHandsSeriesSheet);

  const importBatch: StoreIntroductionImport = {
    id: importId,
    clientId,
    fileName: file.name,
    formatKey: parsed.formatKey,
    importedAt,
    totalStoreCount: summary.totalStoreCount,
    introducedStoreCount: summary.introducedStoreCount,
    chainName,
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
    chain_name: importBatch.chainName,
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

  await upsertStoreLocationsFromEntries(parsed.entries);

  revalidatePath("/store-introductions");
  revalidatePath("/stores");

  const formatLabel =
    parsed.formatKey === "row-list"
      ? "店舗一覧表"
      : parsed.formatKey === "hands-allocation-list"
        ? "ハンズ按分表"
        : "0/1フラグ表";
  const chainLabel = chainName ? `${chainName} / ` : "";
  const sheetLabel = parsed.sheetCount > 1 ? `${parsed.sheetCount}シート / ` : "";

  return {
    ok: true,
    savedToSupabase: true,
    importBatch,
    entries,
    message: `${formatLabel}として取り込みました。${chainLabel}${sheetLabel}導入 ${summary.introducedStoreCount}店舗 / 全${summary.totalStoreCount}店舗（JAN ${summary.jans.length}件）。`,
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
    .select("id, client_id, file_name, format_key, imported_at, total_store_count, introduced_store_count, chain_name")
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
    entries: await enrichStoreIntroductionEntriesWithLocations(
      (entries ?? []).map(mapStoreIntroductionEntry),
    ),
  };
}

export async function syncHandsStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: "Supabase未設定のため、ハンズ店舗住所を保存できません。",
      count: 0,
    };
  }

  try {
    const handsLocations = await fetchHandsStoreLocationsFromOfficialSite();
    const existingLocations = await readStoreLocations();
    const mergedLocations = mergeHandsLocationsWithExisting(handsLocations, existingLocations);

    await upsertStoreLocations(
      mergedLocations.map((location) => ({
        ...location,
        chainName: "ハンズ",
      })),
    );

    revalidatePath("/store-introductions");
    revalidatePath("/stores");

    return {
      ok: true,
      message: `ハンズ公式サイトから ${mergedLocations.length}店舗の住所を取得しました。`,
      count: mergedLocations.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "ハンズ店舗住所の取得に失敗しました。",
      count: 0,
    };
  }
}

export async function syncLoftStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: "Supabase未設定のため、ロフト店舗住所を保存できません。",
      count: 0,
    };
  }

  try {
    const loftLocations = await fetchLoftStoreLocationsFromOfficialSite();
    const existingLocations = await readStoreLocations();
    const mergedLocations = mergeLoftLocationsWithExisting(loftLocations, existingLocations);

    await upsertStoreLocations(
      mergedLocations.map((location) => ({
        ...location,
        chainName: "ロフト",
      })),
    );

    revalidatePath("/store-introductions");
    revalidatePath("/stores");

    return {
      ok: true,
      message: `ロフト公式サイトから ${mergedLocations.length}店舗の住所を取得しました。`,
      count: mergedLocations.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "ロフト店舗住所の取得に失敗しました。",
      count: 0,
    };
  }
}

async function readStoreLocations(): Promise<StoreLocation[]> {
  if (!hasSupabaseServerEnv()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("store_locations")
    .select("store_code, store_name, postal_code, address, tel")
    .order("store_name");

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => ({
    storeCode: row.store_code,
    storeName: row.store_name,
    postalCode: row.postal_code,
    address: row.address,
    tel: row.tel,
  }));
}

async function enrichStoreIntroductionEntriesWithLocations(
  entries: StoreIntroductionEntry[],
): Promise<StoreIntroductionEntry[]> {
  const lookup = buildStoreLocationLookup(await readStoreLocations());

  return entries.map((entry) => {
    const address = resolveStoreLocationAddress(entry, lookup);

    if (!address || address === entry.address) {
      return entry;
    }

    return {
      ...entry,
      address,
    };
  });
}

async function upsertStoreLocationsFromWorkbook(fileBuffer: ArrayBuffer) {
  if (!hasSupabaseServerEnv()) {
    return;
  }

  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const addressBook = buildPromotionalAddressBook(workbook);
  const locations = Array.from(addressBook.values()).filter(
    (entry) => entry.storeCode && entry.address.trim(),
  );

  if (locations.length === 0) {
    return;
  }

  await upsertStoreLocations(locations);
}

async function upsertStoreLocationsFromEntries(
  entries: { storeCode: string; storeName: string; postalCode: string; address: string }[],
) {
  const locations = entries.filter((entry) => entry.address.trim());
  if (locations.length === 0) {
    return;
  }

  await upsertStoreLocations(
    locations.map((entry) => ({
      storeCode: entry.storeCode,
      storeName: entry.storeName,
      postalCode: entry.postalCode,
      address: entry.address,
      tel: "",
    })),
  );
}

async function upsertStoreLocations(
  locations: (Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address" | "tel"> & {
    chainName?: string;
  })[],
) {
  if (!hasSupabaseServerEnv() || locations.length === 0) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const rows = locations
    .filter((location) => location.storeCode)
    .map((location) => {
      const row: Record<string, string> = {
        store_code: location.storeCode,
        store_name: location.storeName,
        postal_code: location.postalCode,
        address: location.address,
        tel: location.tel,
      };

      if (location.chainName) {
        row.chain_name = location.chainName;
      }

      return row;
    });

  const upsertResult = await supabase.from("store_locations").upsert(rows, {
    onConflict: "store_code",
  });

  if (upsertResult.error?.message?.includes("chain_name")) {
    await supabase.from("store_locations").upsert(
      rows.map(({ chain_name: _chainName, ...row }) => row),
      { onConflict: "store_code" },
    );
  }
}

function mapStoreIntroductionImport(row: {
  id: string;
  client_id: string;
  file_name: string;
  format_key: StoreIntroductionImport["formatKey"];
  imported_at: string;
  total_store_count: number;
  introduced_store_count: number;
  chain_name?: string;
}): StoreIntroductionImport {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    formatKey: row.format_key,
    importedAt: row.imported_at,
    totalStoreCount: row.total_store_count,
    introducedStoreCount: row.introduced_store_count,
    chainName: row.chain_name ?? "",
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
