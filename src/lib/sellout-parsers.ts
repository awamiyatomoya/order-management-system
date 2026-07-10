import * as XLSX from "xlsx";
import type { SelloutImportProfile } from "@/lib/sellout-profiles";
import { selloutImportProfiles } from "@/lib/sellout-profiles";
import type { SelloutLayoutType } from "@/lib/types";

export type ParsedSelloutEntry = {
  periodStart: string;
  periodEnd: string;
  retailer: string;
  storeCode: string;
  storeName: string;
  jan: string;
  productName: string;
  qty: number;
  amount: number;
  stock: number | null;
};

export type ParsedSelloutWorkbook = {
  profileKey: string;
  retailer: string;
  layoutType: SelloutLayoutType;
  periodStart: string;
  periodEnd: string;
  entries: ParsedSelloutEntry[];
};

export function detectSelloutProfile(workbook: XLSX.WorkBook): SelloutImportProfile | null {
  for (const profile of selloutImportProfiles) {
    if (profile.detect(workbook)) {
      return profile;
    }
  }

  return null;
}

export function parseSelloutWorkbook(
  buffer: ArrayBuffer,
  profile?: SelloutImportProfile,
): ParsedSelloutWorkbook {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const resolvedProfile = profile ?? detectSelloutProfile(workbook);

  if (!resolvedProfile) {
    throw new Error(
      "セルアウトファイルの形式を判別できませんでした。対応小売チェーン（ロフト・ハンズ）のファイルか確認してください。",
    );
  }

  if (resolvedProfile.layoutType === "row-list" && resolvedProfile.rowList) {
    return parseRowListWorkbook(workbook, resolvedProfile);
  }

  if (resolvedProfile.layoutType === "matrix-product-store" && resolvedProfile.matrix) {
    return parseMatrixProductStoreWorkbook(workbook, resolvedProfile);
  }

  throw new Error(`プロファイル ${resolvedProfile.profileKey} の設定が不完全です。`);
}

function parseRowListWorkbook(
  workbook: XLSX.WorkBook,
  profile: SelloutImportProfile,
): ParsedSelloutWorkbook {
  const config = profile.rowList!;
  const sheet = resolveSheet(workbook, config.sheetNamePattern);
  const rows = sheetToRows(sheet);
  const headerRowIndex = config.headerRow - 1;
  const headerRow = rows[headerRowIndex] ?? [];
  const columnIndex = buildColumnIndex(headerRow, config.columns);
  const entries: ParsedSelloutEntry[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const storeCode = readCell(row, columnIndex.storeCode);
    const storeName = readCell(row, columnIndex.storeName);
    const jan = parseJanValue(row[columnIndex.jan ?? -1]);

    if (!jan && !storeName && !storeCode) {
      continue;
    }

    if (config.skipStoreCodes?.includes(storeCode)) {
      continue;
    }

    const dateValue = readCell(row, columnIndex.date);
    const period = parseYmdDate(dateValue);
    if (!period) {
      continue;
    }

    entries.push({
      periodStart: period,
      periodEnd: period,
      retailer: profile.retailer,
      storeCode,
      storeName,
      jan,
      productName: readCell(row, columnIndex.productName),
      qty: parseIntegerValue(row[columnIndex.qty ?? -1]),
      amount: parseIntegerValue(row[columnIndex.amount ?? -1]),
      stock: parseOptionalIntegerValue(row[columnIndex.stock ?? -1]),
    });
  }

  if (entries.length === 0) {
    throw new Error("セルアウトデータが1件も見つかりませんでした。");
  }

  const periodStart = entries.reduce((min, entry) => (entry.periodStart < min ? entry.periodStart : min), entries[0].periodStart);
  const periodEnd = entries.reduce((max, entry) => (entry.periodEnd > max ? entry.periodEnd : max), entries[0].periodEnd);

  return {
    profileKey: profile.profileKey,
    retailer: profile.retailer,
    layoutType: profile.layoutType,
    periodStart,
    periodEnd,
    entries,
  };
}

function parseMatrixProductStoreWorkbook(
  workbook: XLSX.WorkBook,
  profile: SelloutImportProfile,
): ParsedSelloutWorkbook {
  const config = profile.matrix!;
  const sheet = resolveSheet(workbook, config.sheetNamePattern);
  const rows = sheetToRows(sheet);
  const period = parsePeriodFromMetadata(rows, config.periodPattern);

  if (!period) {
    throw new Error("集計期間を読み取れませんでした。");
  }

  const storeHeaderRow = rows[config.storeHeaderRow - 1] ?? [];
  const metricHeaderRow = rows[config.metricHeaderRow - 1] ?? [];
  const productColumnIndex = buildColumnIndex(metricHeaderRow, config.productColumns);
  const storeBlocks = buildStoreBlocks(storeHeaderRow, metricHeaderRow, config);
  const entries: ParsedSelloutEntry[] = [];

  for (let rowIndex = config.metricHeaderRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const jan = parseJanValue(row[productColumnIndex.jan ?? -1]);
    const productName = readCell(row, productColumnIndex.productName);

    if (!jan) {
      continue;
    }

    for (const block of storeBlocks) {
      const qty = parseOptionalIntegerValue(row[block.metricIndexes.qty ?? -1]) ?? 0;
      const amount = parseOptionalIntegerValue(row[block.metricIndexes.amount ?? -1]) ?? 0;
      const stock = parseOptionalIntegerValue(row[block.metricIndexes.stock ?? -1]);

      if (qty === 0 && amount === 0 && stock === null) {
        continue;
      }

      entries.push({
        periodStart: period.start,
        periodEnd: period.end,
        retailer: profile.retailer,
        storeCode: "",
        storeName: block.storeName,
        jan,
        productName,
        qty,
        amount,
        stock,
      });
    }
  }

  if (entries.length === 0) {
    throw new Error("セルアウトデータが1件も見つかりませんでした。");
  }

  return {
    profileKey: profile.profileKey,
    retailer: profile.retailer,
    layoutType: profile.layoutType,
    periodStart: period.start,
    periodEnd: period.end,
    entries,
  };
}

