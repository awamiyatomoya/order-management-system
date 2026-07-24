import * as XLSX from "xlsx";
import {
  buildStoreNameMatchKeys,
  normalizeStoreLocationName,
  type StoreLocation,
} from "@/lib/store-location-matching";
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
const addressBookSheetNamePattern = /販促物|送付先|店舗住所|店舗マスタ|アインズ|ｱｲﾝｽﾞ/;
const skippedIntroductionSheetNamePattern =
  /^(設定|発注サイクル|取引先|商品マスタ|切替マスタ|JAN指定|Shop|目標|CSV|EDI|②)/;

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

    if (
      skippedIntroductionSheetNamePattern.test(sheetName.trim()) &&
      !sheetMentionsAinzShipmentList(sheet)
    ) {
      continue;
    }

    const handsAllocation = tryParseHandsAllocationListSheet(sheet);
    if (handsAllocation.entries.length > 0) {
      formatKey = formatKey ?? "hands-allocation-list";
      allEntries.push(...handsAllocation.entries);
      parsedSheetCount += 1;
      continue;
    }

    const ainzShipment = tryParseAinzShipmentListSheet(sheet, workbook);
    if (ainzShipment.entries.length > 0) {
      formatKey = formatKey ?? "ainz-shipment-list";
      allEntries.push(...ainzShipment.entries);
      parsedSheetCount += 1;
      continue;
    }

    const storeAllocation = tryParseStoreAllocationListSheet(sheet, sheetName);
    if (storeAllocation.entries.length > 0) {
      formatKey = formatKey ?? "store-allocation-list";
      allEntries.push(...storeAllocation.entries);
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
      continue;
    }

    const promotionalAddressList = tryParsePromotionalAddressListSheet(sheet);
    if (promotionalAddressList.entries.length > 0) {
      formatKey = formatKey ?? "promotional-address-list";
      allEntries.push(...promotionalAddressList.entries);
      parsedSheetCount += 1;
      continue;
    }
  }

  if (allEntries.length === 0) {
    throw new Error(
      "導入店舗シートを読み取れませんでした。フェーズ1対応形式（店舗一覧表・0/1フラグ表・ハンズ按分表・店舗割振表・住所録・アインズ送り込みリスト）か確認してください。",
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

function tryParsePromotionalAddressListSheet(sheet: XLSX.WorkSheet): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return (
      normalized.some((cell) => ["各店コード", "店舗コード", "店コード"].includes(cell)) &&
      normalized.some((cell) =>
        ["送り先名称①", "送り先名称1", "送り先名称", "店舗名", "店名"].includes(cell),
      ) &&
      normalized.some((cell) => ["住所①", "住所1", "住所"].includes(cell))
    );
  });

  if (headerIndex === -1 || looksLikeFlagListSheet(rows)) {
    return { formatKey: "row-list", entries: [], sheetCount: 0 };
  }

  const header = rows[headerIndex].map(normalizeHeaderCell);
  const storeCodeIndex = findColumnIndex(header, ["各店コード", "店舗コード", "店コード", "回答店番", "店番"]);
  const storeNameIndex = findColumnIndex(header, [
    "送り先名称①",
    "送り先名称1",
    "送り先名称",
    "店舗名",
    "店名",
  ]);
  const postalCodeIndex = findColumnIndex(header, ["郵便番号"]);
  const addressIndex = findColumnIndex(header, ["住所①", "住所1", "住所"]);
  const quantityIndex = findColumnIndex(header, ["個数"]);
  const unitCountIndex = findColumnIndex(header, ["台数"]);
  const panelIndex = findColumnIndex(header, ["パネル"]);
  const metadata = findPromotionalAddressMetadata(rows.slice(0, headerIndex));
  const entries: ParsedStoreIntroductionEntry[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const storeName = stringCell(row[storeNameIndex]);
    const storeCode = stringCell(row[storeCodeIndex]);

    if (!storeName) {
      continue;
    }

    entries.push({
      jan: metadata.jan || "UNKNOWN",
      productName: metadata.productName,
      storeName,
      storeCode,
      address: stringCell(row[addressIndex]),
      postalCode: normalizePostalCode(stringCell(row[postalCodeIndex])),
      isIntroduced: isPromotionalAddressIntroduced(row, {
        quantityIndex,
        unitCountIndex,
        panelIndex,
      }),
    });
  }

  if (entries.length < 5) {
    return { formatKey: "row-list", entries: [], sheetCount: 0 };
  }

  return {
    formatKey: "promotional-address-list",
    entries: dedupeEntries(entries),
    sheetCount: 0,
  };
}

