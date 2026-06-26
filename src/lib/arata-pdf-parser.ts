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

      const qty =
        extractArataQtyNearJan(lines, index) ??
        extractQtyFromFollowingLines(lines, index + 1);

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
  const baraIndex = lines.findIndex((line) => /有償バラ数|景品バラ数/.test(line));

  if (baraIndex !== -1) {
    for (const line of lines.slice(baraIndex + 1, baraIndex + 6)) {
      const matched = line.trim().match(/^(\d{1,5})$/);

      if (matched) {
        const qty = Number(matched[1]);

        if (Number.isInteger(qty) && qty > 0) {
          return qty;
        }
      }
    }
  }

  for (const line of lines.slice(Math.max(0, janLineIndex - 8), janLineIndex)) {
    const matched = line.trim().match(/^(\d{1,5})$/);

    if (!matched || isArataNoiseLine(line)) {
      continue;
    }

    const qty = Number(matched[1]);

    if (Number.isInteger(qty) && qty > 0) {
      return qty;
    }
  }

  return null;
}

function extractQtyFromFollowingLines(lines: string[], startIndex: number) {
  for (const line of lines.slice(startIndex, startIndex + 8)) {
    const matched = line.trim().match(/^(\d{1,5})$/);

    if (!matched) {
      continue;
    }

    const qty = Number(matched[1]);

    if (Number.isInteger(qty) && qty > 0) {
      return qty;
    }
  }

  return null;
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
