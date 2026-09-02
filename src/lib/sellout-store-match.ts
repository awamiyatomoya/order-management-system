import { hasOfficialChainStoreMaster } from "@/lib/official-chain-store-masters";
import {
  resolveStoreLocationMatch,
  type StoreLocation,
  type StoreLocationMatchOptions,
} from "@/lib/store-location-matching";

type SelloutStoreInput = Pick<StoreLocation, "storeCode" | "storeName">;

export function resolveImportedSelloutStore(
  entry: SelloutStoreInput,
  retailer: string,
  lookup: Parameters<typeof resolveStoreLocationMatch>[1],
  options?: StoreLocationMatchOptions,
) {
  if (hasOfficialChainStoreMaster(retailer)) {
    const matched = resolveStoreLocationMatch(
      {
        storeCode: entry.storeCode,
        storeName: entry.storeName,
        postalCode: "",
        address: "",
      },
      lookup,
      options,
    );

    return {
      storeCode: matched?.storeCode || entry.storeCode,
      storeName: entry.storeName,
      matchedStoreCode: matched?.storeCode || "",
      matchedStoreName: matched?.storeName || "",
    };
  }

  // 公式店舗マスタがないチェーンは、ロフト等の別チェーンに寄せない。
  // Excelの店名をそのままその店の名前として使う。
  return {
    storeCode: entry.storeCode,
    storeName: entry.storeName,
    matchedStoreCode: entry.storeCode,
    matchedStoreName: entry.storeName,
  };
}

export function findDuplicateSelloutImport<
  T extends { retailer: string; periodStart: string; periodEnd: string },
>(existing: T[], incoming: { retailer: string; periodStart: string; periodEnd: string }) {
  const retailer = incoming.retailer.trim();
  const periodStart = incoming.periodStart.trim();
  const periodEnd = incoming.periodEnd.trim();

  if (!retailer || !periodStart || !periodEnd) {
    return undefined;
  }

  return existing.find(
    (importBatch) =>
      importBatch.retailer.trim() === retailer &&
      importBatch.periodStart.trim() === periodStart &&
      importBatch.periodEnd.trim() === periodEnd,
  );
}

export function formatSelloutPeriodLabel(periodStart: string, periodEnd: string) {
  if (!periodStart && !periodEnd) {
    return "期間不明";
  }

  if (periodStart === periodEnd || !periodEnd) {
    return periodStart;
  }

  return `${periodStart} 〜 ${periodEnd}`;
}
