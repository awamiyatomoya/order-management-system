import type { ProductMasterExtraKey } from "./product-master-fields";

export type OrderStatus =
  | "imported"
  | "confirmed"
  | "shipping_instructed"
  | "shipped";

export type Client = {
  id: string;
  name: string;
  fbpFeeRate: number;
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
  retailPrice: number | null;
  payoutRate: number | null;
  memo: string;
  productImagePath?: string;
  productImageUrl?: string;
} & Partial<Record<ProductMasterExtraKey, string | number | null>>;

export type Store = {
  id: string;
  name: string;
  aliases: string[];
};

export type StoreIntroductionFormatKey = "row-list" | "flag-list" | "hands-allocation-list";

export type StoreIntroductionImport = {
  id: string;
  clientId: string;
  fileName: string;
  formatKey: StoreIntroductionFormatKey;
  importedAt: string;
  totalStoreCount: number;
  introducedStoreCount: number;
  chainName: string;
};

export type StoreIntroductionEntry = {
  id: string;
  importId: string;
  clientId: string;
  jan: string;
  productName: string;
  storeName: string;
  storeCode: string;
  address: string;
  postalCode: string;
  isIntroduced: boolean;
  matchedStoreName: string;
};

export type OrderLine = {
  id: string;
  lineNo: number;
  jan: string;
  qty: number;
  unitPriceSnapshot: number | null;
  taxRateSnapshot: number | null;
  amount: number | null;
  retailPriceSnapshot: number | null;
  payoutRateSnapshot: number | null;
  fbpFeeRateSnapshot: number | null;
  payoutAmount: number | null;
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
  sourceFilePath?: string;
  sourceFileUrl?: string;
  importedAt: string;
  storeName: string;
  needsReview: boolean;
  reviewReasons: string[];
  checkedByName?: string;
  shippedByName?: string;
  lines: OrderLine[];
};

export type ImportError = {
  row: number;
  field: string;
  message: string;
};

export type DeletionTargetType = "order" | "import_batch";

export type DeletionLog = {
  id: string;
  clientId: string;
  targetType: DeletionTargetType;
  targetId: string | null;
  orderNo: string;
  fileName: string;
  orderStatus: string;
  lineCount: number | null;
  operatorName: string;
  deletedAt: string;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  clientId: string;
  supplierId: string;
  fileStoragePath?: string;
  fileUrl?: string;
  importedAt: string;
  status: "saved" | "blocked";
  operatorName?: string;
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
