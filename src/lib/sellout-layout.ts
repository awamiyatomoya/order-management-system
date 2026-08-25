import type * as XLSX from "xlsx";
import * as XLSXUtils from "xlsx";

export type StoreProductBlock = {
  jan: string;
  productName: string;
  qtyCol: number;
  amountCol: number | null;
};

export type StoreProductMatrixLayout = {
  sheetName: string;
  headerRowIndex: number;
  metricRowIndex: number;
  storeCodeCol: number | null;
  storeNameCol: number | null;
  productBlocks: StoreProductBlock[];
  period: { start: string; end: string } | null;
  metadataText: string;
};

export type GenericRowListLayout = {
  sheetName: string;
  headerRowIndex: number;
  columns: {
    date?: number;
    storeCode?: number;
    storeName?: number;
    jan?: number;
    productName?: number;
    qty?: number;
    amount?: number;
    stock?: number;
  };
  period: { start: string; end: string } | null;
  metadataText: string;
};

const STORE_CODE_HEADERS = new Set(["店舗コード", "店舗cd", "店コード", "店番", "店舗番号"]);
const STORE_NAME_HEADERS = new Set(["店舗名", "店舗", "店名"]);
const QTY_HEADERS = ["売上数量", "販売数量", "売上数", "販売数", "数量"];
const AMOUNT_HEADERS = ["売上金額", "販売金額", "売上額", "金額"];
const JAN_HEADERS = new Set(["jan", "janコード", "jancd", "商品コード"]);
const PRODUCT_HEADERS = new Set(["商品名", "商品", "品名"]);
const DATE_HEADERS = new Set(["日付", "売上日", "年月日", "対象日", "伝票日"]);
const SKIP_LABELS = new Set(["合計", "総計", "総合計", "全社計", "計", "小計", "通販"]);

const RETAILER_RULES: Array<{ name: string; patterns: RegExp[]; weight: number }> = [
  {
    name: "ドン・キホーテ",
    patterns: [/ドンキ/, /ドン・キホーテ/, /メガドン/, /megadon/i, /donki/i],
    weight: 3,
  },
  {
    name: "ドン・キホーテ",
    patterns: [/ピカソ/, /長崎屋/, /情熱職人/],
    weight: 1,
  },
  { name: "ロフト", patterns: [/ロフト/, /loft/i], weight: 3 },
  { name: "ハンズ", patterns: [/ハンズ/, /hands/i], weight: 3 },
  { name: "アインズ", patterns: [/アインズ/, /ainz/i], weight: 3 },
  { name: "@cosme STORE", patterns: [/@cosme/, /アットコスメ/], weight: 3 },
];

const RETAILER_ALIASES: Record<string, string> = {
  ドンキ: "ドン・キホーテ",
  ドンキホーテ: "ドン・キホーテ",
  "ドン・キホーテ": "ドン・キホーテ",
  長崎屋: "ドン・キホーテ",
  ロフト: "ロフト",
  loft: "ロフト",
  ハンズ: "ハンズ",
  hands: "ハンズ",
  アインズ: "アインズ",
};

export function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSXUtils.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
}

