import type { Order, Product } from "./types";

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

export function buildCooolaCsv(order: Order, products: Product[]) {
  const orderTotal = order.lines.reduce((total, line) => {
    const product = products.find(
      (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
    );
    const unitPrice = line.unitPriceSnapshot ?? product?.wholesalePrice ?? 0;

    return total + (line.amount ?? unitPrice * line.qty);
  }, 0);
  const addressParts = splitAddress(order.shipToAddress);

  const rows = order.lines.map((line) => {
    const product = products.find(
      (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
    );
    const unitPrice = line.unitPriceSnapshot ?? product?.wholesalePrice ?? 0;
    const amount = line.amount ?? unitPrice * line.qty;

    return [
      order.orderNo,
      "",
      "FBP",
      order.shipToName,
      extractPostalCode(order.shipToAddress),
      addressParts[0] ?? "",
      addressParts[1] ?? "",
      addressParts[2] ?? "",
      order.shipToTel,
      "佐川急便宅配便",
      formatDateForMakerCsv(order.deliveryDueDate || order.arrivalDueDate),
      "午前中",
      formatNumber(orderTotal),
      product?.cooolaCode ?? "",
      product?.name ?? "",
      String(line.qty),
      formatNumber(unitPrice),
      formatNumber(amount),
      buildInvoiceMemo(line.memo, amount),
      "",
    ];
  });

  return [makerExportHeaders, ...rows].map(toCsvRow).join("\n");
}

export function buildCooolaExportFileName(order: Order) {
  const safeOrderNo = order.orderNo.replace(/[^\w.-]+/g, "_");

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

function splitAddress(address: string) {
  const lines = address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    const addressLines = /^\d{3}-?\d{4}$/.test(lines[0]) ? lines.slice(1) : lines;

    return [addressLines[0] ?? "", addressLines[1] ?? "", addressLines[2] ?? ""];
  }

  const withoutPostalCode = address.replace(/\d{3}-?\d{4}/, "").trim();

  if (!withoutPostalCode) {
    return ["", "", ""];
  }

  return [withoutPostalCode, "", ""];
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
