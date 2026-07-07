import { parseArataTel } from "@/lib/arata-delivery-parser";

export type ArataPdfDelivery = {
  shipToName: string;
  shipToPostalCode: string;
  shipToAddress: string;
  shipToTel: string;
};

export function isArataPdfOrder(text: string, lines: string[]) {
  const joined = lines.join("\n");

  if (/FAX発注票/.test(joined) && /(?:アラタ|あらた|㈱あらた)/.test(joined)) {
    return true;
  }

  if (/ご発注先\s+\d+/.test(joined) && /お届け?先TEL/.test(joined) && /(?:アラタ|あらた)/.test(joined)) {
    return true;
  }

  return /あらた送付先一覧/.test(text);
}

const arataPdfDateLinePattern =
  /(?:\d{2}\.\d{2}\.\d{2}|\d{2,4}\s*[\/\-.年月]\s*\d{1,2}\s*[\/\-.月]?\s*\d{1,2}(?!\d)\s*日?)/;

export function extractArataPdfOrderDate(lines: string[], orderNo = ""): string {
  const resolvedOrderNo = orderNo || findArataPdfOrderNo(lines);

  if (resolvedOrderNo) {
    const orderIndex = lines.findIndex((line) => lineIncludesOrderNo(line, resolvedOrderNo));

    if (orderIndex >= 0) {
      for (const line of lines.slice(orderIndex + 1, orderIndex + 4)) {
        const trimmed = line.trim();

        if (/^(?:着荷指定|着荷指定日|FAX-NO)/.test(trimmed)) {
          break;
        }

        const date = parseArataPdfDateLine(line);

        if (date) {
          return date;
        }
      }
    }
  }

  const receivedAtDate = extractArataPdfReceivedAtDate(lines);

  if (receivedAtDate) {
    return receivedAtDate;
  }

  return extractArataPdfFaxHeaderDate(lines);
}

export function extractArataPdfArrivalDueDate(lines: string[], orderDate = ""): string {
  for (const label of ["着荷指定日", "着荷指定", "若荷指定", "若狗指定"]) {
    const index = lines.findIndex((line) => line.trim() === label || line.startsWith(`${label} `));

    if (index === -1) {
      continue;
    }

    const inlineDate = parseArataPdfDateLine(lines[index].replace(label, ""));

    if (inlineDate && inlineDate !== orderDate) {
      return inlineDate;
    }

    for (const line of lines.slice(index + 1, index + 4)) {
      const date = parseArataPdfDateLine(line);

      if (date) {
        return date;
      }
    }
  }

  return "";
}

export function extractArataPdfDelivery(lines: string[]): ArataPdfDelivery {
  const shipToTel = extractArataPdfTel(lines);
  const postalIndex = lines.findIndex((line) => /^\d{3}-?\d{4}$/.test(cleanupArataValue(line)));
  const shipToPostalCode =
    postalIndex >= 0
      ? normalizePostalCode(lines[postalIndex])
      : extractArataPdfPostalCode(lines);

  let shipToAddress = "";
  let shipToName = "";

  if (postalIndex > 0) {
    const addressCandidate = cleanupArataValue(lines[postalIndex - 1]);

    if (!isArataNoiseLine(addressCandidate)) {
      shipToAddress = addressCandidate;
    }
  }

  if (postalIndex > 1) {
    const nameCandidate = cleanupArataValue(lines[postalIndex - 2]);

    if (!isArataNoiseLine(nameCandidate)) {
      shipToName = nameCandidate;
    }
  }

  if (!shipToAddress) {
    const addressIndex = findArataAddressLineIndex(lines);
    shipToAddress = addressIndex >= 0 ? cleanupArataValue(lines[addressIndex]) : "";
  }

  if (!shipToName) {
    shipToName = extractArataPdfName(lines, lines.findIndex((line) => cleanupArataValue(line) === shipToAddress));
  }

  return {
    shipToName,
    shipToPostalCode,
    shipToAddress,
    shipToTel,
  };
}

export function extractArataPdfLineItems(lines: string[]) {
  const items: { jan: string; qty: number }[] = [];
  const janPattern = /(?:\d[\s-]*){13}/g;

  lines.forEach((line, index) => {
    const matches = [...line.matchAll(janPattern)];

    matches.forEach((match) => {
      const jan = match[0].replace(/\D/g, "");

      if (jan.length !== 13) {
        return;
      }

      const qty = extractArataQtyNearJan(lines, index);

      if (qty !== null) {
        items.push({ jan, qty });
      }
    });
  });

  return dedupeLineItems(items);
}

