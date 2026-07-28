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

const MIN_SELLOUT_CHART_MONTHS = 12;

export function buildSelloutMonthlyChartRows(entries: SelloutEntry[]): SelloutChartRow[] {
  const rowsByMonth = new Map<string, SelloutChartRow>();

  entries.forEach((entry) => {
    const monthKey = getSelloutMonthKey(entry);
    if (!monthKey || !parseSelloutMonthKey(monthKey)) {
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

  const sortedKeys = Array.from(rowsByMonth.keys()).sort((a, b) => a.localeCompare(b));
  if (sortedKeys.length === 0) {
    return [];
  }

  const firstMonth = parseSelloutMonthKey(sortedKeys[0]);
  const lastMonth = parseSelloutMonthKey(sortedKeys[sortedKeys.length - 1]);
  if (!firstMonth || !lastMonth) {
    return Array.from(rowsByMonth.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  let start = firstMonth;
  const end = lastMonth;
  const span = monthKeyDiff(start, end) + 1;
  if (span < MIN_SELLOUT_CHART_MONTHS) {
    start = addMonthKey(end, -(MIN_SELLOUT_CHART_MONTHS - 1));
  }

  const rows: SelloutChartRow[] = [];
  for (let cursor = start; monthKeyDiff(cursor, end) >= 0; cursor = addMonthKey(cursor, 1)) {
    const label = formatSelloutMonthKey(cursor);
    rows.push(
      rowsByMonth.get(label) ?? {
        label,
        qty: 0,
        amount: 0,
      },
    );
  }

  return rows;
}

function parseSelloutMonthKey(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function formatSelloutMonthKey(value: { year: number; month: number }) {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

function addMonthKey(value: { year: number; month: number }, delta: number) {
  const index = value.year * 12 + (value.month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

function monthKeyDiff(
  start: { year: number; month: number },
  end: { year: number; month: number },
) {
  return (end.year - start.year) * 12 + (end.month - start.month);
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
