import * as XLSX from "xlsx";
import type { StoreIntroductionFormatKey } from "@/lib/types";

export type ParsedStoreIntroductionEntry = {
  jan: string;
  productName: string;
  storeName: string;
  storeCode: string;
  address: string;
  postalCode: string;
  isIntroduced: boolean;
};

export type ParsedStoreIntroduction = {
  formatKey: StoreIntroductionFormatKey;
  entries: ParsedStoreIntroductionEntry[];
  sheetCount: number;
};

const janPattern = /\d{13}/;
const addressBookSheetNamePattern = /販促物|送付先|店舗住所|店舗マスタ/;

export function parseStoreIntroductionWorkbook(buffer: ArrayBuffer): ParsedStoreIntroduction {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const allEntries: ParsedStoreIntroductionEntry[] = [];
  let formatKey: StoreIntroductionFormatKey | null = null;
  let parsedSheetCount = 0;

  for (const sheetName of workbook.SheetNames) {
    if (addressBookSheetNamePattern.test(sheetName)) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const handsAllocation = tryParseHandsAllocationListSheet(sheet);
    if (handsAllocation.entries.length > 0) {
      formatKey = formatKey ?? "hands-allocation-list";
      allEntries.push(...handsAllocation.entries);
      parsedSheetCount += 1;
      continue;
    }

    const flagList = tryParseFlagListSheet(sheet, workbook);
    if (flagList.entries.length > 0) {
      formatKey = formatKey ?? "flag-list";
      allEntries.push(...flagList.entries);
      parsedSheetCount += 1;
      continue;
    }

    const rowList = tryParseRowListSheet(sheet);
    if (rowList.entries.length > 0) {
      formatKey = formatKey ?? "row-list";
      allEntries.push(...rowList.entries);
      parsedSheetCount += 1;
    }
  }

  if (allEntries.length === 0) {
    throw new Error(
      "導入店舗シートを読み取れませんでした。フェーズ1対応形式（店舗一覧表・0/1フラグ表・ハンズ按分表）か確認してください。",
    );
  }

  return {
    formatKey: formatKey ?? "row-list",
    entries: dedupeEntries(allEntries),
    sheetCount: parsedSheetCount,
  };
}

function tryParseHandsAllocationListSheet(sheet: XLSX.WorkSheet): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);
  const storeNameHeaderIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return normalized.includes("商品名称") && normalized.includes("納品日");
  });

  if (storeNameHeaderIndex === -1) {
    return { formatKey: "hands-allocation-list", entries: [], sheetCount: 0 };
  }

  const hasHandsTitle = rows.some((row) =>
    row.some((cell) => stringCell(cell).includes("ハンズ各店按分数")),
  );
  const storeCodeRowIndex = storeNameHeaderIndex - 1;

  if (!hasHandsTitle || storeCodeRowIndex < 0) {
    return { formatKey: "hands-allocation-list", entries: [], sheetCount: 0 };
  }

  const storeCodeRow = rows[storeCodeRowIndex];
  const storeNameRow = rows[storeNameHeaderIndex];
  const storeColumns = findHandsStoreColumns(storeCodeRow, storeNameRow);

  if (storeColumns.length < 5) {
    return { formatKey: "hands-allocation-list", entries: [], sheetCount: 0 };
  }

  const fallbackProduct = findHandsWorkbookProduct(rows);
  const entries: ParsedStoreIntroductionEntry[] = [];

  for (const row of rows.slice(storeNameHeaderIndex + 1)) {
    const productName = stringCell(row[3]);
    const jan = extractJan(row[2]) || extractJan(row[1]) || fallbackProduct.jan;
    const hasAllocation = storeColumns.some(({ columnIndex }) => isPositiveAllocation(row[columnIndex]));

    if (!productName && !jan) {
      continue;
    }

    if (!hasAllocation) {
      continue;
    }

    if (productName.includes("販促物同梱")) {
      continue;
    }

    const resolvedJan = jan || fallbackProduct.jan || "UNKNOWN";
    const resolvedProductName = productName || fallbackProduct.productName;

    storeColumns.forEach(({ columnIndex, storeCode, storeName }) => {
      entries.push({
        jan: resolvedJan,
        productName: resolvedProductName,
        storeName,
        storeCode,
        address: "",
        postalCode: "",
        isIntroduced: isPositiveAllocation(row[columnIndex]),
      });
    });
  }

  if (entries.length < 5) {
    return { formatKey: "hands-allocation-list", entries: [], sheetCount: 0 };
  }

  return {
    formatKey: "hands-allocation-list",
    entries: dedupeEntries(entries),
    sheetCount: 0,
  };
}