function isAinzShipmentIntroduced(row: unknown[]) {
  return isPositiveAllocation(row[4]);
}

function toAinzShipmentStoreCode(storeCode: string) {
  const normalized = storeCode.trim();
  if (/^10\d{3,4}$/.test(normalized)) {
    return normalized;
  }

  const shortCode = String(Number(normalized.replace(/\D/g, "") || normalized));
  if (!shortCode || shortCode === "NaN") {
    return normalized;
  }

  return `10${shortCode.padStart(3, "0")}`;
}

function isAinzShipmentStoreRow(storeCode: string, storeName: string) {
  if (!/^10\d{3,4}$/.test(storeCode)) {
    return false;
  }

  if (!storeName || storeName.includes("全店")) {
    return false;
  }

  if (/^関東\d+$/.test(storeName) || /^九州\d+$/.test(storeName)) {
    return false;
  }

  if (/^新店/.test(storeName)) {
    return false;
  }

  if (storeName === "札幌センター" || storeName === "関東センター") {
    return false;
  }

  if (/^アイン薬局/.test(storeName)) {
    return false;
  }

  if (isAinzNonPhysicalStoreName(storeName)) {
    return false;
  }

  return true;
}

function isAinzNonPhysicalStoreName(storeName: string) {
  const normalized = normalizeStoreLocationName(storeName);
  return /webstore|ウェブストア|通販|オンライン/.test(normalized);
}

function buildAinzShipmentStatusMap(rows: unknown[][]) {
  const storeHeaderIndex = findAinzShipmentStoreHeaderIndex(rows);
  const statusMap = new Map<string, AinzIntroductionStatus>();
  let sawStoreRow = false;

  for (const row of rows.slice(storeHeaderIndex + 1)) {
    const storeCode = stringCell(row[1]);
    const storeName = stringCell(row[2]);

    if (!storeCode && !storeName) {
      if (sawStoreRow) {
        break;
      }
      continue;
    }

    if (!isAinzShipmentStoreRow(storeCode, storeName)) {
      continue;
    }

    sawStoreRow = true;
    const shipmentStatus: AinzIntroductionStatus = {
      isIntroduced: isAinzShipmentIntroduced(row),
      storeName,
      storeCode,
    };

    buildAinzStoreCodeAliases(storeCode).forEach((alias) => {
      statusMap.set(alias, shipmentStatus);
    });
  }

  return statusMap;
}

type AinzIntroductionStatus = {
  isIntroduced: boolean;
  storeName: string;
  storeCode: string;
};

function registerAinzIntroductionStatus(
  statusByCode: Map<string, AinzIntroductionStatus>,
  statusByName: Map<string, AinzIntroductionStatus>,
  storeCode: string,
  storeName: string,
  status: AinzIntroductionStatus,
  addressBook?: Map<string, PromotionalAddressEntry>,
) {
  buildAinzStoreCodeAliases(storeCode).forEach((alias) => {
    statusByCode.set(alias, status);
  });

  buildAinzStoreNameMatchKeys(storeName).forEach((key) => {
    statusByName.set(key, status);
  });

  if (!addressBook) {
    return;
  }

  const addressEntry = lookupAinzAddressBookEntry(storeCode, addressBook);
  if (addressEntry) {
    buildAinzStoreNameMatchKeys(addressEntry.storeName).forEach((key) => {
      statusByName.set(key, status);
    });
  }
}

function lookupAinzShipmentStatus(
  storeCode: string,
  statusMap: Map<string, AinzIntroductionStatus>,
) {
  for (const alias of buildAinzStoreCodeAliases(storeCode)) {
    const status = statusMap.get(alias);
    if (status) {
      return status;
    }
  }

  return undefined;
}

