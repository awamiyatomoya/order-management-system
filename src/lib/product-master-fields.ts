export type ProductMasterExtraKey =
  | "formalProductName"
  | "productNameKana"
  | "manufacturerCode"
  | "manufacturerName"
  | "referenceRetailPrice"
  | "purchaseLotQuantity"
  | "salesLotQuantity"
  | "minimumOrderUnit"
  | "caseGtin"
  | "unitWidthMm"
  | "unitHeightMm"
  | "unitDepthMm"
  | "unitVolumeL"
  | "unitWeightG"
  | "caseWidthMm"
  | "caseHeightMm"
  | "caseDepthMm"
  | "caseVolumeL"
  | "caseWeightG"
  | "receiptProductName"
  | "productFeatures"
  | "productCatchcopy"
  | "usageInstructions"
  | "ingredients"
  | "countryOfOrigin"
  | "shelfLifeDays"
  | "hazardousMaterialCategory";

export type ProductMasterColumnType = "text" | "number";

export type ProductMasterExtraField = {
  key: ProductMasterExtraKey;
  column: string;
  type: ProductMasterColumnType;
};

export const productMasterExtraFields = [
  { key: "formalProductName", column: "formal_product_name", type: "text" },
  { key: "productNameKana", column: "product_name_kana", type: "text" },
  { key: "manufacturerCode", column: "manufacturer_code", type: "text" },
  { key: "manufacturerName", column: "manufacturer_name", type: "text" },
  { key: "referenceRetailPrice", column: "reference_retail_price", type: "number" },
  { key: "purchaseLotQuantity", column: "purchase_lot_quantity", type: "number" },
  { key: "salesLotQuantity", column: "sales_lot_quantity", type: "number" },
  { key: "minimumOrderUnit", column: "minimum_order_unit", type: "text" },
  { key: "caseGtin", column: "case_gtin", type: "text" },
  { key: "unitWidthMm", column: "unit_width_mm", type: "number" },
  { key: "unitHeightMm", column: "unit_height_mm", type: "number" },
  { key: "unitDepthMm", column: "unit_depth_mm", type: "number" },
  { key: "unitVolumeL", column: "unit_volume_l", type: "number" },
  { key: "unitWeightG", column: "unit_weight_g", type: "number" },
  { key: "caseWidthMm", column: "case_width_mm", type: "number" },
  { key: "caseHeightMm", column: "case_height_mm", type: "number" },
  { key: "caseDepthMm", column: "case_depth_mm", type: "number" },
  { key: "caseVolumeL", column: "case_volume_l", type: "number" },
  { key: "caseWeightG", column: "case_weight_g", type: "number" },
  { key: "receiptProductName", column: "receipt_product_name", type: "text" },
  { key: "productFeatures", column: "product_features", type: "text" },
  { key: "productCatchcopy", column: "product_catchcopy", type: "text" },
  { key: "usageInstructions", column: "usage_instructions", type: "text" },
  { key: "ingredients", column: "ingredients", type: "text" },
  { key: "countryOfOrigin", column: "country_of_origin", type: "text" },
  { key: "shelfLifeDays", column: "shelf_life_days", type: "text" },
  { key: "hazardousMaterialCategory", column: "hazardous_material_category", type: "text" },
] as const satisfies readonly ProductMasterExtraField[];