function findHandsStoreColumns(storeCodeRow: unknown[], storeNameRow: unknown[]) {
  const columns: { columnIndex: number; storeCode: string; storeName: string }[] = [];

  for (let columnIndex = 0; columnIndex < storeCodeRow.length; columnIndex += 1) {
    const storeCode = normalizeHandsStoreCode(storeCodeRow[columnIndex]);
    const storeName = stringCell(storeNameRow[columnIndex]);

    if (!storeCode || !storeName || storeName.includes("全店")) {
      continue;
    }

    columns.push({ columnIndex, storeCode, storeName });
  }

  return columns;
}

function normalizeHandsStoreCode(value: unknown) {
  const raw = stringCell(value);
  if (!raw || !/^\d{1,4}$/.test(raw)) {
    return "";
  }

  return raw;
}

function isPositiveAllocation(value: unknown) {
  if (typeof value === "number") {
    return value > 0;
  }

  const normalized = stringCell(value).replace(/[　\s]/g, "");
  if (!normalized) {
    return false;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0;
}

function findHandsWorkbookProduct(rows: unknown[][]) {
  for (const row of rows.slice(0, 15)) {
    const jan = extractJan(row[2]) || extractJan(row[1]);
    const productName = stringCell(row[3]) || stringCell(row[2]);

    if (jan && productName && !productName.includes("販促物同梱")) {
      return { jan, productName };
    }
  }

  return { jan: "", productName: "" };
}

function tryParseRowListSheet(sheet: XLSX.WorkSheet): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return normalized.includes("店名") && normalized.some((cell) => ["jan", "janコード", "メーカjanコード"].includes(cell));
  });

  if (headerIndex === -1) {
    return { formatKey: "row-list", entries: [], sheetCount: 0 };
  }

  const header = rows[headerIndex].map(normalizeHeaderCell);
  const janIndex = findColumnIndex(header, ["janコード", "メーカjanコード", "jan"]);
  const storeNameIndex = findColumnIndex(header, ["店名", "店舗名", "送り先名称①", "送り先名称1"]);
  const storeCodeIndex = findColumnIndex(header, ["回答店番", "店番", "各店コード", "店舗コード", "店コード"]);
  const addressIndex = findColumnIndex(header, ["住所", "住所①", "住所1"]);
  const postalCodeIndex = findColumnIndex(header, ["郵便番号"]);
  const productNameIndex = findColumnIndex(header, ["商品名称全部", "商品名称", "商品名", "単品名称"]);

  const entries: ParsedStoreIntroductionEntry[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const jan = extractJan(row[janIndex] ?? "");
    const storeName = stringCell(row[storeNameIndex]);

    if (!jan || !storeName) {
      continue;
    }

    entries.push({
      jan,
      productName: stringCell(row[productNameIndex]),
      storeName,
      storeCode: stringCell(row[storeCodeIndex]),
      address: stringCell(row[addressIndex]),
      postalCode: stringCell(row[postalCodeIndex]),
      isIntroduced: true,
    });
  }

  return {
    formatKey: "row-list",
    entries: dedupeEntries(entries),
    sheetCount: 0,
  };
}