export function normalizeHeaderCell(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function collectSheetMetadata(rows: (string | number | null)[][], maxRows = 20) {
  return rows
    .slice(0, maxRows)
    .flat()
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function parsePeriodFromText(text: string): { start: string; end: string } | null {
  const normalized = text.normalize("NFKC");

  const japanese = normalized.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*[～〜~\-－—]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/,
  );
  if (japanese) {
    return toPeriod(japanese);
  }

  const delimited = normalized.match(
    /(\d{4})[.\/\-年](\d{1,2})[.\/\-月](\d{1,2})日?\s*[～〜~\-－—]\s*(\d{4})[.\/\-年](\d{1,2})[.\/\-月](\d{1,2})日?/,
  );
  if (delimited) {
    return toPeriod(delimited);
  }

  const compact = normalized.match(/(\d{4})(\d{2})(\d{2})\s*[～〜~\-－—]\s*(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return toPeriod(compact);
  }

  return null;
}

export function parsePeriodFromRows(rows: (string | number | null)[][]) {
  for (const row of rows.slice(0, 20)) {
    for (const cell of row) {
      const period = parsePeriodFromText(String(cell ?? ""));
      if (period) {
        return period;
      }
    }
  }

  return null;
}

export function extractProductFromHeader(value: string) {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const janMatch =
    normalized.match(/[（(](\d{8,14})[）)]/) ?? normalized.match(/(?:^|[^\d])(\d{8,14})(?:[^\d]|$)/);
  const jan = janMatch?.[1] ?? "";
  const productName = normalized
    .replace(/[（(]\d{8,14}[）)]/g, "")
    .replace(jan, "")
    .replace(/[（()）]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return { jan, productName };
}

export function findStoreProductMatrixLayout(
  workbook: XLSX.WorkBook,
  sheetNamePattern?: RegExp,
): StoreProductMatrixLayout | null {
  const sheetNames = resolveCandidateSheetNames(workbook, sheetNamePattern, /期間/);

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const layout = findStoreProductMatrixInRows(sheetName, sheetToRows(sheet));
    if (layout) {
      return layout;
    }
  }

  return null;
}

export function findGenericRowListLayout(
  workbook: XLSX.WorkBook,
  sheetNamePattern?: RegExp,
): GenericRowListLayout | null {
  const sheetNames = resolveCandidateSheetNames(workbook, sheetNamePattern);

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const layout = findGenericRowListInRows(sheetName, sheetToRows(sheet));
    if (layout) {
      return layout;
    }
  }

  return null;
}

export function inferSelloutRetailer(storeNames: string[], metadataText = "") {
  const fromMetadata = inferRetailerFromMetadata(metadataText);
  if (fromMetadata) {
    return fromMetadata;
  }

  const scores = new Map<string, number>();

  storeNames.forEach((storeName) => {
    RETAILER_RULES.forEach((rule) => {
      if (rule.patterns.some((pattern) => pattern.test(storeName))) {
        scores.set(rule.name, (scores.get(rule.name) ?? 0) + rule.weight);
      }
    });
  });

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const [bestName, bestScore] = ranked[0] ?? [];
  if (!bestName || !bestScore) {
    return "その他";
  }

  const sampleSize = Math.max(storeNames.length, 1);
  if (bestScore < 3 && sampleSize >= 5) {
    return "その他";
  }

  return bestName;
}

export function isSkipStoreLabel(value: string) {
  return SKIP_LABELS.has(normalizeHeaderCell(value));
}

function findStoreProductMatrixInRows(
  sheetName: string,
  rows: (string | number | null)[][],
): StoreProductMatrixLayout | null {
  for (let headerRowIndex = 0; headerRowIndex < Math.min(rows.length, 20); headerRowIndex += 1) {
    const headerRow = rows[headerRowIndex] ?? [];
    const headerKeys = headerRow.map(normalizeHeaderCell);
    const storeCodeCol = headerKeys.findIndex((key) => STORE_CODE_HEADERS.has(key));
    const storeNameCol = headerKeys.findIndex((key) => STORE_NAME_HEADERS.has(key));

    if (storeCodeCol < 0 && storeNameCol < 0) {
      continue;
    }

    const metricRowIndex = headerRowIndex + 1;
    const metricRow = rows[metricRowIndex] ?? [];
    const metricKeys = metricRow.map(normalizeHeaderCell);
    if (!metricKeys.some(isQtyHeader) && !metricKeys.some(isAmountHeader)) {
      continue;
    }

    const startCol = Math.max(storeCodeCol, storeNameCol, 0) + 1;
    const productBlocks = buildProductBlocks(headerRow, metricRow, startCol);
    if (productBlocks.length === 0) {
      continue;
    }

    return {
      sheetName,
      headerRowIndex,
      metricRowIndex,
      storeCodeCol: storeCodeCol >= 0 ? storeCodeCol : null,
      storeNameCol: storeNameCol >= 0 ? storeNameCol : null,
      productBlocks,
      period: parsePeriodFromRows(rows),
      metadataText: collectSheetMetadata(rows),
    };
  }

  return null;
}

function findGenericRowListInRows(
  sheetName: string,
  rows: (string | number | null)[][],
): GenericRowListLayout | null {
  for (let headerRowIndex = 0; headerRowIndex < Math.min(rows.length, 20); headerRowIndex += 1) {
    const headerRow = rows[headerRowIndex] ?? [];
    const headerKeys = headerRow.map(normalizeHeaderCell);
    const columns: GenericRowListLayout["columns"] = {
      date: findHeaderIndex(headerKeys, DATE_HEADERS),
      storeCode: findHeaderIndex(headerKeys, STORE_CODE_HEADERS),
      storeName: findHeaderIndex(headerKeys, STORE_NAME_HEADERS),
      jan: findHeaderIndex(headerKeys, JAN_HEADERS),
      productName: findHeaderIndex(headerKeys, PRODUCT_HEADERS),
      qty: findHeaderIndexByPriority(headerKeys, QTY_HEADERS),
      amount: findHeaderIndexByPriority(headerKeys, AMOUNT_HEADERS),
      stock: findHeaderIndex(headerKeys, new Set(["在庫", "在庫数"])),
    };

    if (columns.qty === undefined && columns.amount === undefined) {
      const uriageIndex = headerKeys.findIndex((key) => key === "売上");
      if (uriageIndex >= 0) {
        columns.qty = uriageIndex;
      }
    }

    const hasStore = columns.storeCode !== undefined || columns.storeName !== undefined;
    const hasProduct = columns.jan !== undefined;
    const hasMetric = columns.qty !== undefined || columns.amount !== undefined;

    if (!hasStore || !hasProduct || !hasMetric) {
      continue;
    }

    return {
      sheetName,
      headerRowIndex,
      columns,
      period: parsePeriodFromRows(rows),
      metadataText: collectSheetMetadata(rows),
    };
  }

  return null;
}

function buildProductBlocks(
  headerRow: (string | number | null)[],
  metricRow: (string | number | null)[],
  startCol: number,
): StoreProductBlock[] {
  const blocks: StoreProductBlock[] = [];

  for (let columnIndex = startCol; columnIndex < metricRow.length; columnIndex += 1) {
    if (!isQtyHeader(normalizeHeaderCell(metricRow[columnIndex]))) {
      continue;
    }

    const productHeader = resolveProductHeader(headerRow, startCol, columnIndex);
    if (!productHeader || isSkipStoreLabel(productHeader)) {
      continue;
    }

    const { jan, productName } = extractProductFromHeader(productHeader);
    if (!jan) {
      continue;
    }

    const amountCol = isAmountHeader(normalizeHeaderCell(metricRow[columnIndex + 1]))
      ? columnIndex + 1
      : null;

    blocks.push({
      jan,
      productName: productName || productHeader,
      qtyCol: columnIndex,
      amountCol,
    });
  }

  return blocks;
}

function resolveProductHeader(
  headerRow: (string | number | null)[],
  startCol: number,
  columnIndex: number,
) {
  const direct = String(headerRow[columnIndex] ?? "").trim();
  if (direct) {
    return direct;
  }

  for (let back = columnIndex - 1; back >= startCol; back -= 1) {
    const candidate = String(headerRow[back] ?? "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function resolveCandidateSheetNames(
  workbook: XLSX.WorkBook,
  sheetNamePattern?: RegExp,
  skipPattern?: RegExp,
) {
  const names = workbook.SheetNames.filter((name) => workbook.Sheets[name]);
  if (sheetNamePattern) {
    return names.filter((name) => sheetNamePattern.test(name));
  }

  const preferred = names.filter((name) => /店舗/.test(name) && !skipPattern?.test(name));
  const rest = names.filter((name) => !preferred.includes(name) && !skipPattern?.test(name));
  return [...preferred, ...rest];
}

function inferRetailerFromMetadata(metadataText: string) {
  const normalized = metadataText.normalize("NFKC");
  const corpMatch = normalized.match(/法人：\s*([^\s　/／]+)/);
  if (corpMatch?.[1]) {
    const token = corpMatch[1].replace(/[（(].*$/, "").trim();
    const aliased = RETAILER_ALIASES[token] ?? RETAILER_ALIASES[token.toLowerCase()];
    if (aliased) {
      return aliased;
    }
  }

  if (/任意単品分析/.test(normalized) && /ドンキ/.test(normalized)) {
    return "ドン・キホーテ";
  }

  return "";
}

function findHeaderIndex(headerKeys: string[], candidates: Set<string>) {
  const index = headerKeys.findIndex((key) => candidates.has(key));
  return index >= 0 ? index : undefined;
}

function findHeaderIndexByPriority(headerKeys: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const index = headerKeys.findIndex((key) => key === candidate);
    if (index >= 0) {
      return index;
    }
  }

  return undefined;
}

function isQtyHeader(value: string) {
  return QTY_HEADERS.includes(value);
}

function isAmountHeader(value: string) {
  return AMOUNT_HEADERS.includes(value);
}

function toPeriod(match: RegExpMatchArray) {
  return {
    start: `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`,
    end: `${match[4]}-${pad2(match[5])}-${pad2(match[6])}`,
  };
}

function pad2(value: string) {
  return value.padStart(2, "0");
}
