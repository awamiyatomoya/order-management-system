import type { OrderWorkbenchDataScope, OrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";
import type { StoreLocationRecord } from "@/lib/store-location-groups";

const DEMO_CLIENT_A = "demo-client-a";
const DEMO_CLIENT_B = "demo-client-b";
const DEMO_SUPPLIER_A = "demo-supplier-a";
const DEMO_SUPPLIER_B = "demo-supplier-b";

const demoClients = [
  { id: DEMO_CLIENT_A, name: "サンプル化粧品株式会社", fbpFeeRate: 0.08 },
  { id: DEMO_CLIENT_B, name: "デモブランド合同会社", fbpFeeRate: 0.1 },
];

const demoSuppliers = [
  { id: DEMO_SUPPLIER_A, clientId: DEMO_CLIENT_A, name: "サンプル卸A", mappingKey: "sample-cosme-wholesale" },
  { id: DEMO_SUPPLIER_B, clientId: DEMO_CLIENT_B, name: "サンプル卸B", mappingKey: "sample-cosme-wholesale" },
];

const demoProducts = [
  {
    jan: "4900000000001",
    clientId: DEMO_CLIENT_A,
    internalSku: "SKU-001",
    cooolaCode: "C001",
    name: "デモ フェイスクリーム 50g",
    wholesalePrice: 1200,
    taxRate: 0.1,
    retailPrice: 2400,
    payoutRate: 0.5,
    memo: "",
  },
  {
    jan: "4900000000002",
    clientId: DEMO_CLIENT_A,
    internalSku: "SKU-002",
    cooolaCode: "C002",
    name: "デモ 化粧水 200ml",
    wholesalePrice: 980,
    taxRate: 0.1,
    retailPrice: 1980,
    payoutRate: 0.495,
    memo: "",
  },
  {
    jan: "4900000000003",
    clientId: DEMO_CLIENT_A,
    internalSku: "SKU-003",
    cooolaCode: "C003",
    name: "デモ リップグロス",
    wholesalePrice: 650,
    taxRate: 0.1,
    retailPrice: 1320,
    payoutRate: 0.492,
    memo: "新商品",
  },
  {
    jan: "4900000000004",
    clientId: DEMO_CLIENT_B,
    internalSku: "SKU-101",
    cooolaCode: "C101",
    name: "デモ ボディミルク",
    wholesalePrice: 850,
    taxRate: 0.1,
    retailPrice: 1700,
    payoutRate: 0.5,
    memo: "",
  },
];

const demoOrders = [
  {
    id: "demo-order-1",
    clientId: DEMO_CLIENT_A,
    supplierId: DEMO_SUPPLIER_A,
    orderNo: "PO-2026-0001",
    orderDate: "2026-06-01",
    arrivalDueDate: "2026-06-15",
    deliveryDueDate: "2026-06-20",
    shipToName: "サンプル物流センター",
    shipToCenter: "関東DC",
    shipToAddress: "千葉県〇〇市サンプル1-2-3",
    shipToTel: "043-000-0000",
    warehouse: "埼玉センター(No.30)",
    status: "imported" as const,
    sourceFile: "sample-order-001.pdf",
    storeName: "デモ店舗 渋谷",
    needsReview: true,
    reviewReasons: ["店舗名未確認"],
    importedAt: "2026-06-01T10:00:00+09:00",
    lines: [
      {
        id: "demo-line-1",
        lineNo: 1,
        jan: "4900000000001",
        qty: 24,
        unitPriceSnapshot: 1200,
        taxRateSnapshot: 0.1,
        amount: 28800,
        retailPriceSnapshot: 2400,
        payoutRateSnapshot: 0.5,
        fbpFeeRateSnapshot: 0.08,
        payoutAmount: 12000,
        memo: "",
      },
      {
        id: "demo-line-2",
        lineNo: 2,
        jan: "4900000000002",
        qty: 36,
        unitPriceSnapshot: 980,
        taxRateSnapshot: 0.1,
        amount: 35280,
        retailPriceSnapshot: 1980,
        payoutRateSnapshot: 0.495,
        fbpFeeRateSnapshot: 0.08,
        payoutAmount: 17442,
        memo: "",
      },
    ],
  },
  {
    id: "demo-order-2",
    clientId: DEMO_CLIENT_A,
    supplierId: DEMO_SUPPLIER_A,
    orderNo: "PO-2026-0002",
    orderDate: "2026-06-05",
    arrivalDueDate: "2026-06-18",
    deliveryDueDate: "2026-06-25",
    shipToName: "サンプル物流センター",
    shipToCenter: "関西DC",
    shipToAddress: "大阪府〇〇市サンプル4-5-6",
    shipToTel: "06-0000-0000",
    warehouse: "札幌センター(No.42)",
    status: "confirmed" as const,
    sourceFile: "sample-order-002.pdf",
    storeName: "デモ店舗 新宿",
    needsReview: false,
    reviewReasons: [],
    importedAt: "2026-06-05T14:30:00+09:00",
    lines: [
      {
        id: "demo-line-3",
        lineNo: 1,
        jan: "4900000000003",
        qty: 48,
        unitPriceSnapshot: 650,
        taxRateSnapshot: 0.1,
        amount: 31200,
        retailPriceSnapshot: 1320,
        payoutRateSnapshot: 0.492,
        fbpFeeRateSnapshot: 0.08,
        payoutAmount: 15350,
        memo: "",
      },
    ],
  },
  {
    id: "demo-order-3",
    clientId: DEMO_CLIENT_B,
    supplierId: DEMO_SUPPLIER_B,
    orderNo: "PO-2026-0101",
    orderDate: "2026-06-10",
    arrivalDueDate: "2026-06-22",
    deliveryDueDate: "2026-06-28",
    shipToName: "デモ配送センター",
    shipToCenter: "中部DC",
    shipToAddress: "愛知県〇〇市サンプル7-8-9",
    shipToTel: "052-000-0000",
    warehouse: "埼玉センター(No.30)",
    status: "shipped" as const,
    sourceFile: "sample-order-003.pdf",
    storeName: "デモ店舗 名古屋",
    needsReview: false,
    reviewReasons: [],
    importedAt: "2026-06-10T09:15:00+09:00",
    lines: [
      {
        id: "demo-line-4",
        lineNo: 1,
        jan: "4900000000004",
        qty: 60,
        unitPriceSnapshot: 850,
        taxRateSnapshot: 0.1,
        amount: 51000,
        retailPriceSnapshot: 1700,
        payoutRateSnapshot: 0.5,
        fbpFeeRateSnapshot: 0.1,
        payoutAmount: 25500,
        memo: "",
      },
    ],
  },
];

const demoImportBatches = [
  {
    id: "demo-batch-1",
    clientId: DEMO_CLIENT_A,
    supplierId: DEMO_SUPPLIER_A,
    fileName: "sample-order-001.pdf",
    importedAt: "2026-06-01T10:00:00+09:00",
    status: "saved" as const,
    errors: [],
  },
  {
    id: "demo-batch-2",
    clientId: DEMO_CLIENT_A,
    supplierId: DEMO_SUPPLIER_A,
    fileName: "sample-order-broken.csv",
    importedAt: "2026-06-03T11:20:00+09:00",
    status: "blocked" as const,
    errors: [{ row: 5, field: "JANコード", message: "商品マスタに存在しません" }],
  },
];

const demoDeliveryDestinations = [
  {
    code: "D001",
    wholesalerName: "サンプル卸",
    name: "サンプル物流センター",
    postalCode: "270-0001",
    address1: "千葉県〇〇市サンプル1-2-3",
    address2: "",
    address3: "",
    tel: "043-000-0000",
    aliases: ["サンプル物流"],
  },
  {
    code: "D002",
    wholesalerName: "サンプル卸",
    name: "デモ配送センター",
    postalCode: "460-0001",
    address1: "愛知県〇〇市サンプル7-8-9",
    address2: "",
    address3: "",
    tel: "052-000-0000",
    aliases: [],
  },
];

const demoStores = [
  { id: "demo-store-1", name: "デモ店舗 渋谷", aliases: ["渋谷", "シブヤ"] },
  { id: "demo-store-2", name: "デモ店舗 新宿", aliases: ["新宿", "シンジュク"] },
  { id: "demo-store-3", name: "デモ店舗 名古屋", aliases: ["名古屋"] },
];

const demoStoreLocations: StoreLocationRecord[] = [
  {
    storeCode: "loft-demo-001",
    storeName: "デモロフト 渋谷",
    postalCode: "150-0001",
    address: "東京都渋谷区サンプル1-1-1",
    tel: "03-0000-0001",
    chainName: "ロフト",
  },
  {
    storeCode: "loft-demo-002",
    storeName: "デモロフト 新宿",
    postalCode: "160-0022",
    address: "東京都新宿区サンプル2-2-2",
    tel: "03-0000-0002",
    chainName: "ロフト",
  },
  {
    storeCode: "loft-demo-003",
    storeName: "デモロフト 名古屋",
    postalCode: "460-0008",
    address: "愛知県名古屋市サンプル3-3-3",
    tel: "052-000-0003",
    chainName: "ロフト",
  },
];

const demoStoreIntroductionImports = [
  {
    id: "demo-si-import-1",
    clientId: DEMO_CLIENT_A,
    fileName: "sample-store-intro.xlsx",
    formatKey: "row-list" as const,
    importedAt: "2026-05-20T16:00:00+09:00",
    totalStoreCount: 3,
    introducedStoreCount: 2,
    chainName: "ロフト",
  },
];

const demoStoreIntroductionEntries = [
  {
    id: "demo-si-entry-1",
    importId: "demo-si-import-1",
    clientId: DEMO_CLIENT_A,
    jan: "4900000000001",
    productName: "デモ フェイスクリーム 50g",
    storeName: "デモロフト 渋谷",
    storeCode: "loft-demo-001",
    address: "東京都渋谷区サンプル1-1-1",
    postalCode: "150-0001",
    isIntroduced: true,
    matchedStoreName: "デモ店舗 渋谷",
  },
  {
    id: "demo-si-entry-2",
    importId: "demo-si-import-1",
    clientId: DEMO_CLIENT_A,
    jan: "4900000000001",
    productName: "デモ フェイスクリーム 50g",
    storeName: "デモロフト 新宿",
    storeCode: "loft-demo-002",
    address: "東京都新宿区サンプル2-2-2",
    postalCode: "160-0022",
    isIntroduced: true,
    matchedStoreName: "デモ店舗 新宿",
  },
  {
    id: "demo-si-entry-3",
    importId: "demo-si-import-1",
    clientId: DEMO_CLIENT_A,
    jan: "4900000000002",
    productName: "デモ 化粧水 200ml",
    storeName: "デモロフト 名古屋",
    storeCode: "loft-demo-003",
    address: "愛知県名古屋市サンプル3-3-3",
    postalCode: "460-0008",
    isIntroduced: false,
    matchedStoreName: "",
  },
];

function getDataRequirements(scope: OrderWorkbenchDataScope) {
  return {
    clients: scope !== "stores",
    suppliers: scope === "orders",
    products: scope === "orders" || scope === "products" || scope === "payouts" || scope === "sellIn" || scope === "sellOut" || scope === "sellOutFiles" || scope === "storeIntroductions",
    orders: scope === "orders" || scope === "payouts" || scope === "history" || scope === "sellIn",
    importBatches: scope === "orderFiles" || scope === "history",
    deliveryDestinations: scope === "deliveryDestinations" || scope === "orders",
    stores: scope === "stores" || scope === "orders" || scope === "sellIn",
    storeLocations: scope === "stores" || scope === "storeIntroductions",
    storeIntroductions: scope === "storeIntroductions",
  };
}

export function getDemoOrderWorkbenchInitialData(
  scope: OrderWorkbenchDataScope = "orders",
): OrderWorkbenchInitialData {
  const req = getDataRequirements(scope);

  return {
    clients: req.clients ? demoClients : [],
    suppliers: req.suppliers ? demoSuppliers : [],
    products: req.products ? demoProducts : [],
    productTotalCount: req.products ? demoProducts.length : 0,
    orders: req.orders ? demoOrders : [],
    importBatches: req.importBatches ? demoImportBatches : [],
    deliveryDestinations: req.deliveryDestinations ? demoDeliveryDestinations : [],
    stores: req.stores ? demoStores : [],
    storeLocations: req.storeLocations ? demoStoreLocations : [],
    storeIntroductionImports: req.storeIntroductions ? demoStoreIntroductionImports : [],
    storeIntroductionEntries: req.storeIntroductions ? demoStoreIntroductionEntries : [],
    selloutImports: [],
    selloutEntries: [],
    deletionLogs: [],
    source: "supabase",
    message: "デモモード: すべてのデータは架空のサンプルです。保存・取り込みは無効です。",
  };
}

export const DEMO_BASE_PATH = "/demo";
