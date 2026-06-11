import type { SupplierMapping } from "./types";

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
