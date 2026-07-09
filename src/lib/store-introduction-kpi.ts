import type { StoreIntroductionFormatKey } from "@/lib/types";

export type ProductChainKpi = {
  jan: string;
  productName: string;
  chainName: string;
  introducedCount: number;
  totalStoreCount: number;
  penetrationRate: number | null;
  hasFullStoreList: boolean;
};

export type ProductChainKpiEntry = {
  jan: string;
  productName: string;
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

    const key = `${chainName}::${entry.jan}::${entry.productName}`;
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  });

  return Array.from(grouped.entries())
    .map(([key, productEntries]) => {
      const chainName = productEntries[0]?.chainName ?? "";
      const jan = productEntries[0]?.jan ?? "";
      const productName = productEntries[0]?.productName ?? key.split("::").slice(2).join("::");
      const introducedCount = productEntries.filter((entry) => entry.isIntroduced).length;
      const totalStoreCount = productEntries.length;
      const hasFullStoreList =
        (formatKey === "flag-list" || formatKey === "hands-allocation-list") && totalStoreCount >= 5;

      return {
        jan,
        productName,
        chainName,
        introducedCount,
        totalStoreCount,
        penetrationRate:
          hasFullStoreList && totalStoreCount > 0
            ? Math.round((introducedCount / totalStoreCount) * 1000) / 10
            : null,
        hasFullStoreList,
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

export function detectIntroductionChainName(
  entries: { chainName?: string; matchedStoreName?: string }[],
  isLoftSeriesSheet: boolean,
  isHandsSeriesSheet = false,
): string {
  if (isLoftSeriesSheet) {
    return "ロフト";
  }

  if (isHandsSeriesSheet) {
    return "ハンズ";
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
