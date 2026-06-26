import * as XLSX from "xlsx";

export type StoreIntroductionFormatKey = "row-list" | "flag-list";

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
};

const janPattern = /\d{13}/;

export function parseStoreIntroductionWorkbook(buffer: ArrayBuffer): ParsedStoreIntroduction {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const flagList = tryParseFlagListSheet(sheet, workbook);
    if (flagList.entries.length > 0) {
      return flagList;
    }

    const rowList = tryParseRowListSheet(sheet);
    if (rowList.entries.length > 0) {
      return rowList;
    }
  }

  throw new Error(
    "導入店舗シートを読み取れませんでした。フェーズ1対応形式（店舗一覧表・0/1フラグ表）か確認してください。",
  );
}

function tryParseRowListSheet(sheet: XLSX.WorkSheet): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return normalized.includes("店名") && normalized.some((cell) => ["jan", "janコード", "メーカjanコード"].includes(cell));
  });

  if (headerIndex === -1) {
    return { formatKey: "row-list", entries: [] };
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
  };
}

function tryParseFlagListSheet(sheet: XLSX.WorkSheet, workbook: XLSX.WorkBook): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);
  const workbookProduct = findWorkbookJanAndProduct(workbook);
  const jan = workbookProduct.jan;
  const productName = workbookProduct.productName;
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
      storeName,
      storeCode,
      address: "",
      postalCode: "",
      isIntroduced: normalizedFlag === "1",
    });
  }

  if (entries.length < 5) {
    return { formatKey: "flag-list", entries: [] };
  }

  if (!jan) {
    throw new Error("0/1形式のシートからJANコードを特定できませんでした。");
  }

  return {
    formatKey: "flag-list",
    entries: dedupeEntries(entries),
  };
}

function findWorkbookJanAndProduct(workbook: XLSX.WorkBook) {
  let best: { jan: string; productName: string; score: number } | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = sheetToRows(sheet);
    const headerIndex = rows.findIndex((row) => {
      const normalized = row.map(normalizeHeaderCell);
      return normalized.some((cell) =>
        ["メーカjanコード", "janコード", "単品コード", "単品名称"].includes(cell),
      );
    });

    if (headerIndex === -1) {
      continue;
    }

    const header = rows[headerIndex].map(normalizeHeaderCell);
    const janIndex = findColumnIndex(header, ["メーカjanコード", "janコード"]);
    const altJanIndex = findColumnIndex(header, ["単品コード"]);
    const productNameIndex = findColumnIndex(header, ["単品名称", "商品名称", "商品名"]);

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
