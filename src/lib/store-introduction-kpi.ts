import type { StoreIntroductionFormatKey } from "@/lib/types";
import { isStoreAllocationIntroductionSheet } from "@/lib/store-allocation-matching";
import {
  countChainStoreLocations,
  hasOfficialChainStoreMaster,
  type StoreLocationRecord,
} from "@/lib/store-location-groups";

export type ProductChainKpi = {
  jan: string;
  productName: string;
  productKey: string;
  chainName: string;
  fileName: string;
  importedAt: string;
  introducedCount: number;
  totalStoreCount: number;
  importTotalStoreCount: number;
  masterStoreCount: number | null;
  storeCountMismatch: boolean;
  penetrationRate: number | null;
  hasFullStoreList: boolean;
};

export type ProductChainKpiEntry = {
  jan: string;
  productName: string;
  productKey: string;
  chainName: string;
  isIntroduced: boolean;
};

export function summarizeProductChainKpis(
  entries: ProductChainKpiEntry[],
  formatKey: StoreIntroductionFormatKey,
): ProductChainKpi[] {
  const grouped = new Map<string, ProductChainKpiEntry[]>();

  entries.forEach((entry) => {
    const chainName = entry.chainName.trim();

    if (!chainName || chainName === "店舗不明") {
      return;
    }

    const key = `${chainName}::${entry.productKey}`;
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  });

  return Array.from(grouped.entries())
    .map(([key, productEntries]) => {
      const chainName = productEntries[0]?.chainName ?? "";
      const jan = productEntries[0]?.jan ?? "";
      const productName = productEntries[0]?.productName ?? "";
      const productKey = productEntries[0]?.productKey ?? "";
      const introducedCount = productEntries.filter((entry) => entry.isIntroduced).length;
      const importTotalStoreCount = productEntries.length;
      const hasImportStoreList =
        (formatKey === "flag-list" ||
          formatKey === "hands-allocation-list" ||
          formatKey === "store-allocation-list") &&
        importTotalStoreCount >= 5;

      return {
        jan,
        productName,
        productKey,
        chainName,
        fileName: "",
        importedAt: "",
        introducedCount,
        totalStoreCount: importTotalStoreCount,
        importTotalStoreCount,
        masterStoreCount: null,
        storeCountMismatch: false,
        penetrationRate:
          hasImportStoreList && importTotalStoreCount > 0
            ? Math.round((introducedCount / importTotalStoreCount) * 1000) / 10
            : null,
        hasFullStoreList: hasImportStoreList,
      };
    })
    .sort((left, right) => {
      const chainCompare = left.chainName.localeCompare(right.chainName, "ja");
      if (chainCompare !== 0) {
        return chainCompare;
      }

      return left.productName.localeCompare(right.productName, "ja");
    });
}

export function aggregateProductChainKpis(kpis: ProductChainKpi[]) {
  if (kpis.length === 0) {
    return null;
  }

  if (kpis.length === 1) {
    return kpis[0];
  }

  const introducedCount = kpis.reduce((sum, kpi) => sum + kpi.introducedCount, 0);
  const totalStoreCount = kpis.reduce((sum, kpi) => sum + kpi.totalStoreCount, 0);
  const hasFullStoreList = kpis.some((kpi) => kpi.hasFullStoreList);

  return {
    ...kpis[0],
    introducedCount,
    totalStoreCount,
    importTotalStoreCount: totalStoreCount,
    hasFullStoreList,
    penetrationRate:
      hasFullStoreList && totalStoreCount > 0
        ? Math.round((introducedCount / totalStoreCount) * 1000) / 10
        : null,
  };
}

export function shouldShowProductChainKpi(kpi: ProductChainKpi) {
  if (kpi.introducedCount > 0) {
    return true;
  }

  return kpi.hasFullStoreList && kpi.totalStoreCount >= 5;
}

export function detectIntroductionChainName(
  entries: { chainName?: string; matchedStoreName?: string; storeName?: string; storeCode?: string }[],
  formatKey: StoreIntroductionFormatKey,
  isLoftSeriesSheet: boolean,
  isHandsSeriesSheet = false,
): string {
  if (isLoftSeriesSheet) {
    return "ロフト";
  }

  if (isHandsSeriesSheet) {
    return "ハンズ";
  }

  if (isStoreAllocationIntroductionSheet(formatKey, entries)) {
    return "@cosme STORE";
  }

  const counts = new Map<string, number>();

  entries.forEach((entry) => {
    const name = (entry.chainName ?? entry.matchedStoreName ?? "").trim();

    if (!name || name === "店舗不明") {
      return;
    }

    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  const top = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0];

  return top?.[0] ?? "";
}

export function enrichProductChainKpisWithStoreMaster(
  kpis: ProductChainKpi[],
  storeLocations: StoreLocationRecord[],
): ProductChainKpi[] {
  return kpis.map((kpi) => enrichProductChainKpiWithStoreMaster(kpi, storeLocations));
}

export function enrichProductChainKpiWithStoreMaster(
  kpi: ProductChainKpi,
  storeLocations: StoreLocationRecord[],
): ProductChainKpi {
  if (!hasOfficialChainStoreMaster(kpi.chainName)) {
    return kpi;
  }

  const masterStoreCount = countChainStoreLocations(storeLocations, kpi.chainName);
  if (masterStoreCount <= 0) {
    return {
      ...kpi,
      masterStoreCount: null,
      storeCountMismatch: false,
    };
  }

  const totalStoreCount = masterStoreCount;
  const storeCountMismatch = false;

  return {
    ...kpi,
    masterStoreCount,
    totalStoreCount,
    storeCountMismatch,
    hasFullStoreList: true,
    penetrationRate:
      totalStoreCount > 0 ? Math.round((kpi.introducedCount / totalStoreCount) * 1000) / 10 : null,
  };
}

export function buildStoreCountMismatchWarning(
  chainName: string,
  importStoreCount: number,
  masterStoreCount: number,
) {
  if (!hasOfficialChainStoreMaster(chainName) || masterStoreCount <= 0) {
    return "";
  }

  if (importStoreCount === masterStoreCount) {
    return "";
  }

  return `取込ファイルの店舗数（${importStoreCount}店）と店舗マスタ（${masterStoreCount}店）が一致しません。導入率は店舗マスタ基準で計算します。`;
}

export function countUniqueIntroductionStores(
  entries: { storeName: string; storeCode?: string }[],
) {
  const keys = new Set<string>();

  entries.forEach((entry) => {
    const storeName = entry.storeName.trim();
    const storeCode = entry.storeCode?.trim() ?? "";
    keys.add(storeCode || storeName);
  });

  return keys.size;
}