function extractArataPdfTel(lines: string[]) {
  const telLine = lines.find((line) => /お届け?先TEL/i.test(line));

  if (telLine) {
    const inlineTel = telLine.match(/0\d{9,10}/)?.[0];

    if (inlineTel) {
      return parseArataTel(inlineTel);
    }
  }

  for (const line of lines) {
    const digits = line.replace(/\D/g, "");

    if (/^0\d{9,10}$/.test(digits)) {
      return parseArataTel(digits);
    }
  }

  return "";
}

function extractArataPdfPostalCode(lines: string[]) {
  for (const line of lines) {
    const normalized = normalizePostalCode(line);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizePostalCode(value: string) {
  const matched = cleanupArataValue(value).match(/\b\d{3}-?\d{4}\b/)?.[0];

  if (!matched) {
    return "";
  }

  const digits = matched.replace(/\D/g, "");

  if (digits.length !== 7) {
    return "";
  }

  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function findArataAddressLineIndex(lines: string[]) {
  return lines.findIndex((line) => {
    const trimmed = cleanupArataValue(line);

    if (!trimmed || isArataStoreCodeLine(trimmed)) {
      return false;
    }

    return (
      /[都道府県]/.test(trimmed) ||
      /[市区町村郡]/.test(trimmed) ||
      /ケン.{2,}/.test(trimmed) ||
      /\d+[-－]\d+/.test(trimmed)
    );
  });
}

function extractArataPdfName(lines: string[], addressIndex: number) {
  if (addressIndex <= 0) {
    return "";
  }

  for (let index = addressIndex - 1; index >= Math.max(0, addressIndex - 4); index -= 1) {
    const candidate = cleanupArataValue(lines[index]);

    if (!candidate || isArataNoiseLine(candidate)) {
      continue;
    }

    if (/(?:アラタ|あらた|センター|倉庫|物流)/.test(candidate)) {
      return candidate;
    }
  }

  return "";
}

function extractArataQtyNearJan(lines: string[], janLineIndex: number) {
  const detailLines = lines.slice(janLineIndex + 1, janLineIndex + 14);
  const qtyFromAmount = extractArataQtyFromAmount(detailLines);

  if (qtyFromAmount !== null) {
    return qtyFromAmount;
  }

  const numericLines = collectArataNumericLinesAfterJan(detailLines);

  if (numericLines.length === 0) {
    return null;
  }

  return numericLines[numericLines.length - 1];
}

function extractArataQtyFromAmount(lines: string[]) {
  const unitPrice = extractArataUnitPrice(lines);
  const amount = extractArataLineAmount(lines);

  if (unitPrice === null || amount === null || unitPrice <= 0) {
    return null;
  }

  const qty = Math.round(amount / unitPrice);

  if (!Number.isInteger(qty) || qty <= 0) {
    return null;
  }

  const recomputedAmount = unitPrice * qty;

  if (Math.abs(recomputedAmount - amount) > 0.01) {
    return null;
  }

  return qty;
}

function extractArataUnitPrice(lines: string[]) {
  for (const line of lines) {
    const matched = line
      .replace(/,/g, "")
      .trim()
      .match(/(\d{1,6}\.\d{1,2})/);

    if (!matched) {
      continue;
    }

    const unitPrice = Number(matched[1]);

    if (Number.isFinite(unitPrice) && unitPrice > 0) {
      return unitPrice;
    }
  }

  return null;
}

function extractArataLineAmount(lines: string[]) {
  for (const line of lines) {
    const normalized = line.replace(/,/g, "").trim();

    if (!/^\d[\d.]*\|?$/.test(normalized)) {
      continue;
    }

    const matched = normalized.match(/^(\d{1,8}(?:\.\d{1,2})?)/);

    if (!matched) {
      continue;
    }

    const amount = Number(matched[1]);

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    if (amount < 1000) {
      continue;
    }

    return amount;
  }

  return null;
}

function collectArataNumericLinesAfterJan(lines: string[]) {
  const numbers: number[] = [];

  for (const line of lines) {
    const trimmed = cleanupArataValue(line);

    if (!trimmed || trimmed === "J" || /^[A-Za-z]$/.test(trimmed)) {
      continue;
    }

    if (isArataProductNameLine(trimmed) || isArataPriceLine(trimmed)) {
      break;
    }

    const matched = trimmed.match(/^(\d{1,5})$/);

    if (!matched) {
      continue;
    }

    const qty = Number(matched[1]);

    if (Number.isInteger(qty) && qty > 0) {
      numbers.push(qty);
    }
  }

  return numbers;
}

function isArataProductNameLine(line: string) {
  return /[^\d\s.,|￥¥\\\-/]/.test(line) && !/^\d{2}\.\d{2}\.\d{2}$/.test(line);
}

function isArataPriceLine(line: string) {
  return /\d+\.\d{2}\|?$/.test(line.replace(/,/g, ""));
}

function isArataStoreCodeLine(line: string) {
  return /^(?:お届先|お届け先|発注元)\s+[A-Z0-9]+$/i.test(line);
}

function isArataNoiseLine(line: string) {
  if (isArataStoreCodeLine(line)) {
    return true;
  }

  return (
    /^(?:発注番号|受付日時|着荷指定日?|発注日|単価|トータル頁|住所〒|摘要|FAX発注票|消費税率)/.test(line) ||
    /^\d{2}\.\d{2}\.\d{2}$/.test(line) ||
    /^\d{1,2}:\d{2}:\d{2}$/.test(line) ||
    /^[A-Z0-9]{3,}$/i.test(line.replace(/[-_\s]/g, ""))
  );
}

function cleanupArataValue(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function dedupeLineItems(items: { jan: string; qty: number }[]) {
  const result = new Map<string, { jan: string; qty: number }>();

  items.forEach((item) => {
    result.set(`${item.jan}:${item.qty}`, item);
  });

  return Array.from(result.values());
}

export function isArataStoreDestinationCode(line: string) {
  const trimmed = line.trim();

  if (!/^(?:お届先|お届け先|発注元)\s+/.test(trimmed)) {
    return false;
  }

  const code = trimmed.replace(/^(?:お届先|お届け先|発注元)\s+/, "").trim();

  return /^[A-Z0-9]{5,8}$/i.test(code);
}

export function buildArataPdfShipToAddress(delivery: ArataPdfDelivery) {
  return [delivery.shipToPostalCode, delivery.shipToAddress].filter(Boolean).join("\n");
}

function findArataPdfOrderNo(lines: string[]) {
  const headerIndex = lines.findIndex((line) => /発注番号/.test(line));

  if (headerIndex === -1) {
    return "";
  }

  for (const line of lines.slice(headerIndex, headerIndex + 12)) {
    const orderNo = extractArataPdfOrderNoCandidate(line);

    if (orderNo) {
      return orderNo;
    }
  }

  return "";
}

function lineIncludesOrderNo(line: string, orderNo: string) {
  const normalizedLine = line.replace(/\D/g, "");

  return line.includes(orderNo) || normalizedLine === orderNo;
}

function extractArataPdfOrderNoCandidate(line: string) {
  const withoutDates = line.replace(arataPdfDateLinePattern, " ").trim();
  const match = withoutDates.match(/\b\d{5,10}\b/);

  return match?.[0] ?? "";
}

function extractArataPdfReceivedAtDate(lines: string[]) {
  const match = lines.join("\n").match(/受付日時\s*(\d{2}\.\d{2}\.\d{2})/);

  return match ? normalizeArataPdfDate(match[1]) : "";
}

function extractArataPdfFaxHeaderDate(lines: string[]) {
  const headerLines = lines.slice(0, 8);
  let year = "";

  for (const line of headerLines) {
    const yearMatch = line.trim().match(/^(\d{4})年$/);

    if (yearMatch) {
      year = yearMatch[1];
    }

    const monthDayMatch = line.match(/(\d{1,2})月(\d{1,2})日/);

    if (year && monthDayMatch) {
      return `${year}-${monthDayMatch[1].padStart(2, "0")}-${monthDayMatch[2].padStart(2, "0")}`;
    }
  }

  return "";
}

function parseArataPdfDateLine(line: string) {
  const trimmed = cleanupArataValue(line);
  const dotted = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);

  if (dotted) {
    return normalizeArataPdfDate(`${dotted[1]}.${dotted[2]}.${dotted[3]}`);
  }

  const match = trimmed.match(arataPdfDateLinePattern);

  return match ? normalizeArataPdfDate(match[0]) : "";
}

function normalizeArataPdfDate(value: string) {
  const dotted = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);

  if (dotted) {
    return `20${dotted[1]}-${dotted[2]}-${dotted[3]}`;
  }

  const parts = value.match(/\d{1,4}/g);

  if (!parts || parts.length < 3) {
    return "";
  }

  const [year, month, day] = parts;
  const normalizedYear = year.length === 2 ? `20${year}` : year;

  return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}


