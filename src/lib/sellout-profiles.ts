import type * as XLSX from "xlsx";
import * as XLSXUtils from "xlsx";
import type { SelloutLayoutType } from "./types";

export type SelloutRowListColumns = {
  date?: string;
  storeCode?: string;
  storeName?: string;
  jan?: string;
  productName?: string;
  qty?: string;
  amount?: string;
  stock?: string;
};

export type SelloutMatrixConfig = {
  sheetNamePattern?: RegExp;
  periodPattern: RegExp;
  productColumns: {
    jan: string;
    productName: string;
  };
  storeHeaderRow: number;
  metricHeaderRow: number;
  storeColumnStart: number;
  metricsPerStore: Array<"qty" | "amount" | "stock">;
  skipStores?: string[];
};

export type SelloutImportProfile = {
  profileKey: string;
  retailer: string;
  layoutType: SelloutLayoutType;
  detect: (workbook: XLSX.WorkBook) => boolean;
  rowList?: {
    sheetNamePattern?: RegExp;
    headerRow: number;
    columns: SelloutRowListColumns;
    skipStoreCodes?: string[];
  };
  matrix?: SelloutMatrixConfig;
};

export const selloutImportProfiles: SelloutImportProfile[] = [
  {
    profileKey: "loft-monthly-sellout",
    retailer: "ロフト",
    layoutType: "row-list",
    detect: (workbook) => {
      const sheet = getFirstDataSheet(workbook);
      if (!sheet) {
        return false;
      }

      const headerRow = sheetToRows(sheet)[0] ?? [];
      const normalized = headerRow.map(normalizeHeaderCell);
      return (
        normalized.includes("店舗cd") &&
        normalized.includes("店舗") &&
        normalized.includes("jan") &&
        normalized.includes("売上")
      );
    },
    rowList: {
      headerRow: 1,
      columns: {
        date: "__first_column__",
        storeCode: "店舗CD",
        storeName: "店舗",
        jan: "JAN",
        productName: "商品",
        qty: "売上",
        amount: "金額",
        stock: "在庫",
      },
      skipStoreCodes: ["9999"],
    },
  },
  {
    profileKey: "hands-period-sellout",
    retailer: "ハンズ",
    layoutType: "matrix-product-store",
    detect: (workbook) => {
      const sheetName = workbook.SheetNames.find((name) => /日別売上実績/.test(name));
      if (!sheetName) {
        return false;
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return false;
      }

      const rows = sheetToRows(sheet);
      const metricHeader = rows[9] ?? [];
      const normalized = metricHeader.map(normalizeHeaderCell);
      return normalized.includes("商品コード") && normalized.includes("売上数");
    },
    matrix: {
      sheetNamePattern: /日別売上実績/,
      periodPattern:
        /集計期間：(\d{4})年(\d{2})月(\d{2})日[～〜](\d{4})年(\d{2})月(\d{2})日/,
      productColumns: {
        jan: "商品コード",
        productName: "商品名",
      },
      storeHeaderRow: 9,
      metricHeaderRow: 10,
      storeColumnStart: 10,
      metricsPerStore: ["qty", "amount", "stock"],
      skipStores: ["全社計", "通販"],
    },
  },
];

export function getSelloutProfile(profileKey: string) {
  return selloutImportProfiles.find((profile) => profile.profileKey === profileKey);
}

function getFirstDataSheet(workbook: XLSX.WorkBook) {
  const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]);
  return sheetName ? workbook.Sheets[sheetName] : undefined;
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSXUtils.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
}

function normalizeHeaderCell(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}
