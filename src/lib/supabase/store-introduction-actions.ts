"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import {
  buildPromotionalAddressBook,
  parseStoreIntroductionWorkbook,
  resolveIntroductionDisplayProduct,
  resolveIntroductionProduct,
  summarizeStoreIntroduction,
  unifyIntroductionBatchProduct,
  countWorkbookAddressBookEntries,
  mergeAinzIntroductionEntriesWithStoreMaster,
  loadAinzAddressBookFromBuffer,
} from "@/lib/store-introduction-parsers";
import {
  detectIntroductionChainName,
} from "@/lib/store-introduction-kpi";
import {
  ensureAinzStoreLocationsFromOfficialSite,
  ensureOfficialChainStoreLocationsFromOfficialSite,
  readStoreLocationRecords,
  upsertStoreLocationRecords,
} from "@/lib/supabase/store-location-actions";
import { hasOfficialChainStoreMaster } from "@/lib/official-chain-store-masters";
import type { OfficialStoreChainName } from "@/lib/official-chain-store-masters";
import {
  buildStoreLocationLookup,
  resolveStoreLocationAddress,
  resolveStoreLocationMatch,
  type StoreLocation,
} from "@/lib/store-location-matching";
import {
  getMatchedStoreNameForIntroduction,
  isAtCosmeSeriesIntroductionSheet,
  isAinzSeriesIntroductionSheet,
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

  const fileBuffer = await file.arrayBuffer();
  await upsertStoreLocationsFromWorkbook(fileBuffer);
  const savedAddressCount = countWorkbookAddressBookEntries(fileBuffer);

  try {
    parsed = parseStoreIntroductionWorkbook(fileBuffer);
  } catch (error) {
    if (savedAddressCount >= 5) {
      revalidatePath("/store-introductions");
      revalidatePath("/stores");
      return {
        ok: false,
        message:
          "住所録Excelは店舗マスタには保存しません（公式サイトを正とします）。導入データを取り込むには送り込みリスト等の導入Excelをアップロードしてください。",
      };
    }

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

  if (parsed.formatKey === "ainz-shipment-list") {
    await ensureAinzStoreLocationsFromOfficialSite();
    const storeLocations = await readStoreLocationRecords();
    const ainzAddressBook = loadAinzAddressBookFromBuffer(fileBuffer);
    parsed = {
      ...parsed,
      entries: mergeAinzIntroductionEntriesWithStoreMaster(
        parsed.entries,
        storeLocations,
        ainzAddressBook,
      ),
    };
  }

  const unified = unifyIntroductionBatchProduct(parsed.entries, clientId, products);
  parsed = {
    ...parsed,
    entries: unified.entries,
  };

  const importWarnings = [...unified.warnings];

  const summary = summarizeStoreIntroduction(parsed.entries);
  const isLoftSeriesSheet = isLoftSeriesIntroductionSheet(parsed.formatKey, parsed.entries);
  const isHandsSeriesSheet = isHandsSeriesIntroductionSheet(parsed.formatKey, parsed.entries);
  const isAtCosmeSeriesSheet = isAtCosmeSeriesIntroductionSheet(parsed.formatKey, parsed.entries);
  const isAinzSeriesSheet = isAinzSeriesIntroductionSheet(parsed.formatKey, parsed.entries);

  const storeLocations = await loadStoreLocationsForIntroduction({
    isHandsSeriesSheet,
    isLoftSeriesSheet,
    isAtCosmeSeriesSheet,
    isAinzSeriesSheet,
    entries: [],
  });
  const storeLocationLookup = buildStoreLocationLookup(storeLocations);

  if (isHandsSeriesSheet || isLoftSeriesSheet || isAtCosmeSeriesSheet || isAinzSeriesSheet) {
    const unmatchedStoreNames = new Set<string>();

    parsed.entries.forEach((entry) => {
      if (!resolveStoreLocationMatch(entry, storeLocationLookup)) {
        unmatchedStoreNames.add(entry.storeName.trim() || entry.storeCode || "店舗不明");
      }
    });

    if (unmatchedStoreNames.size > 0) {
      const chainLabel = isHandsSeriesSheet
        ? "ハンズ"
        : isLoftSeriesSheet
          ? "ロフト"
          : isAtCosmeSeriesSheet
            ? "@cosme STORE"
            : "アインズ";
      importWarnings.push(
        `${chainLabel}公式店舗マスタと照合できない店舗が${unmatchedStoreNames.size}件あります（${Array.from(unmatchedStoreNames).slice(0, 3).join("、")}${unmatchedStoreNames.size > 3 ? " ほか" : ""}）。「公式サイトから更新」で店舗マスタを同期してください。`,
      );
    }
  }

  const importId = createId();
  const importedAt = new Date().toISOString();
  const entries: StoreIntroductionEntry[] = parsed.entries.map((entry) => {
    const resolvedProduct = resolveIntroductionProduct(entry.jan, entry.productName, clientId, products);
    const displayProduct = resolveIntroductionDisplayProduct(
      resolvedProduct.jan,
      resolvedProduct.productName,
      clientId,
      products,
    );
    const matchedLocation = resolveStoreLocationMatch(entry, storeLocationLookup);
    const enrichedAddress = resolveStoreLocationAddress(entry, storeLocationLookup);

    return {
      id: createId(),
      importId,
      clientId,
      jan: displayProduct.jan,
      productName: displayProduct.productName,
      storeName: matchedLocation?.storeName || entry.storeName,
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
        isAinzSeriesSheet,
      ),
    };
  });

  const chainName = detectIntroductionChainName(
    entries,
    parsed.formatKey,
    isLoftSeriesSheet,
    isHandsSeriesSheet,
    isAinzSeriesSheet,
  );

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

  await upsertStoreLocationsFromEntries(parsed.entries, {
    formatKey: parsed.formatKey,
    chainName,
    skipOfficialChainSync: isLoftSeriesSheet || isHandsSeriesSheet || isAtCosmeSeriesSheet,
  });

  revalidatePath("/store-introductions");
  revalidatePath("/stores");

  const formatLabel =
    parsed.formatKey === "row-list"
      ? "店舗一覧表"
      : parsed.formatKey === "promotional-address-list"
        ? "住所録"
        : parsed.formatKey === "ainz-shipment-list"
          ? "アインズ送り込みリスト"
          : parsed.formatKey === "hands-allocation-list"
            ? "ハンズ按分表"
            : parsed.formatKey === "store-allocation-list"
              ? "店舗割振表"
              : "0/1フラグ表";
  const chainLabel = chainName ? `${chainName} / ` : "";
  const sheetLabel = parsed.sheetCount > 1 ? `${parsed.sheetCount}シート / ` : "";
  const warningLabel = importWarnings.length > 0 ? ` ${importWarnings.join(" ")}` : "";

  return {
    ok: true,
    savedToSupabase: true,
    importBatch,
    entries,
    message: `${formatLabel}として取り込みました。${chainLabel}${sheetLabel}導入 ${summary.introducedStoreCount}店舗 / 全${summary.totalStoreCount}店舗（JAN ${summary.jans.length}件）。${warningLabel}`,
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

  const mappedImports = imports.map(mapStoreIntroductionImport);
  const latestImportIds = getLatestImportIdsByChain(mappedImports);
  const { data: entries, error: entriesError } = await supabase
    .from("store_introduction_entries")
    .select(
      "id, import_id, client_id, jan, product_name, store_name, store_code, address, postal_code, is_introduced, matched_store_name",
    )
    .in("import_id", latestImportIds)
    .order("store_name");

  if (entriesError) {
    return {
      imports: mappedImports,
      entries: [] as StoreIntroductionEntry[],
    };
  }

  return {
    imports: mappedImports,
    entries: await enrichStoreIntroductionEntriesWithLocations(
      (entries ?? []).map(mapStoreIntroductionEntry),
    ),
  };
}

function getLatestImportIdsByChain(imports: StoreIntroductionImport[]) {
  const latestImportIdByChain = new Map<string, string>();

  imports.forEach((importBatch) => {
    const chainName = importBatch.chainName.trim();
    if (chainName && !latestImportIdByChain.has(chainName)) {
      latestImportIdByChain.set(chainName, importBatch.id);
    }
  });

  const importIds = Array.from(latestImportIdByChain.values());
  if (importIds.length > 0) {
    return importIds;
  }

  return imports[0] ? [imports[0].id] : [];
}

export async function syncHandsStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  return ensureOfficialChainStoreLocationsFromOfficialSite("ハンズ");
}

