import { z } from "zod";
import type {
  ImportError,
  Order,
  OrderLine,
  Product,
  Supplier,
  SupplierMapping,
} from "./types";
import { createId } from "./uuid";

type RawRow = Record<string, unknown>;

type NormalizedRow = {
  orderNo: string;
  orderDate: string;
  arrivalDueDate: string;
  shipToName: string;
  shipToCenter: string;
  shipToAddress: string;
  shipToTel: string;
  warehouse: string;
  jan: string;
  qty: number;
  memo: string;
};

export type ImportDraft = {
  orders: Order[];
  errors: ImportError[];
  missingJans: string[];
};

const normalizedRowSchema = z.object({
  orderNo: z.string().min(1, "発注番号が空です"),
  orderDate: z.string().min(1, "発注日が空です"),
  arrivalDueDate: z.string().min(1, "着荷指定日が空です"),
  shipToName: z.string().min(1, "お届け先会社名が空です"),
  shipToCenter: z.string(),
  shipToAddress: z.string(),
  shipToTel: z.string(),
  warehouse: z.string(),
  jan: z.string().min(1, "JANが空です"),
  qty: z.coerce.number().int("数量は整数にしてください").positive("数量は1以上にしてください"),
  memo: z.string(),
});

export function buildImportDraft(params: {
  rows: RawRow[];
  clientId: string;
  supplier: Supplier;
  mapping: SupplierMapping;
  products: Product[];
  existingOrders: Order[];
  sourceFile: string;
}): ImportDraft {
  const errors: ImportError[] = [];
  const normalizedRows: NormalizedRow[] = [];

  params.rows.forEach((row, index) => {
    const rowNumber = index + params.mapping.headerRow + 1;
    const normalized = normalizeRow(row, params.mapping);
    const result = normalizedRowSchema.safeParse(normalized);

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        errors.push({
          row: rowNumber,
          field: issue.path.join("."),
          message: issue.message,
        });
      });
      return;
    }

    if (!looksLikeDate(result.data.orderDate)) {
      errors.push({
        row: rowNumber,
        field: "order_date",
        message: "発注日が日付として読めません",
      });
    }

    if (!looksLikeDate(result.data.arrivalDueDate)) {
      errors.push({
        row: rowNumber,
        field: "arrival_due_date",
        message: "着荷指定日が日付として読めません",
      });
    }

    normalizedRows.push(result.data);
  });

  const productJans = new Set(
    params.products
      .filter((product) => product.clientId === params.clientId)
      .map((product) => product.jan),
  );
  const missingJans = Array.from(
    new Set(normalizedRows.map((row) => row.jan).filter((jan) => !productJans.has(jan))),
  );

  missingJans.forEach((jan) => {
    errors.push({
      row: 0,
      field: "jan",
      message: `商品マスタに未登録のJANがあります: ${jan}`,
    });
  });

  const grouped = groupByOrderNo(normalizedRows);
  grouped.forEach((rows, orderNo) => {
    const existing = params.existingOrders.find(
      (order) =>
        order.clientId === params.clientId &&
        order.supplierId === params.supplier.id &&
        order.orderNo === orderNo,
    );

    if (existing && existing.status !== "imported") {
      errors.push({
        row: 0,
        field: "order_no",
        message: `発注番号 ${orderNo} は確定済みのため再取り込みできません`,
      });
    }
  });

  if (errors.length > 0) {
    return { orders: [], errors, missingJans };
  }

  const importedAt = new Date().toISOString();
  const orders = Array.from(grouped.entries()).map(([orderNo, rows]) =>
    buildOrder({
      rows,
      orderNo,
      clientId: params.clientId,
      supplierId: params.supplier.id,
      sourceFile: params.sourceFile,
      importedAt,
    }),
  );

  return { orders, errors: [], missingJans: [] };
}

export function confirmOrder(order: Order, products: Product[]): Order {
  return confirmOrderWithPayoutFee(order, products, 0.08);
}