export function mergeAinzIntroductionEntriesWithStoreMaster(
  entries: ParsedStoreIntroductionEntry[],
  locations: Array<
    Pick<StoreLocation, "storeCode" | "storeName" | "postalCode" | "address"> & {
      chainName?: string;
    }
  >,
  addressBook?: Map<string, PromotionalAddressEntry>,
) {
  const ainzLocations = locations.filter((location) =>
    Boolean(location.storeCode?.startsWith("ainz-")),
  );

  if (ainzLocations.length < 5) {
    return entries;
  }

  const statusByCode = new Map<string, AinzIntroductionStatus>();
  const statusByName = new Map<string, AinzIntroductionStatus>();

  entries.forEach((entry) => {
    if (!isAinzShipmentStoreRow(entry.storeCode, entry.storeName)) {
      return;
    }

    const status: AinzIntroductionStatus = {
      isIntroduced: entry.isIntroduced,
      storeName: entry.storeName,
      storeCode: entry.storeCode,
    };

    registerAinzIntroductionStatus(
      statusByCode,
      statusByName,
      entry.storeCode,
      entry.storeName,
      status,
      addressBook,
    );
  });

  const metadata = {
    jan: entries[0]?.jan ?? "",
    productName: entries[0]?.productName ?? "",
  };

  const claimedShipmentCodes = new Set<string>();
  const merged = ainzLocations.map((location) => {
    const shipmentStatus = lookupAinzIntroductionStatusForOfficialStore(
      location,
      statusByCode,
      statusByName,
    );

    if (shipmentStatus?.storeCode) {
      buildAinzStoreCodeAliases(shipmentStatus.storeCode).forEach((alias) => {
        claimedShipmentCodes.add(alias);
      });
    }

    return {
      jan: metadata.jan,
      productName: metadata.productName,
      storeName: location.storeName,
      storeCode: location.storeCode,
      address: location.address,
      postalCode: location.postalCode || extractPostalCodeFromAddress(location.address),
      isIntroduced: shipmentStatus?.isIntroduced ?? false,
    };
  });

  const unmatchedIntroduced = entries.filter((entry) => {
    if (!entry.isIntroduced || !isAinzShipmentStoreRow(entry.storeCode, entry.storeName)) {
      return false;
    }

    return !buildAinzStoreCodeAliases(entry.storeCode).some((alias) =>
      claimedShipmentCodes.has(alias),
    );
  });

  return dedupeEntries([
    ...merged,
    ...unmatchedIntroduced.map((entry) => ({
      jan: metadata.jan || entry.jan,
      productName: metadata.productName || entry.productName,
      storeName: entry.storeName,
      storeCode: entry.storeCode,
      address: entry.address,
      postalCode: entry.postalCode,
      isIntroduced: true,
    })),
  ]);
}

function lookupAinzIntroductionStatusForOfficialStore(
  location: Pick<StoreLocation, "storeCode" | "storeName">,
  statusByCode: Map<string, AinzIntroductionStatus>,
  statusByName: Map<string, AinzIntroductionStatus>,
) {
  const byCode = lookupAinzShipmentStatus(location.storeCode, statusByCode);
  if (byCode) {
    return byCode;
  }

  return lookupAinzIntroductionStatusByName(location.storeName, statusByName);
}

function lookupAinzIntroductionStatusByName(
  storeName: string,
  statusByName: Map<string, AinzIntroductionStatus>,
) {
  for (const key of buildAinzStoreNameMatchKeys(storeName)) {
    const status = statusByName.get(key);
    if (status) {
      return status;
    }
  }

  const targetKeys = buildAinzStoreNameMatchKeys(storeName).filter((key) => key.length >= 3);
  if (targetKeys.length === 0) {
    return undefined;
  }

  for (const [key, status] of statusByName.entries()) {
    if (key.length < 3) {
      continue;
    }

    if (
      targetKeys.some(
        (target) =>
          target.includes(key) ||
          key.includes(target) ||
          target.endsWith(key) ||
          key.endsWith(target),
      )
    ) {
      return status;
    }
  }

  return undefined;
}

function buildAinzStoreNameMatchKeys(storeName: string) {
  const keys = new Set<string>(buildStoreNameMatchKeys(storeName));
  const core = normalizeAinzStoreMatchName(storeName);

  if (core.length >= 2) {
    keys.add(core);
  }

  return Array.from(keys);
}

function normalizeAinzStoreMatchName(storeName: string) {
  return normalizeStoreLocationName(storeName)
    .replace(/^アインズ(?:アンドトルペ|&トルペ)?/, "")
    .replace(/店$/, "")
    .replace(/\d+[fｆ階]$/i, "")
    .replace(/duo/g, "デュオ")
    .replace(/新札幌/g, "新さっぽろ")
    .replace(/parco/g, "パルコ");
}