export async function syncLoftStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  return ensureOfficialChainStoreLocationsFromOfficialSite("ロフト");
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
  const lookup = buildStoreLocationLookup(await readStoreLocationRecords());

  return entries.map((entry) => {
    const matched = resolveStoreLocationMatch(entry, lookup);
    const address = resolveStoreLocationAddress(entry, lookup);

    if (!address && !matched?.postalCode) {
      return entry;
    }

    return {
      ...entry,
      address: address || entry.address,
      postalCode: matched?.postalCode || entry.postalCode,
    };
  });
}

async function loadStoreLocationsForIntroduction({
  isHandsSeriesSheet = false,
  isLoftSeriesSheet = false,
  isAtCosmeSeriesSheet = false,
  isAinzSeriesSheet = false,
  entries = [],
}: {
  isHandsSeriesSheet?: boolean;
  isLoftSeriesSheet?: boolean;
  isAtCosmeSeriesSheet?: boolean;
  isAinzSeriesSheet?: boolean;
  entries?: StoreIntroductionEntry[];
} = {}): Promise<StoreLocation[]> {
  let locations = await readStoreLocations();
  const chainsToSync = new Set<OfficialStoreChainName>();

  if (
    isHandsSeriesSheet ||
    entries.some(
      (entry) =>
        entry.matchedStoreName === "ハンズ" ||
        entry.storeName.normalize("NFKC").toLowerCase().startsWith("hb") ||
        entry.storeName.includes("ｈｂ"),
    )
  ) {
    chainsToSync.add("ハンズ");
  }

  if (isLoftSeriesSheet || entries.some((entry) => entry.matchedStoreName === "ロフト")) {
    chainsToSync.add("ロフト");
  }

  if (isAtCosmeSeriesSheet || entries.some((entry) => entry.matchedStoreName === "@cosme STORE")) {
    chainsToSync.add("@cosme STORE");
  }

  if (isAinzSeriesSheet || entries.some((entry) => entry.matchedStoreName === "アインズ")) {
    chainsToSync.add("アインズ");
  }

  for (const chainName of chainsToSync) {
    try {
      await ensureOfficialChainStoreLocationsFromOfficialSite(chainName);
      locations = await readStoreLocations();
    } catch {
      // 公式サイト取得に失敗しても、DB上の既存住所で続行する。
    }
  }

  return locations;
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

  const isAinzAddressBook =
    workbook.SheetNames.some((sheetName) => /アインズ|ｱｲﾝｽﾞ/.test(sheetName)) ||
    locations.some((entry) => /アインズ|ainz/i.test(entry.storeName));

  const addressBookChainName = isAinzAddressBook
    ? "アインズ"
    : workbook.SheetNames.some((sheetName) => /インキューブ|incube/i.test(sheetName)) ||
        locations.some((entry) => /インキューブ|incube/i.test(entry.storeName))
      ? "インキューブ"
      : "";

  if (addressBookChainName && hasOfficialChainStoreMaster(addressBookChainName)) {
    return;
  }

  await upsertStoreLocationRecords(
    locations.map((entry) => ({
      ...entry,
      chainName: addressBookChainName || undefined,
    })),
  );
}

async function upsertStoreLocationsFromEntries(
  entries: { storeCode: string; storeName: string; postalCode: string; address: string }[],
  options: {
    formatKey: StoreIntroductionImport["formatKey"];
    chainName: string;
    skipOfficialChainSync?: boolean;
  },
) {
  if (options.skipOfficialChainSync || hasOfficialChainStoreMaster(options.chainName)) {
    return;
  }

  const locations = entries.filter((entry) => entry.address.trim());
  if (locations.length === 0) {
    return;
  }

  await upsertStoreLocationRecords(
    locations.map((entry) => ({
      storeCode: entry.storeCode,
      storeName: entry.storeName,
      postalCode: entry.postalCode,
      address: entry.address,
      tel: "",
      chainName: options.chainName,
    })),
  );
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
