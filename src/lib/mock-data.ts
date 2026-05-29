import type { Client, Order, Product, Supplier, SupplierMapping } from "./types";

export const clients: Client[] = [
  { id: "client-cocone", name: "cocone" },
  { id: "client-hagukumi", name: "はぐくみプラス" },
];

export const suppliers: Supplier[] = [
  {
    id: "supplier-sample",
    clientId: "client-cocone",
    name: "サンプル卸",
    mappingKey: "sample-cosme-wholesale",
  },
];

export const products: Product[] = [
  {
    jan: "4900000000011",
    clientId: "client-cocone",
    internalSku: "COCONE-SHM-001",
    cooolaCode: "cocone_shampoo_001",
    name: "cocone クレイクリームシャンプー",
    wholesalePrice: 1800,
    taxRate: 0.1,
    memo: "",
  },
  {
    jan: "4900000000028",
    clientId: "client-cocone",
    internalSku: "COCONE-TRT-001",
    cooolaCode: "cocone_treatment_001",
    name: "cocone モイスチャートリートメント",
    wholesalePrice: 1200,
    taxRate: 0.1,
    memo: "",
  },
];

export const orders: Order[] = [];

export const supplierMappings: Record<string, SupplierMapping> = {
  "sample-cosme-wholesale": {
    mappingKey: "sample-cosme-wholesale",
    clientId: "client-cocone",
    fileType: "csv",
    headerRow: 1,
    columns: {
      order_no: "発注No",
      order_date: "発注日",
      arrival_due_date: "着荷指定日",
      ship_to_name: "お届け先会社名",
      ship_to_center: "センター名",
      ship_to_address: "住所",
      ship_to_tel: "電話番号",
      warehouse: "倉庫",
      jan: "JANコード",
      qty: "数量",
    },
    valueMaps: {
      warehouse: {
        "30": "埼玉センター(No.30)",
        "42": "札幌センター(No.42)",
      },
    },
  },
};
