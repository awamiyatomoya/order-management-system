import {
  isArataDeliveryWorkbook,
  parseArataDeliveryWorkbook,
} from "@/lib/arata-delivery-parser";
import type { DeliveryDestination } from "@/lib/delivery-destination-master";
import type { ImportError } from "@/lib/types";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export async function parseDeliveryDestinationSpreadsheet(file: File) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);

    if (isArataDeliveryWorkbook(workbook)) {
      return parseArataDeliveryWorkbook(workbook);
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    return parseStandardDeliveryDestinationRows(rows);
  }

  if (fileName.endsWith(".csv")) {
    const text = await readCsvText(file);
    const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: reject,
      });
    });

    return parseStandardDeliveryDestinationRows(rows);
  }

  throw new Error("ExcelまたはCSVファイルをアップロードしてください。");
}

function parseStandardDeliveryDestinationRows(rows: Record<string, unknown>[]) {
  const destinations: DeliveryDestination[] = [];
  const errors: ImportError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const destination = normalizeDeliveryDestinationImportRow(row);

    if (
      !destination.code ||
      !destination.wholesalerName ||
      !destination.name ||
      !destination.postalCode ||
      !destination.address1 ||
      !destination.tel
    ) {
      errors.push({
        row: rowNumber,
        field: "deliveryDestination",
        message: "配送先コード、問屋名、配送先名、郵便番号、住所1、TELは必須です。",
      });
      return;
    }

    destinations.push(destination);
  });

  return {
    destinations: dedupeDeliveryDestinations(destinations),
    errors,
  };
}

function normalizeDeliveryDestinationImportRow(row: Record<string, unknown>): DeliveryDestination {
  const code = getSpreadsheetValue(row, [
    "配送先コード",
    "配送コード",
    "納品先コード",
    "届け先コード",
    "お届け先コード",
    "コード",
  ]);
  const wholesalerName = getSpreadsheetValue(row, ["問屋名", "問屋", "卸先", "卸", "取引先"]);
  const name = getSpreadsheetValue(row, [
    "配送先名",
    "納品先名",
    "届け先名",
    "お届け先名",
    "センター名",
    "名称",
    "名前",
  ]);
  const postalCode = getSpreadsheetValue(row, ["郵便番号", "郵便", "〒", "郵便No"]);
  const address1 = getSpreadsheetValue(row, ["住所1", "住所", "所在地", "住所①"]);
  const address2 = getSpreadsheetValue(row, ["住所2", "住所②", "建物名", "建物"]);
  const address3 = getSpreadsheetValue(row, ["住所3", "住所③", "備考住所"]);
  const tel = getSpreadsheetValue(row, ["TEL", "Tel", "tel", "電話番号", "電話"]);
  const aliases = getSpreadsheetValue(row, [
    "別名・OCR候補",
    "別名",
    "OCR候補",
    "エイリアス",
    "候補名",
  ])
    .split(/[\n,、]/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return {
    code,
    wholesalerName,
    name,
    postalCode,
    address1,
    address2,
    address3,
    tel,
    aliases: Array.from(new Set([name, ...aliases].filter(Boolean))),
  };
}

function getSpreadsheetValue(row: Record<string, unknown>, candidateKeys: string[]) {
  const normalizedCandidates = candidateKeys.map(normalizeSpreadsheetHeader);
  const matchedKey = Object.keys(row).find((key) =>
    normalizedCandidates.includes(normalizeSpreadsheetHeader(key)),
  );

  if (!matchedKey) {
    return "";
  }

  const value = row[matchedKey];

  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeSpreadsheetHeader(header: string) {
  return header
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s＿_\-‐ー－・:：()（）［\]\[\].．。]/g, "");
}

function dedupeDeliveryDestinations(destinations: DeliveryDestination[]) {
  const map = new Map<string, DeliveryDestination>();

  destinations.forEach((destination) => {
    map.set(destination.code, destination);
  });

  return Array.from(map.values());
}

async function readCsvText(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);

  if (!utf8Text.includes("\uFFFD")) {
    return utf8Text;
  }

  return new TextDecoder("shift-jis").decode(buffer);
}
