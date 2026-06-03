import type { ImportError, SupplierMapping } from "./types";

type ParsePdfOrderTextResult = {
  rows: Record<string, unknown>[];
  errors: ImportError[];
};

const janPattern = /(?:\d[\s-]*){13}/g;
const datePattern =
  /\d{2,4}\s*[\/\-.年月]\s*\d{1,2}\s*[\/\-.月]\s*\d{1,2}(?!\d)\s*日?/g;
const labelOnlyPattern =
  /^(?:発注元|発注先|お届先|お届け先|お届先住所|お届け先住所|お届先TEL|お届け先TEL|取引区分|発注番号|発注日|着荷指定|着荷指定日|口座|商品コード\/品名|人数|ケース|バラ数量|有償|景品|単価|条件区分|金額|備考|摘要|金額合計|受付日時)$/;

export function parsePdfOrderText(params: {
  text: string;
  mapping: SupplierMapping;
}): ParsePdfOrderTextResult {
  const text = normalizeOcrText(params.text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const metadata = extractMetadata(text, lines, params.mapping);
  const lineItems = extractLineItems(lines);
  const errors: ImportError[] = [];

  if (!metadata.orderNo) {
    errors.push(buildFileError("発注番号をPDFから特定できませんでした。"));
  }

  if (!metadata.orderDate) {
    errors.push(buildFileError("発注日をPDFから特定できませんでした。"));
  }

  if (!metadata.arrivalDueDate) {
    errors.push(buildFileError("着荷指定日をPDFから特定できませんでした。"));
  }

  if (lineItems.length === 0) {
    errors.push(buildFileError("JANコードと数量の組み合わせをPDFから特定できませんでした。"));
  }

  if (errors.length > 0) {
    return { rows: [], errors };
  }

  return {
    rows: lineItems.map((item) => ({
      [params.mapping.columns.order_no]: metadata.orderNo,
      [params.mapping.columns.order_date]: metadata.orderDate,
      [params.mapping.columns.arrival_due_date]: metadata.arrivalDueDate,
      [params.mapping.columns.ship_to_name]: metadata.shipToName,
      [params.mapping.columns.ship_to_center]: metadata.shipToCenter,
      [params.mapping.columns.ship_to_address]: metadata.shipToAddress,
      [params.mapping.columns.ship_to_tel]: metadata.shipToTel,
      [params.mapping.columns.warehouse]: metadata.warehouse,
      [params.mapping.columns.jan]: item.jan,
      [params.mapping.columns.qty]: item.qty,
    })),
    errors: [],
  };
}

function extractMetadata(text: string, lines: string[], mapping: SupplierMapping) {
  const dates = extractDates(text);
  const warehouseValueMap = mapping.valueMaps.warehouse ?? {};
  const orderNo =
    extractValue(text, [
      /発注\s*(?:No|NO|番号|書番号)\s*[:：]?\s*([A-Z0-9][A-Z0-9\-_/]*)/i,
      /注文\s*(?:No|NO|番号)\s*[:：]?\s*([A-Z0-9][A-Z0-9\-_/]*)/i,
      /NO\.\s*([A-Z0-9][A-Z0-9\-_/]*)/i,
    ]) || extractValueAfterLabel(lines, ["発注番号", "注文番号"]);
  const shipToName =
    extractValue(text, [
      /お届け先会社名\s*[:：]?\s*([^\n]+)/,
      /納品先\s*[:：]?\s*([^\n]+)/,
      /届け先\s*[:：]?\s*([^\n]+)/,
      /お届先\s*[:：]?\s*([^\n]+)/,
    ]) || extractShipToName(lines);
  const warehouse = extractWarehouse(text, lines, Object.keys(warehouseValueMap));

  return {
    orderNo,
    orderDate:
      extractDateByLabel(text, [/発注日\s*[:：]?\s*([0-9年月日/\-. ]+)/]) ?? dates[0] ?? "",
    arrivalDueDate:
      extractDateByLabel(text, [
        /着荷指定日\s*[:：]?\s*([0-9年月日/\-. ]+)/,
        /着荷指定\s*[:：]?\s*([0-9年月日/\-. ]+)/,
        /若狗指定\s*[:：]?\s*([0-9年月日/\-. ]+)/,
        /納品(?:予定)?日\s*[:：]?\s*([0-9年月日/\-. ]+)/,
        /到着(?:予定)?日\s*[:：]?\s*([0-9年月日/\-. ]+)/,
      ]) ??
      extractDateAfterLabel(lines, ["着荷指定日", "着荷指定", "若狗指定", "着狗指定"]) ??
      dates.find((date) => date !== dates[0]) ??
      "",
    shipToName: shipToName || "PDF発注書のお届け先",
    shipToCenter: extractValue(text, [/センター名\s*[:：]?\s*([^\n]+)/]),
    shipToAddress: extractValue(text, [
      /お届先住所\s*[:：]?\s*([^\n]+)/,
      /お届け先住所\s*[:：]?\s*([^\n]+)/,
      /住所\s*[:：]?\s*([^\n]+)/,
    ]),
    shipToTel: extractValue(text, [
      /お届先TEL\s*[:：]?\s*([0-9\-()]+)/,
      /お届け先TEL\s*[:：]?\s*([0-9\-()]+)/,
      /電話番号\s*[:：]?\s*([0-9\-()]+)/,
      /TEL\s*[:：]?\s*([0-9\-()]+)/i,
    ]),
    warehouse: warehouse || "PDF発注書",
  };
}

function extractLineItems(lines: string[]) {
  const items: { jan: string; qty: number }[] = [];

  lines.forEach((line, index) => {
    const matches = [...line.matchAll(janPattern)];

    matches.forEach((match) => {
      const jan = match[0].replace(/\D/g, "");
      const rest = line.slice((match.index ?? 0) + match[0].length);
      const qty =
        extractQty(rest) ??
        extractQty(lines[index + 1] ?? "") ??
        extractQtyFromFollowingLines(lines, index + 1);

      if (jan.length === 13 && qty !== null) {
        items.push({ jan, qty });
      }
    });
  });

  return dedupeLineItems(items);
}

function extractQtyFromFollowingLines(lines: string[], startIndex: number) {
  for (const line of lines.slice(startIndex, startIndex + 8)) {
    const qty = extractQty(line);

    if (qty !== null) {
      return qty;
    }
  }

  return null;
}

function extractQty(text: string) {
  const normalized = text.replace(/,/g, "");
  const labeled = normalized.match(/(?:数量|個数|発注数|注文数)\D{0,8}(\d{1,5})/);
  const fallback = normalized.match(/(?:^|\D)(\d{1,5})(?:\D|$)/);
  const value = Number(labeled?.[1] ?? fallback?.[1]);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function dedupeLineItems(items: { jan: string; qty: number }[]) {
  const result = new Map<string, { jan: string; qty: number }>();

  items.forEach((item) => {
    const key = `${item.jan}:${item.qty}`;
    result.set(key, item);
  });

  return Array.from(result.values());
}

function extractValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1]?.trim();

    if (value) {
      return cleanupValue(value);
    }
  }

  return "";
}

