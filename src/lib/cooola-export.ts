import type { DeliveryDestination } from "./delivery-destination-master";
import {
  deliveryDestinations,
  findDeliveryDestinationByCode,
} from "./delivery-destination-master";
import type { Order, Product } from "./types";

export function resolveProductNameForCsvExport(product: Product | undefined) {
  const rawCsvExportName = product?.csvExportProductName;
  const csvExportName =
    typeof rawCsvExportName === "string" ? rawCsvExportName.trim() : "";

  if (csvExportName) {
    return csvExportName;
  }

  return product?.name ?? "";
}

const makerExportHeaders = [
  "受注番号",
  "配送先コード",
  "ご依頼主名",
  "配送先名",
  "配送先郵便番号",
  "配送先住所1",
  "配送先住所2",
  "配送先住所3",
  "配送先TEL",
  "配送方法",
  "配達指定日",
  "時間指定",
  "請求金額（税込）",
  "商品コード",
  "商品名",
  "出荷数",
  "単価（税込）",
  "小計（税込）",
  "備考",
  "送り状備考",
];

export function buildCooolaCsv(
  order: Order,
  products: Product[],
  destinations: DeliveryDestination[] = deliveryDestinations,
) {
  const destination = order.shipToCenter
    ? findDeliveryDestinationByCode(order.shipToCenter, destinations)
    : null;
  const shipToName = destination?.name ?? order.shipToName;
  const shipToCode = destination?.code ?? order.shipToCenter;
  const shipToTel = destination?.tel ?? order.shipToTel;
  const addressParts = resolveMakerCsvAddressParts(destination, order.shipToAddress);
  const postalCode = destination?.postalCode ?? extractPostalCode(order.shipToAddress);

  const orderTotal = order.lines.reduce((total, line) => {
    const product = products.find(
      (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
    );
    const unitPrice = line.unitPriceSnapshot ?? product?.wholesalePrice ?? 0;

    return total + (line.amount ?? unitPrice * line.qty);
  }, 0);

  const rows = order.lines.map((line) => {
    const product = products.find(
      (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
    );
    const unitPrice = line.unitPriceSnapshot ?? product?.wholesalePrice ?? 0;
    const amount = line.amount ?? unitPrice * line.qty;

    return [
      formatOrderNoForMakerCsv(order.orderNo),
      shipToCode,
      "FBP",
      shipToName,
      postalCode,
      addressParts[0] ?? "",
      addressParts[1] ?? "",
      addressParts[2] ?? "",
      shipToTel,
      "佐川急便宅配便",
      formatDateForMakerCsv(order.deliveryDueDate || order.arrivalDueDate),
      "",
      formatNumber(orderTotal),
      product?.cooolaCode ?? "",
      resolveProductNameForCsvExport(product),
      String(line.qty),
      formatNumber(unitPrice),
      formatNumber(amount),
      buildInvoiceMemo(line.memo, amount),
      "",
    ];
  });

  return [makerExportHeaders, ...rows].map(toCsvRow).join("\n");
}

export function formatOrderNoForMakerCsv(orderNo: string) {
  return normalizeOrderNo(orderNo);
}

export function normalizeOrderNo(orderNo: string) {
  const trimmed = orderNo.trim();

  if (!trimmed) {
    return "";
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(8, "0");
  }

  return trimmed;
}

export function buildCooolaExportFileName(order: Order) {
  const safeOrderNo = normalizeOrderNo(order.orderNo).replace(/[^\w.-]+/g, "_");

  return `maker-order-${safeOrderNo}.csv`;
}

function formatDateForMakerCsv(value: string) {
  return value.replaceAll("/", "-");
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("ja-JP");
}

function extractPostalCode(address: string) {
  return address.match(/\d{3}-?\d{4}/)?.[0] ?? "";
}

function resolveMakerCsvAddressParts(
  destination: DeliveryDestination | null,
  shipToAddress: string,
): [string, string, string] {
  if (destination) {
    if (destination.address2.trim() || destination.address3.trim()) {
      return [destination.address1, destination.address2, destination.address3];
    }

    const combined = [destination.address1, destination.address2, destination.address3]
      .filter(Boolean)
      .join("");

    if (combined) {
      return splitAddressForMakerCsv(combined);
    }
  }

  return splitAddressForMakerCsv(shipToAddress);
}

export function splitAddressForMakerCsv(address: string): [string, string, string] {
  const lines = address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    const addressLines = /^\d{3}-?\d{4}$/.test(lines[0]) ? lines.slice(1) : lines;

    if (addressLines.length >= 2) {
      return [
        addressLines[0] ?? "",
        addressLines[1] ?? "",
        addressLines.slice(2).join(" ") ?? "",
      ];
    }
  }

  const body =
    lines.length > 1
      ? (/^\d{3}-?\d{4}$/.test(lines[0]) ? lines.slice(1) : lines).join("")
      : address.replace(/\d{3}-?\d{4}/, "").trim();

  if (!body) {
    return ["", "", ""];
  }

  const splitIndex = findJapaneseMunicipalitySplitIndex(body);

  if (splitIndex <= 0) {
    return [body, "", ""];
  }

  return [body.slice(0, splitIndex).trim(), body.slice(splitIndex).trim(), ""];
}

function findJapaneseMunicipalitySplitIndex(address: string) {
  const municipalityPatterns = [
    /^(.+?[都道府県].+?郡.+?[町村])/,
    /^(.+?[都道府県].+?市.+?区)/,
    /^(.+?[都道府県].+?市)/,
    /^(.+?[都道府県].+?区)/,
    /^(.+?[都道府県].+?[町村])/,
  ];

  for (const pattern of municipalityPatterns) {
    const match = address.match(pattern);

    if (match?.[1]) {
      return match[1].length;
    }
  }

  return -1;
}

function buildInvoiceMemo(memo: string, amount: number) {
  if (memo) {
    return memo;
  }

  return `\\${formatNumber(amount)}`;
}

function toCsvRow(values: string[]) {
  return values.map(escapeCsvCell).join(",");
}

function escapeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""');

  return `"${escaped}"`;
}