function tryParseFlagListSheet(sheet: XLSX.WorkSheet, workbook: XLSX.WorkBook): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);
  const sheetProduct = findJanAndProductFromSheet(sheet);
  const workbookProduct = findWorkbookJanAndProduct(workbook);
  const jan = sheetProduct.jan || workbookProduct.jan;
  const productName = sheetProduct.productName || workbookProduct.productName;
  const addressBook = loadPromotionalAddressBook(workbook);
  const entries: ParsedStoreIntroductionEntry[] = [];

  for (const row of rows) {
    const storeCode = stringCell(row[0]);
    const storeName = stringCell(row[1]);
    const flagValue = row[2];

    if (!/^\d{2,4}$/.test(storeCode) || !storeName || storeName.includes("全店")) {
      continue;
    }

    if (typeof flagValue !== "number" && typeof flagValue !== "string") {
      continue;
    }

    const normalizedFlag = String(flagValue).trim();
    if (normalizedFlag !== "0" && normalizedFlag !== "1") {
      continue;
    }

    entries.push({
      jan: jan || "UNKNOWN",
      productName,
      storeName: addressBook.get(storeCode)?.storeName || storeName,
      storeCode,
      address: addressBook.get(storeCode)?.address ?? "",
      postalCode: addressBook.get(storeCode)?.postalCode ?? "",
      isIntroduced: normalizedFlag === "1",
    });
  }

  if (entries.length < 5) {
    return { formatKey: "flag-list", entries: [], sheetCount: 0 };
  }

  if (!jan) {
    return { formatKey: "flag-list", entries: [], sheetCount: 0 };
  }

  return {
    formatKey: "flag-list",
    entries: dedupeEntries(entries),
    sheetCount: 0,
  };
}

type PromotionalAddressEntry = {
  storeCode: string;
  storeName: string;
  postalCode: string;
  address: string;
  tel: string;
};

function looksLikeFlagListSheet(rows: unknown[][]) {
  let flagRows = 0;

  for (const row of rows) {
    const storeCode = stringCell(row[0]);
    const storeName = stringCell(row[1]);
    const flagValue = row[2];

    if (!/^\d{2,4}$/.test(storeCode) || !storeName) {
      continue;
    }

    const normalizedFlag = String(flagValue).trim();
    if (normalizedFlag === "0" || normalizedFlag === "1") {
      flagRows += 1;
    }
  }

  return flagRows >= 5;
}

function looksLikeStoreAddress(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 4) {
    return false;
  }

  return !/^\d+$/.test(trimmed);
}

export function buildPromotionalAddressBook(workbook: XLSX.WorkBook) {
  const map = new Map<string, PromotionalAddressEntry>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = sheetToRows(sheet);
    if (looksLikeFlagListSheet(rows)) {
      continue;
    }

    const namedSheet = addressBookSheetNamePattern.test(sheetName);
    const parsedRows = parseAddressBookRows(rows);

    if (parsedRows.length === 0) {
      continue;
    }

    if (!namedSheet && parsedRows.length < 5) {
      continue;
    }

    parsedRows.forEach((entry) => {
      map.set(entry.storeCode, entry);
    });
  }

  return map;
}

function loadPromotionalAddressBook(workbook: XLSX.WorkBook) {
  const map = buildPromotionalAddressBook(workbook);
  const entries = Array.from(map.values());

  return new Map(
    entries.map((entry) => [
      entry.storeCode,
      {
        storeName: entry.storeName,
        postalCode: entry.postalCode,
        address: entry.address,
        tel: entry.tel,
      },
    ]),
  );
}

