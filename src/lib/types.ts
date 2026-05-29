export type OrderStatus =
  | "imported"
  | "confirmed"
  | "shipping_instructed"
  | "shipped";

export type Client = {
  id: string;
  name: string;
};

export type Supplier = {
  id: string;
  clientId: string;
  name: string;
  mappingKey: string;
};

export type Product = {
  jan: string;
  clientId: string;
  internalSku: string;
  cooolaCode: string;
  name: string;
  wholesalePrice: number;
  taxRate: number;
  memo: string;
};

export type OrderLine = {
  id: string;
  lineNo: number;
  jan: string;
  qty: number;
  unitPriceSnapshot: number | null;
  taxRateSnapshot: number | null;
  amount: number | null;
  memo: string;
};

export type Order = {
  id: string;
  clientId: string;
  supplierId: string;
  orderNo: string;
  orderDate: string;
  arrivalDueDate: string;
  deliveryDueDate: string;
  shipToName: string;
  shipToCenter: string;
  shipToAddress: string;
  shipToTel: string;
  warehouse: string;
  status: OrderStatus;
  sourceFile: string;
  importedAt: string;
  lines: OrderLine[];
};

export type ImportError = {
  row: number;
  field: string;
  message: string;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  clientId: string;
  supplierId: string;
  importedAt: string;
  status: "saved" | "blocked";
  errors: ImportError[];
};

export type SupplierMapping = {
  mappingKey: string;
  clientId: string;
  fileType: "csv" | "xlsx";
  headerRow: number;
  columns: Record<string, string>;
  valueMaps: Record<string, Record<string, string>>;
};
