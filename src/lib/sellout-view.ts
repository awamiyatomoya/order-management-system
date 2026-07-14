import type { SelloutEntry } from "@/lib/types";

export type SelloutMonthlyRow = {
  month: string;
  retailer: string;
  storeName: string;
  jan: string;
  productName: string;
  qty: number;
  amount: number;
};

export type SelloutChartRow = {
  label: string;
  qty: number;
  amount: number;
};

export type SelloutFilters = {
  retailer: string;
  storeName: string;
  productName: string;
  jan: string;
};

export function getSelloutMonthLabel(entry: Pick<SelloutEntry, "periodStart" | "periodEnd">) {
  const source = entry.periodEnd || entry.periodStart;
  if (!source) {
    return "不明";
  }

  const [year, month] = source.split("-");
  if (!year || !month) {
    return source;
  }

  return `${year}年${Number(month)}月`;
}

export function getSelloutDisplayStoreName(entry: Pick<SelloutEntry, "storeName" | "matchedStoreName">) {
  return entry.matchedStoreName || entry.storeName || "店舗不明";
}

export function getSelloutMonthKey(entry: Pick<SelloutEntry, "periodStart" | "periodEnd">) {
  const source = entry.periodEnd || entry.periodStart;
  if (!source) {
    return "";
  }

  const [year, month] = source.split("-");
  if (!year || !month) {
    return source;
  }

  return `${year}-${month.padStart(2, "0")}`;
}

export function filterSelloutEntries(entries: SelloutEntry[], filters: SelloutFilters) {
  return entries.filter((entry) => {
    if (filters.retailer !== "all" && entry.retailer !== filters.retailer) {
      return false;
    }

    const storeName = getSelloutDisplayStoreName(entry);
    if (filters.storeName !== "all" && storeName !== filters.storeName) {
      return false;
    }

    if (filters.productName !== "all" && entry.productName !== filters.productName) {
      return false;
    }

    if (filters.jan !== "all" && entry.jan !== filters.jan) {
      return false;
    }

    return true;
  });
}

export function buildSelloutMonthlyRows(entries: SelloutEntry[]): SelloutMonthlyRow[] {
  const rowsByKey = new Map<string, SelloutMonthlyRow>();

  entries.forEach((entry) => {
    const month = getSelloutMonthLabel(entry);
    const storeName = getSelloutDisplayStoreName(entry);
    const key = `${month}|${entry.retailer}|${storeName}|${entry.jan}`;

    const current = rowsByKey.get(key) ?? {
      month,
      retailer: entry.retailer,
      storeName,
      jan: entry.jan,
      productName: entry.productName,
      qty: 0,
      amount: 0,
    };

    rowsByKey.set(key, {
      ...current,
      qty: current.qty + entry.qty,
      amount: current.amount + entry.amount,
    });
  });

  return Array.from(rowsByKey.values()).sort((a, b) => {
    const monthCompare = b.month.localeCompare(a.month, "ja");
    if (monthCompare !== 0) {
      return monthCompare;
    }

    const retailerCompare = a.retailer.localeCompare(b.retailer, "ja");
    if (retailerCompare !== 0) {
      return retailerCompare;
    }

    const storeCompare = a.storeName.localeCompare(b.storeName, "ja");
    if (storeCompare !== 0) {
      return storeCompare;
    }

    return a.jan.localeCompare(b.jan, "ja");
  });
}

export function buildSelloutMonthlyChartRows(entries: SelloutEntry[]): SelloutChartRow[] {
  const rowsByMonth = new Map<string, SelloutChartRow>();

  entries.forEach((entry) => {
    const monthKey = getSelloutMonthKey(entry);
    if (!monthKey) {
      return;
    }

    const current = rowsByMonth.get(monthKey) ?? {
      label: monthKey,
      qty: 0,
      amount: 0,
    };

    rowsByMonth.set(monthKey, {
      ...current,
      qty: current.qty + entry.qty,
      amount: current.amount + entry.amount,
    });
  });

  return Array.from(rowsByMonth.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function buildSelloutProductChartRows(entries: SelloutEntry[]): SelloutChartRow[] {
  const rowsByProduct = new Map<string, SelloutChartRow>();

  entries.forEach((entry) => {
    const label = entry.productName || entry.jan || "商品不明";
    const current = rowsByProduct.get(label) ?? {
      label,
      qty: 0,
      amount: 0,
    };

    rowsByProduct.set(label, {
      ...current,
      qty: current.qty + entry.qty,
      amount: current.amount + entry.amount,
    });
  });

  return Array.from(rowsByProduct.values())
    .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, "ja"))
    .slice(0, 8);
}

export function buildSelloutFilterOptions(entries: SelloutEntry[], filters: SelloutFilters) {
  const retailerScoped = filterSelloutEntries(entries, {
    retailer: filters.retailer,
    storeName: "all",
    productName: "all",
    jan: "all",
  });
  const storeScoped = filterSelloutEntries(entries, {
    ...filters,
    productName: "all",
    jan: "all",
  });
  const productScoped = filterSelloutEntries(entries, {
    ...filters,
    jan: "all",
  });

  return {
    retailers: uniqueSorted(entries.map((entry) => entry.retailer).filter(Boolean)),
    stores: uniqueSorted(storeScoped.map((entry) => getSelloutDisplayStoreName(entry))),
    products: uniqueSorted(productScoped.map((entry) => entry.productName).filter(Boolean)),
    jans: uniqueSorted(productScoped.map((entry) => entry.jan).filter(Boolean)),
    retailerScopedCount: retailerScoped.length,
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "ja"));
}