function parseAddressBookRows(rows: unknown[][]) {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return (
      normalized.some((cell) => ["店舗コード", "店コード", "回答店番", "店番"].includes(cell)) &&
      normalized.some((cell) => ["店名", "店舗名"].includes(cell)) &&
      normalized.some((cell) => ["住所", "住所1", "住所①"].includes(cell))
    );
  });

  if (headerIndex >= 0) {
    const header = rows[headerIndex].map(normalizeHeaderCell);
    const storeCodeIndex = findColumnIndex(header, ["店舗コード", "店コード", "回答店番", "店番"]);
    const storeNameIndex = findColumnIndex(header, ["店名", "店舗名"]);
    const postalCodeIndex = findColumnIndex(header, ["郵便番号"]);
    const addressIndex = findColumnIndex(header, ["住所", "住所1", "住所①"]);
    const telIndex = findColumnIndex(header, ["tel", "電話", "電話番号"]);

    return rows
      .slice(headerIndex + 1)
      .map((row) => {
        const storeCode = stringCell(row[storeCodeIndex]);
        const storeName = stringCell(row[storeNameIndex]);

        if (!storeName) {
          return null;
        }

        return {
          storeCode,
          storeName,
          postalCode: stringCell(row[postalCodeIndex]),
          address: stringCell(row[addressIndex]),
          tel: stringCell(row[telIndex]),
        };
      })
      .filter((entry): entry is PromotionalAddressEntry => Boolean(entry));
  }

  const entries: PromotionalAddressEntry[] = [];

  for (const row of rows) {
    const storeCode = stringCell(row[0]);
    const storeName = stringCell(row[1]);

    if (!/^\d{2,4}$/.test(storeCode) || !storeName) {
      continue;
    }

    const address = stringCell(row[3]);
    if (!looksLikeStoreAddress(address)) {
      continue;
    }

    entries.push({
      storeCode,
      storeName,
      postalCode: stringCell(row[2]),
      address,
      tel: stringCell(row[4]),
    });
  }

  return entries;
}

function findJanAndProductFromSheet(sheet: XLSX.WorkSheet) {
  return findJanAndProductFromRows(sheetToRows(sheet));
}

function findJanAndProductFromRows(rows: unknown[][]) {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return normalized.some((cell) =>
      ["メーカjanコード", "janコード", "単品コード", "単品名称"].includes(cell),
    );
  });

  if (headerIndex === -1) {
    return { jan: "", productName: "" };
  }

  const header = rows[headerIndex].map(normalizeHeaderCell);
  const janIndex = findColumnIndex(header, ["メーカjanコード", "janコード"]);
  const altJanIndex = findColumnIndex(header, ["単品コード"]);
  const productNameIndex = findColumnIndex(header, ["単品名称", "商品名称", "商品名"]);
  let best: { jan: string; productName: string; score: number } | null = null;

  for (const row of rows.slice(headerIndex + 1, headerIndex + 25)) {
    const jan = extractJan(row[janIndex] ?? "") || extractJan(row[altJanIndex] ?? "");
    const productName = stringCell(row[productNameIndex]);

    if (!jan) {
      continue;
    }

    const score = scoreWorkbookProductRow(productName);

    if (!best || score > best.score) {
      best = { jan, productName, score };
    }
  }

  if (best) {
    return { jan: best.jan, productName: best.productName };
  }

  return { jan: "", productName: "" };
}

function findWorkbookJanAndProduct(workbook: XLSX.WorkBook) {
  let best: { jan: string; productName: string; score: number } | null = null;

  for (const sheetName of workbook.SheetNames) {
    if (addressBookSheetNamePattern.test(sheetName)) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const sheetProduct = findJanAndProductFromSheet(sheet);

    if (!sheetProduct.jan) {
      continue;
    }

    const score = scoreWorkbookProductRow(sheetProduct.productName);

    if (!best || score > best.score) {
      best = { jan: sheetProduct.jan, productName: sheetProduct.productName, score };
    }
  }

  if (best) {
    return { jan: best.jan, productName: best.productName };
  }

  return {
    jan: findWorkbookJan(workbook),
    productName: findWorkbookProductName(workbook),
  };
}

