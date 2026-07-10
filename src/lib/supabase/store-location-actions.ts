"use server";

import { revalidatePath } from "next/cache";
import {
  countChainStoreLocations,
  countHandsStoreLocations,
  type StoreLocationRecord,
} from "@/lib/store-location-groups";
import {
  fetchOfficialChainStoreLocations,
  isOfficialStoreChainName,
  type OfficialStoreChainName,
} from "@/lib/official-chain-store-masters";
import type { StoreLocation } from "@/lib/store-location-matching";
import { listChainStoreLocationCodes } from "@/lib/store-location-sync";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

export type { OfficialStoreChainName } from "@/lib/official-chain-store-masters";

export async function readStoreLocationRecords(): Promise<StoreLocationRecord[]> {
  return readStoreLocationRecordsFromDb();
}

async function readStoreLocationRecordsFromDb(): Promise<StoreLocationRecord[]> {
  if (!hasSupabaseServerEnv()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const withChain = await supabase
    .from("store_locations")
    .select("store_code, store_name, postal_code, address, tel, chain_name")
    .order("store_name");

  let rows = withChain.data;

  if (withChain.error) {
    const withoutChain = await supabase
      .from("store_locations")
      .select("store_code, store_name, postal_code, address, tel")
      .order("store_name");

    if (withoutChain.error) {
      return [];
    }

    rows = (withoutChain.data ?? []).map((row) => ({
      ...row,
      chain_name: "",
    }));
  }

  return (rows ?? []).map((row) => mapStoreLocationRow(row));
}

function mapStoreLocationRow(row: {
  store_code: string;
  store_name: string;
  postal_code: string;
  address: string;
  tel: string;
  chain_name?: string | null;
}): StoreLocationRecord {
  const location = {
    storeCode: row.store_code,
    storeName: row.store_name,
    postalCode: row.postal_code,
    address: row.address,
    tel: row.tel,
    chainName: row.chain_name ?? "",
  };

  return {
    ...location,
    chainName: location.chainName || inferStoreLocationChainNameFromRecord(location),
  };
}

function inferStoreLocationChainNameFromRecord(
  location: Pick<StoreLocationRecord, "storeCode" | "storeName" | "chainName">,
) {
  if (location.chainName) {
    return location.chainName;
  }

  if (location.storeCode.startsWith("loft-") || /ロフト|loft/i.test(location.storeName)) {
    return "ロフト";
  }

  if (location.storeCode.startsWith("hands-") || /ハンズ|hands/i.test(location.storeName)) {
    return "ハンズ";
  }

  if (location.storeCode.startsWith("atcosme-") || /@cosme/i.test(location.storeName)) {
    return "@cosme STORE";
  }

  if (location.storeCode.startsWith("ainz-") || /アインズ|ainz/i.test(location.storeName)) {
    return "アインズ";
  }

  return "";
}

export async function upsertStoreLocationRecords(
  locations: (Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address" | "tel"> & {
    chainName?: string;
  })[],
): Promise<{ savedCount: number; error?: string }> {
  if (!hasSupabaseServerEnv()) {
    return { savedCount: 0, error: "Supabase環境変数が未設定です。" };
  }

  if (locations.length === 0) {
    return { savedCount: 0 };
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

  if (rows.length === 0) {
    return { savedCount: 0, error: "保存対象の店舗コードがありません。" };
  }

  const chunkSize = 25;
  let savedCount = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const upsertResult = await supabase.from("store_locations").upsert(chunk, {
      onConflict: "store_code",
    });

    if (upsertResult.error?.message?.includes("chain_name")) {
      const fallbackResult = await supabase.from("store_locations").upsert(
        chunk.map(({ chain_name: _chainName, ...row }) => row),
        { onConflict: "store_code" },
      );

      if (fallbackResult.error) {
        return { savedCount, error: fallbackResult.error.message };
      }

      savedCount += chunk.length;
      continue;
    }

    if (upsertResult.error) {
      return { savedCount, error: upsertResult.error.message };
    }

    savedCount += chunk.length;
  }

  return { savedCount };
}

async function deleteStoreLocationRecords(storeCodes: string[]): Promise<{ error?: string }> {
  if (!hasSupabaseServerEnv() || storeCodes.length === 0) {
    return {};
  }

  const supabase = createServerSupabaseClient();
  const chunkSize = 50;

  for (let index = 0; index < storeCodes.length; index += chunkSize) {
    const chunk = storeCodes.slice(index, index + chunkSize);
    const { error } = await supabase.from("store_locations").delete().in("store_code", chunk);

    if (error) {
      return { error: error.message };
    }
  }

  return {};
}

