import type { SelloutEntry } from "@/lib/types";

export type SelloutMonthlyRow = {
  monthKey: string;
  month: string;
  retailer: string;
  storeKey: string;
  storeName: string;
  isStoreMatched: boolean;
  jan: string;
  productName: string;
  qty: number;
  amount: number;
};

export type SelloutStoreProductTotals = Map<string, { qty: number; amount: number }>;

export type SelloutSummary = {
  storeCount: number;
  totalQty: number;
  totalAmount: number;
  averageAmountPerStore: number;
  averageQtyPerStore: number;
};

export type SelloutChartRow = {
  label: string;
  qty: number;
  amount: number;
};

export type SelloutFilters = {
  retailer: string;
  storeName: string;
  productSearch: string;
  year: string;
  month: string;
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

/** 表示はマスタ解決後の店名のみ。Excelの生値は「照合できた」ように見えるので出さない。 */
export function getSelloutDisplayStoreName(entry: Pick<SelloutEntry, "matchedStoreName">) {
  return entry.matchedStoreName || "店舗不明";
}

/** 未照合の店舗どうしが「店舗不明」で1行に混ざらないようにするための行の識別子 */
export function getSelloutStoreKey(
  entry: Pick<SelloutEntry, "matchedStoreCode" | "storeCode" | "storeName">,
) {
  return entry.matchedStoreCode || entry.storeCode || entry.storeName;
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

export function getLatestSelloutYearMonth(entries: SelloutEntry[]) {
  const keys = entries
    .map((entry) => getSelloutMonthKey(entry))
    .filter((key) => /^\d{4}-\d{2}$/.test(key))
    .sort((a, b) => a.localeCompare(b));

  const latest = keys[keys.length - 1];
  if (!latest) {
    return null;
  }

  return {
    year: latest.slice(0, 4),
    month: String(Number(latest.slice(5))),
  };
}

export function filterSelloutEntries(entries: SelloutEntry[], filters: SelloutFilters) {
  const storeQuery = filters.storeName.trim().toLowerCase();
  const productQuery = filters.productSearch.trim().toLowerCase();
  const monthFilter = filters.month === "all" ? "" : filters.month.padStart(2, "0");

  return entries.filter((entry) => {
    if (filters.retailer !== "all" && entry.retailer !== filters.retailer) {
      return false;
    }

    const storeName = getSelloutDisplayStoreName(entry);
    if (storeQuery && !storeName.toLowerCase().includes(storeQuery)) {
      return false;
    }

    if (productQuery) {
      const productName = entry.productName.toLowerCase();
      const jan = entry.jan.toLowerCase();
      if (!productName.includes(productQuery) && !jan.includes(productQuery)) {
        return false;
      }
    }

    const monthKey = getSelloutMonthKey(entry);
    if (filters.year !== "all" && !monthKey.startsWith(`${filters.year}-`)) {
      return false;
    }

    if (monthFilter && !monthKey.endsWith(`-${monthFilter}`)) {
      return false;
    }

    return true;
  });
}

export function buildSelloutMonthlyRows(entries: SelloutEntry[]): SelloutMonthlyRow[] {
  const rowsByKey = new Map<string, SelloutMonthlyRow>();

  entries.forEach((entry) => {
    const month = getSelloutMonthLabel(entry);
    const monthKey = getSelloutMonthKey(entry);
    const storeName = getSelloutDisplayStoreName(entry);
    const storeKey = getSelloutStoreKey(entry);
    const key = `${month}|${entry.retailer}|${storeKey}|${entry.jan}`;

    const current = rowsByKey.get(key) ?? {
      monthKey,
      month,
      retailer: entry.retailer,
      storeKey,
      storeName,
      isStoreMatched: Boolean(entry.matchedStoreName),
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
    const amountCompare = b.amount - a.amount;
    if (amountCompare !== 0) {
      return amountCompare;
    }

    const qtyCompare = b.qty - a.qty;
    if (qtyCompare !== 0) {
      return qtyCompare;
    }

    const storeCompare = a.storeName.localeCompare(b.storeName, "ja");
    if (storeCompare !== 0) {
      return storeCompare;
    }

    return a.jan.localeCompare(b.jan, "ja");
  });
}

export function summarizeSelloutMonthlyRows(rows: SelloutMonthlyRow[]): SelloutSummary {
  const storeCount = new Set(rows.map((row) => row.storeKey)).size;
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return {
    storeCount,
    totalQty,
    totalAmount,
    averageAmountPerStore: storeCount > 0 ? Math.round(totalAmount / storeCount) : 0,
    averageQtyPerStore: storeCount > 0 ? Math.round((totalQty / storeCount) * 100) / 100 : 0,
  };
}

/** 店舗×商品×年月ごとの合計。前月比の参照元に使う。 */
export function buildSelloutMonthlyTotals(entries: SelloutEntry[]): SelloutStoreProductTotals {
  const totals: SelloutStoreProductTotals = new Map();

  entries.forEach((entry) => {
    const monthKey = getSelloutMonthKey(entry);
    if (!monthKey) {
      return;
    }

    const key = buildSelloutTotalsKey(
      monthKey,
      entry.retailer,
      getSelloutStoreKey(entry),
      entry.jan,
    );
    const current = totals.get(key) ?? { qty: 0, amount: 0 };

    totals.set(key, {
      qty: current.qty + entry.qty,
      amount: current.amount + entry.amount,
    });
  });

  return totals;
}

export function getPreviousSelloutMonthKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;

  return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
}

/** 前月に同じ店舗×商品の実績がなければ null（0件と前月データなしを区別する） */
export function getSelloutPreviousMonthTotals(
  row: Pick<SelloutMonthlyRow, "monthKey" | "retailer" | "storeKey" | "jan">,
  totals: SelloutStoreProductTotals,
) {
  const previousMonthKey = getPreviousSelloutMonthKey(row.monthKey);
  if (!previousMonthKey) {
    return null;
  }

  const key = buildSelloutTotalsKey(previousMonthKey, row.retailer, row.storeKey, row.jan);
  return totals.get(key) ?? null;
}

function buildSelloutTotalsKey(monthKey: string, retailer: string, storeKey: string, jan: string) {
  return `${monthKey}|${retailer}|${storeKey}|${jan}`;
}

export function buildSelloutMonthlyChartRows(entries: SelloutEntry[]): SelloutChartRow[] {
  const rowsByMonth = new Map<string, SelloutChartRow>();

  entries.forEach((entry) => {
    const monthKey = getSelloutMonthKey(entry);
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
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

  // データがある月だけ返す（空月で埋めない）
  return Array.from(rowsByMonth.values())
    .filter((row) => row.amount > 0 || row.qty > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
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
    storeName: "",
    productSearch: "",
    year: filters.year,
    month: filters.month,
  });
  const productScoped = filterSelloutEntries(entries, {
    ...filters,
    productSearch: "",
  });

  const years = uniqueSorted(
    entries
      .map((entry) => getSelloutMonthKey(entry).slice(0, 4))
      .filter((year) => /^\d{4}$/.test(year)),
  ).sort((a, b) => b.localeCompare(a));

  const months = uniqueSorted(
    filterSelloutEntries(entries, {
      retailer: filters.retailer,
      storeName: filters.storeName,
      productSearch: filters.productSearch,
      year: filters.year,
      month: "all",
    })
      .map((entry) => getSelloutMonthKey(entry))
      .filter((key) => (filters.year === "all" ? Boolean(key) : key.startsWith(`${filters.year}-`)))
      .map((key) => String(Number(key.slice(5))))
      .filter((month) => month !== "NaN"),
  ).sort((a, b) => Number(a) - Number(b));

  const products = Array.from(
    new Map(
      productScoped
        .filter((entry) => entry.productName || entry.jan)
        .map((entry) => {
          const label =
            entry.productName && entry.jan && entry.productName !== entry.jan
              ? `${entry.productName} (${entry.jan})`
              : entry.productName || entry.jan;
          return [
            `${entry.jan}::${entry.productName}`,
            {
              label,
              value: entry.productName || entry.jan,
              jan: entry.jan,
              productName: entry.productName,
            },
          ] as const;
        }),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "ja"));

  return {
    retailers: uniqueSorted(entries.map((entry) => entry.retailer).filter(Boolean)),
    stores: uniqueSorted(retailerScoped.map((entry) => getSelloutDisplayStoreName(entry))),
    products,
    years,
    months,
    retailerScopedCount: retailerScoped.length,
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "ja"));
}
