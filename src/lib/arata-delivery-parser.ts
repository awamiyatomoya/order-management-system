import * as XLSX from "xlsx";
import type { DeliveryDestination } from "@/lib/delivery-destination-master";
import type { ImportError } from "@/lib/types";

export const ARATA_WHOLESALER_NAME = "あらた";

const dataStartRowIndex = 7;

export function isArataDeliveryWorkbook(workbook: XLSX.WorkBook) {
  const sheetName = workbook.SheetNames[0] ?? "";

  if (/あらた/.test(sheetName) && /送付先|納品先/.test(sheetName)) {
    return true;
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return false;
  }

  const rows = sheetToRows(sheet);

  return rows.some((row) => {
    const joined = row.map(stringCell).join(" ");
    return /あらた/.test(joined) && /納\s*品\s*拠\s*点/.test(joined);
  });
}

export function parseArataDeliveryWorkbook(workbook: XLSX.WorkBook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return {
      destinations: [] as DeliveryDestination[],
      errors: [{ row: 0, field: "file", message: "Excelシートが見つかりません。" }],
    };
  }

  const rows = sheetToRows(sheet);
  const destinations: DeliveryDestination[] = [];
  const errors: ImportError[] = [];
  const usedCodes = new Map<string, number>();
  let currentBranch = "";

  for (let index = dataStartRowIndex; index < rows.length; index += 1) {
    const row = rows[index];
    const branch = stringCell(row[0]);

    if (branch) {
      currentBranch = branch;
    }

    const centerName = normalizeCenterName(stringCell(row[1]));
    const postalCode = normalizePostalCode(stringCell(row[2]));
    const address1 = normalizeAddress(stringCell(row[3]));
    const tel = parseArataTel(stringCell(row[4]));

    if (!centerName && !address1) {
      continue;
    }

    const rowNumber = index + 1;

    if (!centerName || !postalCode || !address1 || !tel) {
      if (centerName || address1 || postalCode || tel) {
        errors.push({
          row: rowNumber,
          field: "deliveryDestination",
          message: "納品拠点の拠点名・郵便番号・住所・TELが不足しています。",
        });
      }
      continue;
    }

    const displayName = currentBranch ? `${currentBranch} ${centerName}` : centerName;
    const code = buildArataDestinationCode(postalCode, centerName, usedCodes);
    const aliases = buildArataAliases({
      branchName: currentBranch,
      centerName,
      displayName,
      address1,
      postalCode,
    });

    destinations.push({
      code,
      wholesalerName: ARATA_WHOLESALER_NAME,
      name: displayName,
      postalCode,
      address1,
      address2: "",
      address3: "",
      tel,
      aliases,
    });
  }

  return {
    destinations: dedupeDestinations(destinations),
    errors,
  };
}

function buildArataDestinationCode(
  postalCode: string,
  centerName: string,
  usedCodes: Map<string, number>,
) {
  const baseCode = postalCode;
  const count = usedCodes.get(baseCode) ?? 0;
  usedCodes.set(baseCode, count + 1);

  if (count === 0) {
    return baseCode;
  }

  const slug = centerName
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]/gu, "")
    .slice(0, 8);

  return `${baseCode}-${slug || count + 1}`;
}

function buildArataAliases(params: {
  branchName: string;
  centerName: string;
  displayName: string;
  address1: string;
  postalCode: string;
}) {
  const aliases = new Set<string>([
    params.displayName,
    params.centerName,
    `あらた ${params.centerName}`,
    `アラタ ${params.centerName}`,
    `㈱あらた ${params.centerName}`,
  ]);

  if (params.branchName) {
    aliases.add(`${params.branchName}${params.centerName}`);
    aliases.add(`あらた ${params.branchName} ${params.centerName}`);
    aliases.add(`アラタ ${params.branchName} ${params.centerName}`);
  }

  const parentheticalNames = params.centerName.match(/（[^）]+）/g) ?? [];

  parentheticalNames.forEach((value) => {
    aliases.add(value.replace(/[（）]/g, ""));
    aliases.add(value);
  });

  const addressKeyword = params.address1
    .replace(/^[^\d]*\d+[^\d]*/, "")
    .split(/[、,\s　]+/)
    .map((part) => part.trim())
    .find((part) => part.length >= 4);

  if (addressKeyword) {
    aliases.add(addressKeyword);
  }

  aliases.add(params.postalCode);
  aliases.add(params.postalCode.replace("-", ""));

  return Array.from(aliases).filter(Boolean);
}

function dedupeDestinations(destinations: DeliveryDestination[]) {
  const map = new Map<string, DeliveryDestination>();

  destinations.forEach((destination) => {
    map.set(destination.code, destination);
  });

  return Array.from(map.values());
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

function stringCell(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCenterName(value: string) {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeAddress(value: string) {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePostalCode(value: string) {
  const matched = value.match(/\d{3}-?\d{4}/)?.[0];

  if (!matched) {
    return "";
  }

  const digits = matched.replace(/\D/g, "");

  if (digits.length !== 7) {
    return "";
  }

  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function parseArataTel(value: string) {
  const matched = value.match(/0\d{1,4}[-\u2010]?\d{1,4}[-\u2010]?\d{3,4}/)?.[0];

  if (!matched) {
    return "";
  }

  const digits = matched.replace(/\D/g, "");

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return matched;
}