export function confirmOrderWithPayoutFee(
  order: Order,
  products: Product[],
  fbpFeeRate: number,
): Order {
  return {
    ...order,
    status: "confirmed",
    lines: order.lines.map((line) => {
      const product = products.find(
        (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
      );
      const unitPrice = product?.wholesalePrice ?? 0;
      const taxRate = product?.taxRate ?? 0;
      const hasPayoutTerms = product?.retailPrice != null && product?.payoutRate != null;
      const retailPrice = hasPayoutTerms ? product?.retailPrice ?? null : null;
      const payoutRate = hasPayoutTerms ? product?.payoutRate ?? null : null;

      return {
        ...line,
        unitPriceSnapshot: unitPrice,
        taxRateSnapshot: taxRate,
        amount: unitPrice * line.qty,
        retailPriceSnapshot: retailPrice,
        payoutRateSnapshot: payoutRate,
        fbpFeeRateSnapshot: hasPayoutTerms ? fbpFeeRate : null,
        payoutAmount: calculatePayoutLineAmount({
          qty: line.qty,
          retailPrice,
          payoutRate,
          fbpFeeRate,
        }),
      };
    }),
  };
}

export function calculateLineAmount(order: Order, line: OrderLine, products: Product[]) {
  if (order.status !== "imported" && line.amount !== null) {
    return line.amount;
  }

  const product = products.find(
    (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
  );

  return (product?.wholesalePrice ?? 0) * line.qty;
}

export function calculatePayoutLineAmount(params: {
  qty: number;
  retailPrice: number | null;
  payoutRate: number | null;
  fbpFeeRate: number;
}) {
  if (params.retailPrice === null || params.payoutRate === null) {
    return null;
  }

  if (params.payoutRate <= params.fbpFeeRate) {
    return null;
  }

  return Math.floor(params.retailPrice * params.qty * (params.payoutRate - params.fbpFeeRate));
}

function normalizeRow(row: RawRow, mapping: SupplierMapping) {
  return {
    orderNo: stringCell(row[mapping.columns.order_no]),
    orderDate: stringCell(row[mapping.columns.order_date]),
    arrivalDueDate: stringCell(row[mapping.columns.arrival_due_date]),
    shipToName: stringCell(row[mapping.columns.ship_to_name]),
    shipToCenter: stringCell(row[mapping.columns.ship_to_center]),
    shipToAddress: stringCell(row[mapping.columns.ship_to_address]),
    shipToTel: stringCell(row[mapping.columns.ship_to_tel]),
    warehouse: mapValue("warehouse", stringCell(row[mapping.columns.warehouse]), mapping),
    jan: stringCell(row[mapping.columns.jan]),
    qty: row[mapping.columns.qty],
    memo: stringCell(row["備考"]),
  };
}

function stringCell(value: unknown) {
  return String(value ?? "").trim();
}

function mapValue(field: string, value: string, mapping: SupplierMapping) {
  return mapping.valueMaps[field]?.[value] ?? value;
}

function looksLikeDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function groupByOrderNo(rows: NormalizedRow[]) {
  const grouped = new Map<string, NormalizedRow[]>();

  rows.forEach((row) => {
    const current = grouped.get(row.orderNo) ?? [];
    grouped.set(row.orderNo, [...current, row]);
  });

  return grouped;
}

function buildOrder(params: {
  rows: NormalizedRow[];
  orderNo: string;
  clientId: string;
  supplierId: string;
  sourceFile: string;
  importedAt: string;
}): Order {
  const first = params.rows[0];

  return {
    id: createId(),
    clientId: params.clientId,
    supplierId: params.supplierId,
    orderNo: params.orderNo,
    orderDate: first.orderDate,
    arrivalDueDate: first.arrivalDueDate,
    deliveryDueDate: first.arrivalDueDate,
    shipToName: first.shipToName,
    shipToCenter: first.shipToCenter,
    shipToAddress: first.shipToAddress,
    shipToTel: first.shipToTel,
    warehouse: first.warehouse,
    status: "imported",
    sourceFile: params.sourceFile,
    importedAt: params.importedAt,
    lines: params.rows.map((row, index) => ({
      id: createId(),
      lineNo: index + 1,
      jan: row.jan,
      qty: row.qty,
      unitPriceSnapshot: null,
      taxRateSnapshot: null,
      amount: null,
      retailPriceSnapshot: null,
      payoutRateSnapshot: null,
      fbpFeeRateSnapshot: null,
      payoutAmount: null,
      memo: row.memo,
    })),
  };
}