function tryParseAinzShipmentListSheet(
  sheet: XLSX.WorkSheet,
  workbook: XLSX.WorkBook,
): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);

  if (!looksLikeAinzShipmentListSheet(rows)) {
    return { formatKey: "ainz-shipment-list", entries: [], sheetCount: 0 };
  }

  const metadata = findAinzShipmentMetadata(rows);
  if (!metadata.jan) {
    return { formatKey: "ainz-shipment-list", entries: [], sheetCount: 0 };
  }

  const addressBook = loadAinzAddressBook(workbook);
  const statusMap = buildAinzShipmentStatusMap(rows);

  const storeHeaderIndex = findAinzShipmentStoreHeaderIndex(rows);
  const entries: ParsedStoreIntroductionEntry[] = [];
  let sawStoreRow = false;

  for (const row of rows.slice(storeHeaderIndex + 1)) {
    const storeCode = stringCell(row[1]);
    const storeName = stringCell(row[2]);

    if (!storeCode && !storeName) {
      if (sawStoreRow) {
        break;
      }
      continue;
    }

    if (!isAinzShipmentStoreRow(storeCode, storeName)) {
      continue;
    }

    sawStoreRow = true;

    const addressEntry = lookupAinzAddressBookEntry(storeCode, addressBook);
    const shipmentStatus = lookupAinzShipmentStatus(storeCode, statusMap);

    entries.push({
      jan: metadata.jan,
      productName: metadata.productName,
      storeName: addressEntry?.storeName || storeName,
      storeCode,
      address: "",
      postalCode: "",
      isIntroduced: shipmentStatus?.isIntroduced ?? isAinzShipmentIntroduced(row),
    });
  }

  if (entries.length < 5) {
    return { formatKey: "ainz-shipment-list", entries: [], sheetCount: 0 };
  }

  return {
    formatKey: "ainz-shipment-list",
    entries: dedupeEntries(entries),
    sheetCount: 0,
  };
}

function looksLikeAinzShipmentListSheet(rows: unknown[][]) {
  const hasTitle = rows.some((row) => row.some((cell) => stringCell(cell).includes("本部送り込みリスト")));
  const metadata = findAinzShipmentMetadata(rows);

  return hasTitle && Boolean(metadata.jan);
}

function findAinzShipmentMetadata(rows: unknown[][]) {
  let jan = "";
  let productName = "";

  for (const row of rows.slice(0, 20)) {
    const normalized = row.map(normalizeHeaderCell);
    const janLabelIndex = normalized.findIndex((cell) => cell === "jan" || cell === "ｊａｎ");
    if (janLabelIndex >= 0) {
      const candidateJan = extractJan(row[janLabelIndex + 1] ?? row[4]);
      if (candidateJan) {
        jan = candidateJan;
      }
    }

    const codeLabel = normalizeHeaderCell(row[1]);
    const nameLabel = normalizeHeaderCell(row[2]);
    const productLabel = normalizeHeaderCell(row[3]);
    if (
      (codeLabel === "コ-ド" || codeLabel === "コード" || codeLabel.includes("コード")) &&
      (nameLabel === "名" || nameLabel === "店名") &&
      productLabel.includes("商品名")
    ) {
      const candidateProductName = stringCell(row[4]);
      if (candidateProductName && candidateProductName !== "バーコード") {
        productName = candidateProductName;
      }
    }
  }

  return { jan, productName };
}

function findAinzShipmentStoreHeaderIndex(rows: unknown[][]) {
  const index = rows.findIndex((row) => {
    const codeLabel = normalizeHeaderCell(row[1]);
    const nameLabel = normalizeHeaderCell(row[2]);
    return (
      (codeLabel === "コ-ド" || codeLabel === "コード" || codeLabel.includes("コード")) &&
      (nameLabel === "名" || nameLabel === "店名")
    );
  });

  return index >= 0 ? index : 13;
}

export function buildAinzStoreCodeAliases(storeCode: string) {
  const normalized = storeCode.trim();
  const aliases = new Set<string>([normalized]);

  const ainzMatch = normalized.match(/^ainz-0*(\d+)$/i);
  if (ainzMatch) {
    addAinzNumericCodeAliases(aliases, ainzMatch[1]);
  }

  if (/^10\d{3,4}$/.test(normalized)) {
    addAinzNumericCodeAliases(aliases, normalized.slice(1));
  }

  if (/^\d{1,4}$/.test(normalized)) {
    addAinzNumericCodeAliases(aliases, normalized);
  }

  return Array.from(aliases);
}

function addAinzNumericCodeAliases(aliases: Set<string>, rawNumeric: string) {
  const numeric = String(Number(rawNumeric));
  if (!numeric || numeric === "NaN") {
    return;
  }

  const padded4 = numeric.padStart(4, "0");
  const shipmentCode = `10${numeric.padStart(3, "0")}`;

  aliases.add(numeric);
  aliases.add(padded4);
  aliases.add(shipmentCode);
  aliases.add(`ainz-${padded4}`);
  aliases.add(`ainz-${numeric}`);
}

function toAinzAddressStoreCode(shipmentStoreCode: string) {
  const normalized = shipmentStoreCode.trim();
  if (/^10\d{3,4}$/.test(normalized)) {
    return String(Number(normalized.slice(1)));
  }

  return normalized;
}