function extractDateByLabel(text: string, patterns: RegExp[]) {
  const value = extractValue(text, patterns);

  return value ? normalizeDate(value) : null;
}

function extractDateAfterLabel(lines: string[], labels: string[]) {
  const index = lines.findIndex((line) => labels.some((label) => line.includes(label)));

  if (index === -1) {
    return null;
  }

  for (const line of lines.slice(index + 1, index + 8)) {
    const date = line.match(datePattern)?.[0];

    if (date) {
      return normalizeDate(date);
    }
  }

  return null;
}

function extractDates(text: string) {
  return [...text.matchAll(datePattern)]
    .map((match) => normalizeDate(match[0]))
    .filter(Boolean);
}

function extractWarehouse(text: string, lines: string[], knownCodes: string[]) {
  const value = extractValue(text, [
    /倉庫\s*[:：]?\s*([^\n]+)/,
    /出荷倉庫\s*[:：]?\s*([^\n]+)/,
  ]) || extractValueAfterLabel(lines, ["倉庫", "出荷倉庫"]);

  if (value) {
    const knownCode = knownCodes.find((code) => value.includes(code));
    return knownCode ?? value;
  }

  return knownCodes.find((code) => new RegExp(`(?:No\\.?|NO\\.?|#)?\\s*${code}\\b`, "i").test(text)) ?? "";
}

function normalizeDate(value: string) {
  const parts = value.match(/\d{1,4}/g);

  if (!parts || parts.length < 3) {
    return "";
  }

  const [year, month, day] = parts;
  const normalizedYear = year.length === 2 ? `20${year}` : year;

  return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeOcrText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanupValue(value: string) {
  return value.replace(/\s{2,}.*/, "").trim();
}

function extractValueAfterLabel(lines: string[], labels: string[]) {
  const index = lines.findIndex((line) => labels.some((label) => line.includes(label)));

  if (index === -1) {
    return "";
  }

  const value = lines.slice(index + 1, index + 8).find((line) => {
    const trimmed = line.trim();

    return trimmed && !labelOnlyPattern.test(trimmed);
  });

  return value ? cleanupValue(value) : "";
}

function extractShipToName(lines: string[]) {
  const index = lines.findIndex((line) =>
    ["お届先", "お届け先", "納品先"].some((label) => line.includes(label)),
  );

  if (index === -1) {
    return "";
  }

  for (const line of lines.slice(index + 1, index + 5)) {
    const trimmed = line.trim();

    if (/お届先住所|お届け先住所|お届先TEL|お届け先TEL|取引区分/.test(trimmed)) {
      return "";
    }

    if (trimmed && !labelOnlyPattern.test(trimmed)) {
      return cleanupValue(trimmed);
    }
  }

  return "";
}

function buildFileError(message: string): ImportError {
  return { row: 0, field: "pdf", message };
}