function scoreWorkbookProductRow(productName: string) {
  const normalized = normalizeProductMatchText(productName);

  if (!normalized) {
    return 0;
  }

  let score = normalized.length;

  if (normalized === "エシエンス") {
    score -= 50;
  }

  if (normalized.includes("ダーマインショット") || normalized.includes("ダーマ")) {
    score += 100;
  }

  return score;
}

export function normalizeProductMatchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[×x]/g, "")
    .replace(/[ｰ\-ー‐]/g, "");
}

export function resolveIntroductionProduct(
  parsedJan: string,
  productName: string,
  clientId: string,
  products: { clientId: string; jan: string; name: string }[],
) {
  const normalizedExcel = normalizeProductMatchText(productName);
  const clientProducts = products.filter((product) => product.clientId === clientId);

  const matchedProduct = clientProducts
    .map((product) => ({
      product,
      score: getIntroductionProductMatchScore(normalizedExcel, normalizeProductMatchText(product.name)),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.product;

  if (matchedProduct) {
    return {
      jan: matchedProduct.jan,
      productName: matchedProduct.name,
    };
  }

  return {
    jan: parsedJan,
    productName: productName.trim() || parsedJan,
  };
}

function getIntroductionProductMatchScore(excelName: string, masterName: string) {
  if (!excelName || !masterName) {
    return 0;
  }

  if (excelName === masterName) {
    return masterName.length + 1000;
  }

  if (excelName.includes(masterName) || masterName.includes(excelName)) {
    return Math.min(excelName.length, masterName.length) + 100;
  }

  if (masterName.includes("ダーマインショット") && excelName.includes("ダーマインショット")) {
    return 500;
  }

  return 0;
}

function findWorkbookJan(workbook: XLSX.WorkBook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    for (const row of sheetToRows(sheet).slice(0, 30)) {
      for (const cell of row) {
        const jan = extractJan(cell);
        if (jan) {
          return jan;
        }
      }
    }
  }

  return "";
}

function findWorkbookProductName(workbook: XLSX.WorkBook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = sheetToRows(sheet);
    for (const row of rows.slice(0, 30)) {
      const label = normalizeHeaderCell(row[0]);
      if (label === "単品名称" || label === "商品名称" || label === "商品名") {
        const value = stringCell(row[1]) || stringCell(row[2]) || stringCell(row[3]);
        if (value) {
          return value;
        }
      }
    }
  }

  return "";
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  const ref = sheet["!ref"];
  if (!ref) {
    return [] as unknown[][];
  }

  const range = XLSX.utils.decode_range(ref);
  const rows: unknown[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: unknown[] = [];
    let hasValue = false;

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const value = sheet[address]?.v ?? "";
      if (String(value).trim()) {
        hasValue = true;
      }
      row.push(value);
    }

    if (hasValue) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeaderCell(value: unknown) {
  return stringCell(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "");
}

function findColumnIndex(header: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLowerCase().replace(/\s+/g, ""));
  return header.findIndex((cell) => normalizedCandidates.includes(cell));
}

function stringCell(value: unknown) {
  if (value == null) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function extractJan(value: unknown) {
  const match = stringCell(value).replace(/\D/g, "").match(/\d{13}/);
  return match?.[0] ?? "";
}

function dedupeEntries(entries: ParsedStoreIntroductionEntry[]) {
  const map = new Map<string, ParsedStoreIntroductionEntry>();

  entries.forEach((entry) => {
    const key = `${entry.jan}::${entry.storeCode}::${entry.storeName}`;
    map.set(key, entry);
  });

  return Array.from(map.values());
}

export function summarizeStoreIntroduction(entries: ParsedStoreIntroductionEntry[]) {
  const introduced = entries.filter((entry) => entry.isIntroduced);
  const jans = Array.from(new Set(entries.map((entry) => entry.jan)));

  return {
    totalStoreCount: entries.length,
    introducedStoreCount: introduced.length,
    jans,
  };
}