function loadAinzAddressBook(workbook: XLSX.WorkBook) {
  const map = new Map<string, PromotionalAddressEntry>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = sheetToRows(sheet);
    const hasAinzHeader = rows.some((row) =>
      row
        .map(normalizeHeaderCell)
        .some((cell) => cell === "販売店様名" || cell.includes("販売店様名")),
    );

    if (!hasAinzHeader && !/アインズ|ｱｲﾝｽﾞ/.test(sheetName)) {
      continue;
    }

    parseAddressBookRows(rows).forEach((entry) => {
      map.set(entry.storeCode, entry);
      buildAinzStoreCodeAliases(entry.storeCode).forEach((alias) => {
        if (!map.has(alias)) {
          map.set(alias, entry);
        }
      });
    });
  }

  return map;
}

export function loadAinzAddressBookFromBuffer(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return loadAinzAddressBook(workbook);
}

function lookupAinzAddressBookEntry(
  storeCode: string,
  addressBook: Map<string, PromotionalAddressEntry>,
) {
  for (const alias of buildAinzStoreCodeAliases(storeCode)) {
    const entry = addressBook.get(alias);
    if (entry) {
      return entry;
    }
  }

  const shortCode = toAinzAddressStoreCode(storeCode);
  return addressBook.get(shortCode) ?? addressBook.get(storeCode);
}

function extractPostalCodeFromAddress(address: string) {
  const match = address.trim().match(/^(\d{3}-\d{4}|\d{7})\b/);
  if (!match) {
    return "";
  }

  return normalizePostalCode(match[1]);
}

export function countWorkbookAddressBookEntries(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return buildPromotionalAddressBook(workbook).size;
}

function findPromotionalAddressMetadata(rows: unknown[][]) {
  let bestProductName = "";
  let bestProductScore = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    for (const cell of row) {
      const text = stringCell(cell);
      if (!text) {
        continue;
      }

      if (!/エシエンス|ダーマ|esience|cxaz/i.test(text)) {
        continue;
      }

      const score = scorePromotionalAddressProductName(text);
      if (score > bestProductScore) {
        bestProductScore = score;
        bestProductName = text.replace(/^★/, "").trim();
      }
    }
  }

  const jan = rows.flatMap((row) => row.map((cell) => extractJan(cell))).find(Boolean) ?? "";

  return {
    jan,
    productName: bestProductName || "販促物",
  };
}

function scorePromotionalAddressProductName(productName: string) {
  let score = scoreWorkbookProductRow(productName);

  const normalized = normalizeProductMatchText(productName);
  if (/パネル|w600|沢尻/.test(normalized)) {
    score -= 120;
  }

  if (/什器|販促物|依頼/.test(normalized)) {
    score -= 40;
  }

  if (normalized.includes("ダーマインショット") || normalized.includes("ダーマショット")) {
    score += 80;
  }

  return score;
}

function isPromotionalAddressIntroduced(
  row: unknown[],
  indexes: { quantityIndex: number; unitCountIndex: number; panelIndex: number },
) {
  const panel = stringCell(row[indexes.panelIndex]);
  if (panel.includes("●")) {
    return true;
  }

  if (isPositiveAllocation(row[indexes.quantityIndex])) {
    return true;
  }

  const unitCount = stringCell(row[indexes.unitCountIndex]).replace(/[　\s]/g, "");
  if (unitCount && /\d/.test(unitCount) && !/^0/.test(unitCount)) {
    return true;
  }

  return false;
}

function normalizePostalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return value.trim();
}

function tryParseStoreAllocationListSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);

  if (!looksLikeStoreAllocationListSheet(rows, sheetName)) {
    return { formatKey: "store-allocation-list", entries: [], sheetCount: 0 };
  }

  const jan = findStoreAllocationMetadataValue(rows, ["jan"]);
  const productName = findStoreAllocationMetadataValue(rows, [
    "商品名orシリーズ名",
    "商品名称",
    "商品名",
  ]);
  const productColumns = findStoreAllocationProductColumns(rows, jan);

  if (!jan || productColumns.length === 0) {
    return { formatKey: "store-allocation-list", entries: [], sheetCount: 0 };
  }

  const entries: ParsedStoreIntroductionEntry[] = [];

  for (const row of rows) {
    const storeCode = stringCell(row[0]);
    const storeName = stringCell(row[1]);

    if (!/^\d{2,4}$/.test(storeCode) || !storeName || storeName.includes("全店")) {
      continue;
    }

    productColumns.forEach(({ columnIndex, jan: columnJan, productName: columnProductName }) => {
      entries.push({
        jan: columnJan,
        productName: columnProductName || productName,
        storeName,
        storeCode,
        address: "",
        postalCode: "",
        isIntroduced: isPositiveAllocation(row[columnIndex]),
      });
    });
  }

  if (entries.length < 5) {
    return { formatKey: "store-allocation-list", entries: [], sheetCount: 0 };
  }

  return {
    formatKey: "store-allocation-list",
    entries: dedupeEntries(entries),
    sheetCount: 0,
  };
}