function resolveSheet(workbook: XLSX.WorkBook, sheetNamePattern?: RegExp) {
  const sheetName = sheetNamePattern
    ? workbook.SheetNames.find((name) => sheetNamePattern.test(name))
    : workbook.SheetNames.find((name) => workbook.Sheets[name]);

  if (!sheetName) {
    throw new Error("対象シートが見つかりませんでした。");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("対象シートが見つかりませんでした。");
  }

  return sheet;
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
}

function buildColumnIndex(
  headerRow: (string | number | null)[],
  columns: Record<string, string | undefined>,
) {
  const normalizedHeaders = headerRow.map((cell, index) => ({
    index,
    key: normalizeHeaderCell(cell),
  }));

  const result: Record<string, number> = {};

  Object.entries(columns).forEach(([field, header]) => {
    if (!header) {
      return;
    }

    if (header === "__first_column__") {
      result[field] = 0;
      return;
    }

    const normalizedHeader = normalizeHeaderCell(header);
    const matched = normalizedHeaders.find((item) => item.key === normalizedHeader);
    if (matched) {
      result[field] = matched.index;
    }
  });

  return result;
}

type StoreBlock = {
  storeName: string;
  metricIndexes: Partial<Record<"qty" | "amount" | "stock", number>>;
};

function buildStoreBlocks(
  storeHeaderRow: (string | number | null)[],
  metricHeaderRow: (string | number | null)[],
  config: NonNullable<SelloutImportProfile["matrix"]>,
): StoreBlock[] {
  const blocks: StoreBlock[] = [];
  const metrics = config.metricsPerStore;
  const step = metrics.length;

  for (let columnIndex = config.storeColumnStart; columnIndex < storeHeaderRow.length; columnIndex += step) {
    const storeName = String(storeHeaderRow[columnIndex] ?? "").trim();
    if (!storeName || config.skipStores?.includes(storeName)) {
      continue;
    }

    const metricIndexes: StoreBlock["metricIndexes"] = {};
    metrics.forEach((metric, offset) => {
      metricIndexes[metric] = columnIndex + offset;
    });

    const metricLabels = metrics.map((metric, offset) =>
      normalizeHeaderCell(metricHeaderRow[columnIndex + offset]),
    );

    if (!metricLabels.includes("売上数") && !metricLabels.includes("売上額")) {
      continue;
    }

    blocks.push({ storeName, metricIndexes });
  }

  return blocks;
}

function parsePeriodFromMetadata(
  rows: (string | number | null)[][],
  pattern: RegExp,
): { start: string; end: string } | null {
  for (const row of rows.slice(0, 20)) {
    for (const cell of row) {
      const text = String(cell ?? "");
      const match = text.match(pattern);
      if (!match) {
        continue;
      }

      return {
        start: `${match[1]}-${match[2]}-${match[3]}`,
        end: `${match[4]}-${match[5]}-${match[6]}`,
      };
    }
  }

  return null;
}

function readCell(row: (string | number | null)[], columnIndex: number | undefined) {
  if (columnIndex === undefined || columnIndex < 0) {
    return "";
  }

  return String(row[columnIndex] ?? "").trim();
}

function normalizeHeaderCell(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseJanValue(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "_") {
    return "";
  }

  if (/^\d+(\.\d+)?e\+\d+$/i.test(trimmed)) {
    return String(Math.trunc(Number(trimmed)));
  }

  return trimmed.replace(/\D/g, "").length >= 8 ? trimmed.replace(/\s+/g, "") : "";
}

function parseYmdDate(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) {
    return "";
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function parseIntegerValue(value: string | number | null | undefined) {
  return parseOptionalIntegerValue(value) ?? 0;
}

function parseOptionalIntegerValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "_" || trimmed === "-") {
    return null;
  }

  const normalized = trimmed.replace(/,/g, "").replace(/\s+/g, "");
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

export function summarizeSelloutEntries(
  entries: Array<Pick<ParsedSelloutEntry, "storeCode" | "storeName" | "qty" | "amount" | "jan">>,
) {
  const storeKeys = new Set(entries.map((entry) => entry.storeCode || entry.storeName));
  return {
    entryCount: entries.length,
    storeCount: storeKeys.size,
    totalQty: entries.reduce((sum, entry) => sum + entry.qty, 0),
    totalAmount: entries.reduce((sum, entry) => sum + entry.amount, 0),
    jans: [...new Set(entries.map((entry) => entry.jan).filter(Boolean))],
  };
}