async function replaceOfficialChainStoreLocations(
  chainName: string,
  officialLocations: StoreLocation[],
): Promise<{ savedCount: number; removedCount: number; error?: string }> {
  const existingLocations = await readStoreLocationRecordsFromDb();
  const codesToRemove = listChainStoreLocationCodes(existingLocations, chainName);
  const removedCount = codesToRemove.length;

  if (codesToRemove.length > 0) {
    const deleteResult = await deleteStoreLocationRecords(codesToRemove);
    if (deleteResult.error) {
      return { savedCount: 0, removedCount: 0, error: deleteResult.error };
    }
  }

  const upsertResult = await upsertStoreLocationRecords(
    officialLocations.map((location) => ({
      ...location,
      chainName,
    })),
  );

  if (upsertResult.error) {
    return { savedCount: upsertResult.savedCount, removedCount, error: upsertResult.error };
  }

  return { savedCount: upsertResult.savedCount, removedCount };
}

async function finalizeOfficialChainSync(
  chainName: string,
  officialCount: number,
  removedCount: number,
): Promise<{ ok: boolean; message: string; count: number }> {
  const savedLocations = await readStoreLocationRecordsFromDb();
  const savedCount = countChainStoreLocations(savedLocations, chainName);

  if (savedCount === 0) {
    return {
      ok: false,
      message: `${chainName}公式サイトから ${officialCount}店舗を取得しましたが、店舗マスタへの保存を確認できませんでした。`,
      count: 0,
    };
  }

  revalidatePath("/store-introductions");
  revalidatePath("/stores");

  const removedLabel =
    removedCount > 0 ? ` 旧データ ${removedCount}件を整理しました。` : "";

  return {
    ok: true,
    message: `${chainName}公式サイトから ${savedCount}店舗の住所を取得しました。${removedLabel}`,
    count: savedCount,
  };
}

export async function previewOfficialChainStoreSync(chainName: OfficialStoreChainName): Promise<{
  ok: boolean;
  chainName: OfficialStoreChainName;
  currentCount: number;
  officialCount: number;
  newStoreCount: number;
  sampleStoreNames: string[];
  requiresConfirmation: boolean;
  message?: string;
}> {
  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      chainName,
      currentCount: 0,
      officialCount: 0,
      newStoreCount: 0,
      sampleStoreNames: [],
      requiresConfirmation: false,
      message: "Supabase未設定のため、店舗マスタを確認できません。",
    };
  }

  try {
    const existingLocations = await readStoreLocationRecordsFromDb();
    const existingCodes = new Set(listChainStoreLocationCodes(existingLocations, chainName));
    const currentCount = existingCodes.size;
    const officialLocations = await fetchOfficialChainStoreLocations(chainName);
    const newStores = officialLocations.filter((location) => !existingCodes.has(location.storeCode));

    return {
      ok: true,
      chainName,
      currentCount,
      officialCount: officialLocations.length,
      newStoreCount: newStores.length,
      sampleStoreNames: newStores.slice(0, 5).map((location) => location.storeName),
      requiresConfirmation: newStores.length > 0,
    };
  } catch (error) {
    return {
      ok: false,
      chainName,
      currentCount: 0,
      officialCount: 0,
      newStoreCount: 0,
      sampleStoreNames: [],
      requiresConfirmation: false,
      message: error instanceof Error ? error.message : "公式サイトの確認に失敗しました。",
    };
  }
}

export async function applyOfficialChainStoreSync(
  chainName: OfficialStoreChainName,
): Promise<{ ok: boolean; message: string; count: number }> {
  return ensureOfficialChainStoreLocationsFromOfficialSite(chainName);
}

export async function ensureOfficialChainStoreLocationsFromOfficialSite(
  chainName: OfficialStoreChainName,
): Promise<{ ok: boolean; message: string; count: number }> {
  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      message: `Supabase未設定のため、${chainName}店舗住所を保存できません。`,
      count: 0,
    };
  }

  try {
    const officialLocations = await fetchOfficialChainStoreLocations(chainName);
    const replaceResult = await replaceOfficialChainStoreLocations(chainName, officialLocations);

    if (replaceResult.error) {
      return {
        ok: false,
        message: `${chainName}店舗の保存に失敗しました: ${replaceResult.error}`,
        count: 0,
      };
    }

    return finalizeOfficialChainSync(chainName, officialLocations.length, replaceResult.removedCount);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `${chainName}店舗住所の取得に失敗しました。`,
      count: 0,
    };
  }
}

export async function ensureHandsStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  return ensureOfficialChainStoreLocationsFromOfficialSite("ハンズ");
}

export async function ensureLoftStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  return ensureOfficialChainStoreLocationsFromOfficialSite("ロフト");
}

export async function ensureAtCosmeStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  return ensureOfficialChainStoreLocationsFromOfficialSite("@cosme STORE");
}

export async function ensureAinzStoreLocationsFromOfficialSite(): Promise<{
  ok: boolean;
  message: string;
  count: number;
}> {
  return ensureOfficialChainStoreLocationsFromOfficialSite("アインズ");
}

export async function readStoreLocationRecordsWithHandsAutoSync(): Promise<StoreLocationRecord[]> {
  let locations = await readStoreLocationRecordsFromDb();

  if (countHandsStoreLocations(locations) === 0) {
    const result = await ensureHandsStoreLocationsFromOfficialSite();
    if (result.ok && result.count > 0) {
      locations = await readStoreLocationRecordsFromDb();
    }
  }

  return locations;
}