function looksLikeStoreAllocationListSheet(rows: unknown[][], sheetName: string) {
  if (/店舗割振/.test(sheetName)) {
    return true;
  }

  const hasJanMetadata = rows.some((row) => {
    const label = normalizeHeaderCell(row[1]);
    return label === "jan" && Boolean(extractJan(row[4]));
  });
  const hasProductMetadata = rows.some((row) => {
    const label = normalizeHeaderCell(row[1]);
    return label.includes("商品名") && Boolean(stringCell(row[4]));
  });

  let storeRows = 0;

  for (const row of rows) {
    const storeCode = stringCell(row[0]);
    const storeName = stringCell(row[1]);

    if (!/^\d{2,4}$/.test(storeCode) || !storeName) {
      continue;
    }

    storeRows += 1;
  }

  return hasJanMetadata && hasProductMetadata && storeRows >= 5;
}

function findStoreAllocationMetadataValue(rows: unknown[][], labelCandidates: string[]) {
  const normalizedCandidates = labelCandidates.map((candidate) => normalizeHeaderCell(candidate));

  for (const row of rows.slice(0, 20)) {
    const label = normalizeHeaderCell(row[1]);

    if (!normalizedCandidates.some((candidate) => label === candidate || label.includes(candidate))) {
      continue;
    }

    const jan = extractJan(row[4]);
    if (jan) {
      return jan;
    }

    const value = stringCell(row[4]);
    if (value) {
      return value;
    }
  }

  return "";
}

function findStoreAllocationProductColumns(rows: unknown[][], fallbackJan: string) {
  const janRow = rows.find((row) => normalizeHeaderCell(row[1]) === "jan");
  const productNameRow = rows.find((row) => {
    const label = normalizeHeaderCell(row[1]);
    return label.includes("商品名");
  });

  if (!janRow) {
    return fallbackJan
      ? [
          {
            columnIndex: 4,
            jan: fallbackJan,
            productName: productNameRow ? stringCell(productNameRow[4]) : "",
          },
        ]
      : [];
  }

  const columns: { columnIndex: number; jan: string; productName: string }[] = [];

  for (let columnIndex = 4; columnIndex < janRow.length; columnIndex += 1) {
    const jan = extractJan(janRow[columnIndex]);

    if (!jan) {
      continue;
    }

    columns.push({
      columnIndex,
      jan,
      productName: productNameRow ? stringCell(productNameRow[columnIndex]) : "",
    });
  }

  if (columns.length === 0 && fallbackJan) {
    return [
      {
        columnIndex: 4,
        jan: fallbackJan,
        productName: productNameRow ? stringCell(productNameRow[4]) : "",
      },
    ];
  }

  return columns;
}

function tryParseFlagListSheet(sheet: XLSX.WorkSheet, workbook: XLSX.WorkBook): ParsedStoreIntroduction {
  const rows = sheetToRows(sheet);

  if (looksLikeStoreAllocationListSheet(rows, "")) {
    return { formatKey: "flag-list", entries: [], sheetCount: 0 };
  }

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
  const ainzHeaderIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return (
      normalized.some((cell) => cell === "販売店様名" || cell.includes("販売店様名")) &&
      normalized.some((cell) => ["住所", "住所1", "住所①"].includes(cell))
    );
  });

  if (ainzHeaderIndex >= 0) {
    const header = rows[ainzHeaderIndex].map(normalizeHeaderCell);
    const storeNameIndex = findColumnIndex(header, ["販売店様名", "店舗名", "店名"]);
    const addressIndex = findColumnIndex(header, ["住所", "住所1", "住所①"]);
    const telIndex = findColumnIndex(header, ["tel", "電話", "電話番号"]);

    return rows
      .slice(ainzHeaderIndex + 1)
      .map((row) => {
        const storeCode = stringCell(row[0]);
        const storeName = stringCell(row[storeNameIndex]);
        const addressText = stringCell(row[addressIndex]);

        if (!storeName || storeName === "販売店様名" || !looksLikeStoreAddress(addressText)) {
          return null;
        }

        return {
          storeCode,
          storeName,
          postalCode: extractPostalCodeFromAddress(addressText),
          address: addressText,
          tel: stringCell(row[telIndex]),
        };
      })
      .filter((entry): entry is PromotionalAddressEntry => Boolean(entry));
  }

  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    return (
      normalized.some((cell) => ["店舗コード", "店コード", "回答店番", "店番", "各店コード"].includes(cell)) &&
      normalized.some((cell) => ["店名", "店舗名", "送り先名称①", "送り先名称1", "送り先名称"].includes(cell)) &&
      normalized.some((cell) => ["住所", "住所1", "住所①"].includes(cell))
    );
  });

  if (headerIndex >= 0) {
    const header = rows[headerIndex].map(normalizeHeaderCell);
    const storeCodeIndex = findColumnIndex(header, ["店舗コード", "店コード", "回答店番", "店番", "各店コード"]);
    const storeNameIndex = findColumnIndex(header, ["店名", "店舗名", "送り先名称①", "送り先名称1", "送り先名称"]);
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

export function unifyIntroductionBatchProduct(
  entries: ParsedStoreIntroductionEntry[],
  clientId: string,
  products: { clientId: string; jan: string; name: string }[],
): { entries: ParsedStoreIntroductionEntry[]; warnings: string[] } {
  if (entries.length === 0) {
    return { entries, warnings: [] };
  }

  const janCounts = new Map<string, number>();
  entries.forEach((entry) => {
    if (!entry.jan || entry.jan === "UNKNOWN") {
      return;
    }
    janCounts.set(entry.jan, (janCounts.get(entry.jan) ?? 0) + 1);
  });

  const warnings: string[] = [];
  const uniqueJans = Array.from(janCounts.keys());
  if (uniqueJans.length > 1) {
    warnings.push(
      `1ファイル内に複数のJANが検出されました（${uniqueJans.join(" / ")}）。最も多いJANに統一して保存します。`,
    );
  }

  const dominantJan =
    Array.from(janCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    entries.find((entry) => entry.jan && entry.jan !== "UNKNOWN")?.jan ??
    "";
  const dominantEntry =
    entries.find((entry) => entry.jan === dominantJan) ??
    entries.find((entry) => entry.productName.trim()) ??
    entries[0];
  const resolved = resolveIntroductionProduct(
    dominantJan,
    dominantEntry.productName,
    clientId,
    products,
  );
  const displayProduct = resolveIntroductionDisplayProduct(
    resolved.jan,
    resolved.productName,
    clientId,
    products,
  );

  return {
    entries: entries.map((entry) => ({
      ...entry,
      jan: displayProduct.jan,
      productName: displayProduct.productName,
    })),
    warnings,
  };
}

function shouldPreferExcelProductName(excelName: string, masterName: string) {
  const excel = normalizeProductMatchText(excelName);
  const master = normalizeProductMatchText(masterName);

  if (!excel || excel === master) {
    return false;
  }

  if (excel.includes(master) && excel.length > master.length + 2) {
    return true;
  }

  if (excel.includes("14包") || excel.includes("esience") || excel.includes("エシエンス14")) {
    return true;
  }

  return false;
}

export function resolveIntroductionProduct(
  parsedJan: string,
  productName: string,
  clientId: string,
  products: { clientId: string; jan: string; name: string }[],
) {
  const clientProducts = products.filter((product) => product.clientId === clientId);

  const normalizedJan = parsedJan.trim();
  if (normalizedJan && normalizedJan !== "UNKNOWN") {
    const janMatch = clientProducts.find((product) => product.jan === normalizedJan);
    if (janMatch) {
      const excelName = productName.trim();
      if (excelName && shouldPreferExcelProductName(excelName, janMatch.name)) {
        return {
          jan: janMatch.jan,
          productName: excelName,
        };
      }

      return {
        jan: janMatch.jan,
        productName: janMatch.name,
      };
    }
  }

  const normalizedExcel = normalizeDermaProductAlias(productName);

  const matchedProduct = clientProducts
    .map((product) => ({
      product,
      score: getIntroductionProductMatchScore(
        normalizedExcel,
        normalizeDermaProductAlias(normalizeProductMatchText(getProductMasterDisplayName(product))),
      ),
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

export type IntroductionProductCandidate = {
  clientId: string;
  jan: string;
  name: string;
  internalSku?: string;
  formalProductName?: string | number | null;
};

export function getProductMasterDisplayName(
  product: Pick<IntroductionProductCandidate, "name" | "formalProductName">,
) {
  const formalName = String(product.formalProductName ?? "").trim();
  return formalName || product.name.trim();
}

function pickCanonicalIntroductionProduct(products: IntroductionProductCandidate[]) {
  return (
    products.find((product) => String(product.formalProductName ?? "").trim()) ??
    products
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, "ja"))[0]
  );
}

const introductionFamilyTokens = ["ダーマインショット", "エシエンス", "esience", "ダーマ"];

function belongsToIntroductionProductFamily(productName: string) {
  const normalized = normalizeProductMatchText(productName);
  return introductionFamilyTokens.some((token) => normalized.includes(normalizeProductMatchText(token)));
}

function findIntroductionCanonicalProduct(
  product: IntroductionProductCandidate,
  clientProducts: IntroductionProductCandidate[],
) {
  const internalSku = product.internalSku?.trim();
  if (internalSku) {
    const family = clientProducts.filter(
      (candidate) => candidate.internalSku?.trim() === internalSku,
    );
    if (family.length > 0) {
      return pickCanonicalIntroductionProduct(family);
    }
  }

  const displayName = getProductMasterDisplayName(product);
  if (belongsToIntroductionProductFamily(displayName)) {
    const dermaProducts = clientProducts.filter((candidate) =>
      normalizeProductMatchText(getProductMasterDisplayName(candidate)).includes(
        normalizeProductMatchText("ダーマインショット"),
      ),
    );

    if (dermaProducts.length === 1) {
      return dermaProducts[0];
    }
  }

  return product;
}

export function buildIntroductionProductKey(
  internalSku: string | undefined,
  productName: string,
  jan: string,
) {
  const sku = internalSku?.trim();
  if (sku) {
    return `sku:${sku}`;
  }

  const normalized = normalizeProductMatchText(productName);
  return normalized ? `name:${normalized}` : `jan:${jan}`;
}

function normalizeDermaProductAlias(value: string) {
  return normalizeProductMatchText(value)
    .replace(/ダマショット/g, "ダマインショット")
    .replace(/ダーマショット/g, "ダーマインショット");
}

function findIntroductionProductByFamily(
  productName: string,
  clientProducts: IntroductionProductCandidate[],
) {
  if (!belongsToIntroductionProductFamily(productName)) {
    return undefined;
  }

  const dermaProducts = clientProducts.filter((candidate) =>
    belongsToIntroductionProductFamily(getProductMasterDisplayName(candidate)),
  );

  if (dermaProducts.length === 1) {
    return dermaProducts[0];
  }

  const normalizedExcel = normalizeDermaProductAlias(productName);
  const scored = dermaProducts
    .map((product) => ({
      product,
      score: getIntroductionProductMatchScore(
        normalizedExcel,
        normalizeDermaProductAlias(getProductMasterDisplayName(product)),
      ),
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.product;
}

export function resolveIntroductionDisplayProduct(
  parsedJan: string,
  productName: string,
  clientId: string,
  products: IntroductionProductCandidate[],
) {
  const clientProducts = products.filter((product) => product.clientId === clientId);
  const resolved = resolveIntroductionProduct(parsedJan, productName, clientId, products);

  let matched =
    clientProducts.find((product) => product.jan === resolved.jan) ??
    (parsedJan && parsedJan !== "UNKNOWN"
      ? clientProducts.find((product) => product.jan === parsedJan)
      : undefined);

  if (!matched && (!parsedJan || parsedJan === "UNKNOWN")) {
    matched = findIntroductionProductByFamily(productName, clientProducts);
  }

  if (matched) {
    const canonical = findIntroductionCanonicalProduct(matched, clientProducts);
    const displayName = getProductMasterDisplayName(canonical);

    return {
      jan: matched.jan,
      productName: displayName,
      productKey: buildIntroductionProductKey(canonical.internalSku, displayName, matched.jan),
    };
  }

  const displayName = resolved.productName.trim() || resolved.jan;

  return {
    jan: resolved.jan,
    productName: displayName,
    productKey: buildIntroductionProductKey(undefined, displayName, resolved.jan),
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

  if (
    (masterName.includes("ダマインショット") && excelName.includes("ダマインショット")) ||
    (masterName.includes("ダマインショット") && excelName.includes("ダマショット")) ||
    (masterName.includes("ダマショット") && excelName.includes("ダマインショット"))
  ) {
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

function sheetMentionsAinzShipmentList(sheet: XLSX.WorkSheet) {
  const ref = sheet["!ref"];
  if (!ref) {
    return false;
  }

  const range = XLSX.utils.decode_range(ref);
  const maxRow = Math.min(range.s.r + 8, range.e.r);
  const maxColumn = Math.min(range.s.c + 8, range.e.c);

  for (let rowIndex = range.s.r; rowIndex <= maxRow; rowIndex += 1) {
    for (let columnIndex = range.s.c; columnIndex <= maxColumn; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (stringCell(sheet[address]?.v).includes("本部送り込みリスト")) {
        return true;
      }
    }
  }

  return false;
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
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/[ｰ\-ー‐－]/g, "-");
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
