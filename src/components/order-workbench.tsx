"use client";

import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Copy, ListFilter, LoaderCircle, Search, Trash2 } from "lucide-react";
import Papa from "papaparse";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildCooolaCsv,
  buildCooolaExportFileName,
} from "@/lib/cooola-export";
import type { DeliveryDestination } from "@/lib/delivery-destination-master";
import {
  calculateLineAmount,
  buildImportDraft,
  confirmOrderWithPayoutFee,
} from "@/lib/import-orders";
import { parsePdfOrderText } from "@/lib/pdf-order-parser";
import { supplierMappings } from "@/lib/supplier-mappings";
import {
  productMasterExtraFields,
  type ProductMasterExtraKey,
} from "@/lib/product-master-fields";
import {
  createOrderFileDownloadUrl,
  saveBlockedImport,
  saveImportedOrders,
  uploadOrderFile,
} from "@/lib/supabase/import-actions";
import { saveClient, updateClient } from "@/lib/supabase/client-actions";
import {
  confirmOrderInSupabase,
  deleteOrderInSupabase,
  markOrderCheckedInSupabase,
  markOrderShippedInSupabase,
  undoOrderConfirmationInSupabase,
  updateOrderArrivalDueDateInSupabase,
} from "@/lib/supabase/order-actions";
import { saveDeliveryDestination } from "@/lib/supabase/delivery-destination-actions";
import type { OrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";
import {
  deleteProduct,
  fetchProductMasterProducts,
  fetchProductsForProductMasterImport,
  saveProduct,
  uploadProductImage,
} from "@/lib/supabase/product-actions";
import { saveStore } from "@/lib/supabase/store-actions";
import type { Client, ImportBatch, ImportError, Order, Product, Store, Supplier } from "@/lib/types";
import { createId } from "@/lib/uuid";

type ProductForm = {
  jan: string;
  internalSku: string;
  cooolaCode: string;
  name: string;
  wholesalePrice: string;
  taxRate: string;
  retailPrice: string;
  payoutRate: string;
  memo: string;
  productImagePath: string;
  productImageUrl: string;
} & Record<ProductMasterExtraKey, string>;

type ProductMasterDraft = ProductForm & {
  originalJan: string;
  originalClientId: string;
};

type ClientMasterDraft = {
  id: string;
  name: string;
  fbpFeeRate: string;
};

type DeliveryDestinationForm = {
  code: string;
  wholesalerName: string;
  name: string;
  postalCode: string;
  address1: string;
  address2: string;
  address3: string;
  tel: string;
  aliases: string;
};

type DeliveryDestinationMasterDraft = DeliveryDestinationForm & {
  originalCode: string;
  originalClientId?: string;
};

type StoreForm = {
  name: string;
  aliases: string;
};

type StoreMasterDraft = StoreForm & {
  id: string;
};

type PendingImport = {
  rows: Record<string, unknown>[];
  fileName: string;
  fileStoragePath?: string;
  fileStorageUrl?: string;
  missingJans: string[];
};

type UploadedOrderFile = {
  path?: string;
  url?: string;
};

type ParsedProductMasterExcel = {
  products: Product[];
  errors: string[];
};

type WorkbenchView =
  | "orders"
  | "clients"
  | "products"
  | "deliveryDestinations"
  | "stores"
  | "orderFiles"
  | "payouts"
  | "sellIn"
  | "history";
type OrderPeriodFilter = "all" | "thisMonth" | "lastMonth" | "custom";

type PayoutLineRow = {
  order: Order;
  line: Order["lines"][number];
  product?: Product;
  retailPrice: number | null;
  payoutRate: number | null;
  fbpFeeRate: number;
  payoutAmount: number | null;
};

type SellInRow = {
  date: string;
  storeName: string;
  jan: string;
  productName: string;
  qty: number;
  wholesaleAmount: number | null;
  retailAmount: number | null;
  hasIssue: boolean;
};

type SellInChartRow = {
  label: string;
  qty: number;
  wholesaleAmount: number | null;
  retailAmount: number | null;
};

type FileReadResult =
  | {
      type: "rows";
      rows: Record<string, unknown>[];
    }
  | {
      type: "pdf";
      extractionMethod: "pdf-text" | "ocr" | "mac-vision";
      confidence?: number;
      pages: number;
      text: string;
    };

function getInitialSelection(initialData: OrderWorkbenchInitialData, preferredClientId?: string) {
  const preferredClient = initialData.clients.find((client) => client.id === preferredClientId);
  const firstSupplier = preferredClient
    ? initialData.suppliers.find((supplier) => supplier.clientId === preferredClient.id)
    : initialData.suppliers[0];
  const clientId = preferredClient?.id ?? firstSupplier?.clientId ?? initialData.clients[0]?.id ?? "";
  const supplierId =
    firstSupplier?.id ??
    initialData.suppliers.find((supplier) => supplier.clientId === clientId)?.id ??
    "";

  return { clientId, supplierId };
}

const emptyProductForm: ProductForm = {
  jan: "",
  internalSku: "",
  cooolaCode: "",
  name: "",
  wholesalePrice: "",
  taxRate: "0.1",
  retailPrice: "",
  payoutRate: "",
  memo: "",
  productImagePath: "",
  productImageUrl: "",
  ...createEmptyProductMasterExtraForm(),
};

const emptyDeliveryDestinationForm: DeliveryDestinationForm = {
  code: "",
  wholesalerName: "",
  name: "",
  postalCode: "",
  address1: "",
  address2: "",
  address3: "",
  tel: "",
  aliases: "",
};
const emptyStoreForm: StoreForm = {
  name: "",
  aliases: "",
};
const defaultSupplierMappingKey = "sample-cosme-wholesale";
const masterPageSize = 50;
const taxRateOptions = [
  { label: "10%", value: "0.1" },
  { label: "8%", value: "0.08" },
  { label: "0%", value: "0" },
];

type ProductFormFieldKey = keyof ProductForm;

type ProductFormField = {
  key: ProductFormFieldKey;
  label: string;
  description?: string;
  required?: boolean;
  input?: "text" | "textarea" | "taxRate" | "image";
};

type ProductFormSection = {
  title: string;
  fields: ProductFormField[];
};

const productFormSections: ProductFormSection[] = [
  {
    title: "基本情報",
    fields: [
      { key: "formalProductName", label: "正式商品名", description: "正式な商品名です。" },
      { key: "name", label: "商品名：漢字", required: true, description: "漢字表記の商品名" },
      { key: "productNameKana", label: "商品名：カタカナ", description: "カタカナ表記の商品名" },
      { key: "manufacturerCode", label: "製造メーカーコード", description: "GS1事業者コード" },
      { key: "manufacturerName", label: "製造メーカー名" },
      { key: "jan", label: "JANコード", required: true },
    ],
  },
  {
    title: "価格情報",
    fields: [
      { key: "taxRate", label: "消費税率区分", description: "リストから選択（0% / 8% / 10%）", input: "taxRate" },
      { key: "wholesalePrice", label: "仕切価格", required: true, description: "販売先（問屋）への商品の仕入れ代金" },
      { key: "referenceRetailPrice", label: "参考売価", description: "定価と同じ" },
      { key: "retailPrice", label: "定価", required: true, description: "メーカーがあらかじめ販売価格として指定した価格" },
      { key: "payoutRate", label: "掛け率", required: true, description: "50%の場合は 50 と入力してください。振込金額計算に使います。" },
    ],
  },
  {
    title: "入数・サイズ",
    fields: [
      { key: "purchaseLotQuantity", label: "仕入れ入数", description: "バンドル留めをして納品する際の入数" },
      { key: "salesLotQuantity", label: "販売入数", description: "1ケース内の入数" },
      { key: "minimumOrderUnit", label: "最低発注単位", description: "メーカーや卸が設定する最小の受注数量" },
      { key: "caseGtin", label: "ケースGTIN", description: "国際的な商品識別コード（GTIN）。未設定の場合は「なし」と入力" },
      { key: "unitWidthMm", label: "バラ幅（mm）", description: "商品1つあたりの幅" },
      { key: "unitHeightMm", label: "バラ高さ（mm）", description: "商品1つあたりの高さ" },
      { key: "unitDepthMm", label: "バラ奥行（mm）", description: "商品1つあたりの奥行き" },
      { key: "unitVolumeL", label: "バラ容量（L）", description: "商品1つあたりの容量" },
      { key: "unitWeightG", label: "バラ重量（g）", description: "1商品あたりの容器を含めた重さ" },
      { key: "caseWidthMm", label: "ケース幅（mm）", description: "1ダンボールあたりの幅" },
      { key: "caseHeightMm", label: "ケース高さ（mm）", description: "1ダンボールあたりの高さ" },
      { key: "caseDepthMm", label: "ケース奥行（mm）", description: "1ダンボールあたりの奥行き" },
      { key: "caseVolumeL", label: "ケース容量（L）", description: "1ダンボールあたりの容量" },
      { key: "caseWeightG", label: "ケース重量（g）", description: "1ダンボールあたりの重さ" },
    ],
  },
  {
    title: "その他",
    fields: [
      {
        key: "receiptProductName",
        label: "レシート表示商品名",
        description: "レシートに印字する略名です。色番は含めてください。半角カナおよび英数文字14文字です。",
      },
      {
        key: "productFeatures",
        label: "商品特徴",
        description:
          "セット商品の場合、【セット内容】は必ず記載。商品説明文の入力も必須です。",
        input: "textarea",
      },
      { key: "productCatchcopy", label: "商品キャッチ", description: "30文字以内" },
      { key: "usageInstructions", label: "使い方", description: "4000文字以内", input: "textarea" },
      { key: "ingredients", label: "全成分", description: "4000文字以内", input: "textarea" },
      { key: "countryOfOrigin", label: "原産国", description: "国名を日本語で入力" },
      {
        key: "shelfLifeDays",
        label: "使用期限日数(消費期限日数)",
        description: "製品が製造されてから、安全に使用できる期限までの合計日数",
      },
      { key: "hazardousMaterialCategory", label: "危険物区分" },
      { key: "cooolaCode", label: "COOOLa商品コード" },
      { key: "internalSku", label: "内部SKU" },
      { key: "memo", label: "メモ" },
    ],
  },
];

const productMasterListFields = productFormSections.flatMap((section) => section.fields);
const productMasterImageField: ProductFormField = {
  key: "productImagePath",
  label: "商品画像",
  description: "JPEG、PNG、WebP、GIF形式の画像を登録できます。",
  input: "image",
};
const productMasterDisplayFields = [
  productMasterImageField,
  productMasterListFields.find((field) => field.key === "name"),
  productMasterListFields.find((field) => field.key === "jan"),
  ...productMasterListFields.filter(
    (field) => field.key !== "name" && field.key !== "jan" && field.key !== "productImagePath",
  ),
].filter((field): field is ProductFormField => Boolean(field));

function createEmptyProductMasterExtraForm() {
  return Object.fromEntries(productMasterExtraFields.map((field) => [field.key, ""])) as Record<
    ProductMasterExtraKey,
    string
  >;
}

function normalizeProductMasterExtraForm(form: ProductForm) {
  return Object.fromEntries(
    productMasterExtraFields.map((field) => {
      const value = form[field.key].trim();

      if (!value) {
        return [field.key, null];
      }

      if (field.type === "number") {
        const numericValue = Number(value);
        return [field.key, Number.isFinite(numericValue) ? numericValue : null];
      }

      return [field.key, value];
    }),
  ) as Partial<Record<ProductMasterExtraKey, string | number | null>>;
}

function productMasterExtraToForm(product: Product) {
  return Object.fromEntries(
    productMasterExtraFields.map((field) => {
      const value = product[field.key];
      return [field.key, value === null || value === undefined ? "" : String(value)];
    }),
  ) as Record<ProductMasterExtraKey, string>;
}

const productMasterExcelKeyByHeader: Record<string, keyof ProductForm> = {
  正式商品名: "formalProductName",
  "商品名：漢字": "name",
  "商品名:漢字": "name",
  "商品名：カタカナ": "productNameKana",
  "商品名:カタカナ": "productNameKana",
  製造メーカーコード: "manufacturerCode",
  製造メーカー名: "manufacturerName",
  JANコード: "jan",
  消費税率区分: "taxRate",
  仕切価格: "wholesalePrice",
  参考売価: "referenceRetailPrice",
  定価: "retailPrice",
  仕入れ入数: "purchaseLotQuantity",
  販売入数: "salesLotQuantity",
  最低発注単位: "minimumOrderUnit",
  ケースGTIN: "caseGtin",
  "バラ幅（mm）": "unitWidthMm",
  "バラ高さ（mm）": "unitHeightMm",
  "バラ奥行（mm）": "unitDepthMm",
  "バラ容量（L）": "unitVolumeL",
  "バラ重量（g）": "unitWeightG",
  "ケース幅（mm）": "caseWidthMm",
  "ケース高さ（mm）": "caseHeightMm",
  "ケース奥行（mm）": "caseDepthMm",
  "ケース容量（L）": "caseVolumeL",
  "ケース重量（g）": "caseWeightG",
  レシート表示商品名: "receiptProductName",
  商品特徴: "productFeatures",
  商品キャッチ: "productCatchcopy",
  使い方: "usageInstructions",
  全成分: "ingredients",
  原産国: "countryOfOrigin",
  "使用期限日数(消費期限日数)": "shelfLifeDays",
  危険物区分: "hazardousMaterialCategory",
};

const productMasterNumericKeys = new Set<keyof ProductForm>([
  "wholesalePrice",
  "retailPrice",
  "referenceRetailPrice",
  "purchaseLotQuantity",
  "salesLotQuantity",
  "unitWidthMm",
  "unitHeightMm",
  "unitDepthMm",
  "unitVolumeL",
  "unitWeightG",
  "caseWidthMm",
  "caseHeightMm",
  "caseDepthMm",
  "caseVolumeL",
  "caseWeightG",
]);
const productMasterDescriptionRowsAfterHeader = 1;

async function parseProductMasterExcel(
  file: File,
  clientId: string,
  currentProducts: Product[],
): Promise<ParsedProductMasterExcel> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error("シートが見つかりません。");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeProductMasterHeader(cell) === "JANコード"),
  );

  if (headerRowIndex === -1) {
    throw new Error("JANコードの列が見つかりません。商品マスタテンプレートを確認してください。");
  }

  const headerEntries = rows[headerRowIndex]
    .map((cell, index) => ({
      index,
      key: productMasterExcelKeyByHeader[normalizeProductMasterHeader(cell)],
    }))
    .filter((entry): entry is { index: number; key: keyof ProductForm } => Boolean(entry.key));
  const products: Product[] = [];
  const errors: string[] = [];
  const dataStartIndex = getProductMasterDataStartIndex(rows, headerRowIndex);

  rows.slice(dataStartIndex).forEach((row, rowOffset) => {
    if (isEmptyProductMasterExcelRow(row)) {
      return;
    }

    const rowNumber = dataStartIndex + rowOffset + 1;
    const values = Object.fromEntries(
      headerEntries
        .map(({ index, key }) => [key, normalizeProductMasterExcelCell(row[index], key)])
        .filter(([, value]) => value !== ""),
    ) as Partial<Record<keyof ProductForm, string>>;
    const productNameFromExcel = values.name || values.formalProductName || values.productNameKana || "";
    const existingProduct = findExistingProductForProductMasterExcelRow({
      clientId,
      currentProducts,
      jan: values.jan,
      productName: productNameFromExcel,
      formalProductName: values.formalProductName,
      productNameKana: values.productNameKana,
    });
    const jan = normalizeJanCell(values.jan) || existingProduct?.jan || "";

    if (!jan) {
      errors.push(`${rowNumber}行目: JANコードが空です。既存商品を更新する場合も、商品名で1件に特定できる必要があります。`);
      return;
    }

    const productName = values.name || values.formalProductName || existingProduct?.name || "";

    if (!productName) {
      errors.push(`${rowNumber}行目: 商品名が空です`);
      return;
    }

    const wholesalePrice = parseProductMasterNumber(values.wholesalePrice);

    if (wholesalePrice === null && existingProduct?.wholesalePrice === undefined) {
      errors.push(`${rowNumber}行目: 仕切価格が空、または数字ではありません`);
      return;
    }

    const nextProduct: Product = {
      jan,
      clientId,
      internalSku: existingProduct?.internalSku ?? "",
      cooolaCode: existingProduct?.cooolaCode ?? "",
      name: productName,
      wholesalePrice: wholesalePrice ?? existingProduct?.wholesalePrice ?? 0,
      taxRate: parseProductMasterTaxRate(values.taxRate) ?? existingProduct?.taxRate ?? 0.1,
      retailPrice: parseProductMasterNumber(values.retailPrice) ?? existingProduct?.retailPrice ?? null,
      payoutRate: existingProduct?.payoutRate ?? null,
      memo: existingProduct?.memo ?? "",
      ...productMasterExtraToForm(existingProduct ?? createEmptyProduct(jan, clientId, productName)),
    };

    for (const field of productMasterExtraFields) {
      const value = values[field.key];

      if (value === undefined) {
        continue;
      }

      nextProduct[field.key] =
        field.type === "number" ? parseProductMasterNumber(value) : value;
    }

    products.push(nextProduct);
  });

  return { products, errors };
}

function createEmptyProduct(jan: string, clientId: string, name: string): Product {
  return {
    jan,
    clientId,
    internalSku: "",
    cooolaCode: "",
    name,
    wholesalePrice: 0,
    taxRate: 0.1,
    retailPrice: null,
    payoutRate: null,
    memo: "",
  };
}

function getProductMasterDataStartIndex(rows: unknown[][], headerRowIndex: number) {
  const firstPossibleDataIndex = headerRowIndex + productMasterDescriptionRowsAfterHeader + 1;
  const firstPossibleDataRow = rows[firstPossibleDataIndex] ?? [];
  const rowText = firstPossibleDataRow.map((cell) => String(cell ?? "")).join(" ");

  if (/（例）|\(例\)|例）|サンプル/i.test(rowText)) {
    return firstPossibleDataIndex + 1;
  }

  return firstPossibleDataIndex;
}

function findExistingProductForProductMasterExcelRow({
  clientId,
  currentProducts,
  jan,
  productName,
  formalProductName,
  productNameKana,
}: {
  clientId: string;
  currentProducts: Product[];
  jan?: string;
  productName?: string;
  formalProductName?: string;
  productNameKana?: string;
}) {
  const normalizedJan = normalizeJanCell(jan);
  const clientProducts = currentProducts.filter((product) => product.clientId === clientId);

  if (normalizedJan) {
    return clientProducts.find((product) => product.jan === normalizedJan);
  }

  const candidateNames = [productName, formalProductName, productNameKana]
    .map(normalizeProductMasterNameForMatching)
    .filter(Boolean);

  if (candidateNames.length === 0) {
    return undefined;
  }

  const matches = clientProducts.filter((product) => {
    const productNames = [
      product.name,
      product.formalProductName,
      product.productNameKana,
    ]
      .map(normalizeProductMasterNameForMatching)
      .filter(Boolean);

    return candidateNames.some((candidateName) => productNames.includes(candidateName));
  });

  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeProductMasterNameForMatching(value: unknown) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .trim()
    .toLowerCase();
}

function normalizeProductMasterHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .trim();
}

function normalizeProductMasterExcelCell(value: unknown, key: keyof ProductForm) {
  if (value === null || value === undefined) {
    return "";
  }

  if (key === "jan") {
    return normalizeJanCell(value);
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    return "";
  }

  if (productMasterNumericKeys.has(key)) {
    const numericValue = parseProductMasterNumber(normalizedValue);
    return numericValue === null ? "" : String(numericValue);
  }

  return normalizedValue;
}

function normalizeJanCell(value: unknown) {
  const normalizedValue = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\.0$/, "");

  if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(normalizedValue)) {
    const numericValue = Number(normalizedValue);

    if (Number.isFinite(numericValue)) {
      return numericValue.toFixed(0);
    }
  }

  return normalizedValue;
}

function isEmptyProductMasterExcelRow(row: unknown[]) {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function parseProductMasterNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const numericText = value.replace(/[,\s円]/g, "");
  const numericValue = Number(numericText);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseProductMasterTaxRate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const numericText = value.replace("%", "").trim();
  const numericValue = Number(numericText);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue > 1 ? numericValue / 100 : numericValue;
}
const defaultStoreChains: Store[] = [
  {
    id: "default-store-ainz",
    name: "アインズ",
    aliases: ["アインズ", "アインズ&トルペ", "アインズアンドトルペ", "AINZ", "AINZ&TULPE"],
  },
  {
    id: "default-store-hands",
    name: "ハンズ",
    aliases: ["ハンズ", "東急ハンズ", "HANDS", "TOKYU HANDS"],
  },
  {
    id: "default-store-loft",
    name: "ロフト",
    aliases: ["ロフト", "LOFT", "ロフトホング", "*ロフトホング"],
  },
  {
    id: "default-store-mimosa",
    name: "ミモザ",
    aliases: ["ミモザ", "イナイミモザ", "*イナイミモザ", "*イナイミモザ 78"],
  },
  {
    id: "default-store-other",
    name: "その他",
    aliases: ["その他", "在庫分", "ザイコブン", "ザ イコブン", "*ザ イコブン"],
  },
];

export function OrderWorkbench({
  initialData,
  view = "orders",
  initialClientId,
}: {
  initialData: OrderWorkbenchInitialData;
  view?: WorkbenchView;
  initialClientId?: string;
}) {
  const initialSelection = getInitialSelection(initialData, initialClientId);
  const [clients, setClients] = useState<Client[]>(initialData.clients);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialData.suppliers);
  const [selectedClientId, setSelectedClientId] = useState(initialSelection.clientId);
  const [selectedSupplierId, setSelectedSupplierId] = useState(initialSelection.supplierId);
  const [products, setProducts] = useState<Product[]>(initialData.products);
  const [productTotalCount, setProductTotalCount] = useState(initialData.productTotalCount);
  const [orders, setOrders] = useState<Order[]>(initialData.orders);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>(initialData.importBatches);
  const [deliveryDestinations, setDeliveryDestinations] = useState<DeliveryDestination[]>(
    initialData.deliveryDestinations,
  );
  const [stores, setStores] = useState<Store[]>(initialData.stores);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [deliveryDestinationForm, setDeliveryDestinationForm] =
    useState<DeliveryDestinationForm>(emptyDeliveryDestinationForm);
  const [storeForm, setStoreForm] = useState<StoreForm>(emptyStoreForm);
  const [productNotice, setProductNotice] = useState("");
  const [deliveryDestinationNotice, setDeliveryDestinationNotice] = useState("");
  const [storeNotice, setStoreNotice] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientNotice, setClientNotice] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFileSearch, setOrderFileSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderPeriodFilter, setOrderPeriodFilter] = useState<OrderPeriodFilter>("all");
  const [orderPeriodStart, setOrderPeriodStart] = useState("");
  const [orderPeriodEnd, setOrderPeriodEnd] = useState("");
  const [payoutMonth, setPayoutMonth] = useState(getCurrentMonthValue());
  const [sellInPeriodStart, setSellInPeriodStart] = useState(getCurrentMonthStartValue());
  const [sellInPeriodEnd, setSellInPeriodEnd] = useState(getCurrentMonthEndValue());
  const [sellInStoreFilter, setSellInStoreFilter] = useState("all");
  const [sellInSearch, setSellInSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productClientFilter, setProductClientFilter] = useState("all");
  const [isProductExportPanelOpen, setIsProductExportPanelOpen] = useState(false);
  const [productExportClientFilter, setProductExportClientFilter] = useState("all");
  const [productExportSearch, setProductExportSearch] = useState("");
  const [selectedProductExportKeys, setSelectedProductExportKeys] = useState<string[]>([]);
  const [productRegistrationClientId, setProductRegistrationClientId] =
    useState(initialSelection.clientId);
  const [deliveryWholesalerFilter, setDeliveryWholesalerFilter] = useState("all");
  const [customWholesalerOptions, setCustomWholesalerOptions] = useState<string[]>([]);
  const [productPage, setProductPage] = useState(0);
  const [deliveryDestinationPage, setDeliveryDestinationPage] = useState(0);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [productMasterFileInputKey, setProductMasterFileInputKey] = useState(0);
  const [deliveryDestinationFileInputKey, setDeliveryDestinationFileInputKey] = useState(0);
  const [csvExportedOrderIds, setCsvExportedOrderIds] = useState<string[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isLoadingProductPage, setIsLoadingProductPage] = useState(false);
  const [isImportingProductMaster, setIsImportingProductMaster] = useState(false);
  const [isSavingDeliveryDestination, setIsSavingDeliveryDestination] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isEditingClientMaster, setIsEditingClientMaster] = useState(false);
  const [clientMasterDrafts, setClientMasterDrafts] = useState<ClientMasterDraft[]>([]);
  const [isEditingProductMaster, setIsEditingProductMaster] = useState(false);
  const [productMasterDrafts, setProductMasterDrafts] = useState<ProductMasterDraft[]>([]);
  const [isEditingDeliveryDestinationMaster, setIsEditingDeliveryDestinationMaster] =
    useState(false);
  const [deliveryDestinationMasterDrafts, setDeliveryDestinationMasterDrafts] = useState<
    DeliveryDestinationMasterDraft[]
  >([]);
  const [isEditingStoreMaster, setIsEditingStoreMaster] = useState(false);
  const [storeMasterDrafts, setStoreMasterDrafts] = useState<StoreMasterDraft[]>([]);
  const skippedInitialProductPageLoadRef = useRef(false);
  const setNotice = (..._messages: string[]) => {
    void _messages;
  };

  const selectableSuppliers = suppliers.filter(
    (supplier) => supplier.clientId === selectedClientId,
  );
  const selectedSupplier =
    selectableSuppliers.find((supplier) => supplier.id === selectedSupplierId) ??
    selectableSuppliers[0];
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const selectedOrders = useMemo(
    () => orders.filter((order) => order.clientId === selectedClientId),
    [orders, selectedClientId],
  );
  const selectedProducts = useMemo(
    () => products.filter((product) => product.clientId === selectedClientId),
    [products, selectedClientId],
  );
  const usedProductKeys = useMemo(
    () =>
      new Set(
        orders.flatMap((order) =>
          order.lines.map((line) => buildProductKey(order.clientId, line.jan)),
        ),
      ),
    [orders],
  );
  const selectedDeliveryDestinations = useMemo(
    () => dedupeDeliveryDestinations(deliveryDestinations),
    [deliveryDestinations],
  );
  const selectedImportBatches = useMemo(
    () => importBatches.filter((batch) => batch.clientId === selectedClientId),
    [importBatches, selectedClientId],
  );
  const pageTitle = getWorkbenchPageTitle(view);
  const pageDescription = getWorkbenchPageDescription(view);
  const missingJans = pendingImport?.missingJans ?? [];
  const filteredOrders = useMemo(
    () =>
      selectedOrders
        .filter((order) => {
        const normalizedSearch = orderSearch.trim().toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          [order.orderNo, order.sourceFile, order.shipToName, order.warehouse]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        const matchesStatus =
          orderStatusFilter === "all" || order.status === orderStatusFilter;
        const matchesPeriod = isOrderInPeriod(
          order,
          orderPeriodFilter,
          orderPeriodStart,
          orderPeriodEnd,
        );

        return matchesSearch && matchesStatus && matchesPeriod;
      })
        .sort(compareOrdersForWorkbench),
    [orderPeriodEnd, orderPeriodFilter, orderPeriodStart, orderSearch, orderStatusFilter, selectedOrders],
  );
  const filteredOrderFiles = useMemo(() => {
    const normalizedSearch = orderFileSearch.trim().toLowerCase();

    return selectedImportBatches.filter((batch) => {
      if (!normalizedSearch) {
        return true;
      }

      const relatedOrders = getOrdersForImportBatch(batch, selectedOrders);
      return [batch.fileName, batch.status, ...relatedOrders.map((order) => order.orderNo)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [orderFileSearch, selectedImportBatches, selectedOrders]);

  const totalAmount = useMemo(
    () =>
      selectedOrders.reduce(
        (sum, order) =>
          sum +
          order.lines.reduce(
            (lineSum, line) => lineSum + calculateLineAmount(order, line, products),
            0,
          ),
        0,
      ),
    [products, selectedOrders],
  );
  const payoutLines = useMemo(
    () => buildPayoutLineRows(selectedOrders, products, payoutMonth),
    [payoutMonth, products, selectedOrders],
  );
  const payoutWholesaleTotal = useMemo(
    () =>
      payoutLines.reduce((total, row) => {
        const wholesalePrice = row.line.unitPriceSnapshot ?? row.product?.wholesalePrice ?? null;

        if (wholesalePrice === null) {
          return total;
        }

        return total + Math.floor(wholesalePrice * row.line.qty);
      }, 0),
    [payoutLines],
  );
  const payoutFbpFeeTotal = useMemo(
    () => {
      const total = payoutLines.reduce((sum, row) => {
        if (row.retailPrice === null) {
          return sum;
        }

        return sum + row.retailPrice * row.line.qty * row.fbpFeeRate;
      }, 0);

      return Math.round(total);
    },
    [payoutLines],
  );
  const payoutTotal = payoutWholesaleTotal - payoutFbpFeeTotal;
  const payoutIssueCount = useMemo(
    () => payoutLines.filter((row) => row.payoutAmount === null).length,
    [payoutLines],
  );
  const sellInRows = useMemo(
    () =>
      buildSellInRows({
        orders: selectedOrders,
        products: selectedProducts,
        stores,
        startDate: sellInPeriodStart,
        endDate: sellInPeriodEnd,
        storeFilter: sellInStoreFilter,
        search: sellInSearch,
      }),
    [selectedOrders, selectedProducts, sellInPeriodEnd, sellInPeriodStart, sellInSearch, sellInStoreFilter, stores],
  );
  const sellInStores = useMemo(
    () =>
      buildSellInStoreOptions({
        orders: selectedOrders,
        products: selectedProducts,
        stores,
        startDate: sellInPeriodStart,
        endDate: sellInPeriodEnd,
        search: sellInSearch,
      }),
    [selectedOrders, selectedProducts, sellInPeriodEnd, sellInPeriodStart, sellInSearch, stores],
  );
  const sellInOrderCount = useMemo(
    () =>
      countSellInOrders({
        orders: selectedOrders,
        products: selectedProducts,
        stores,
        startDate: sellInPeriodStart,
        endDate: sellInPeriodEnd,
        storeFilter: sellInStoreFilter,
        search: sellInSearch,
      }),
    [selectedOrders, selectedProducts, sellInPeriodEnd, sellInPeriodStart, sellInSearch, sellInStoreFilter, stores],
  );
  const sellInTotals = useMemo(
    () => ({
      qty: sellInRows.reduce((total, row) => total + row.qty, 0),
      wholesaleAmount: sumNullableAmounts(sellInRows.map((row) => row.wholesaleAmount)),
      retailAmount: sumNullableAmounts(sellInRows.map((row) => row.retailAmount)),
      issueCount: sellInRows.filter((row) => row.hasIssue).length,
    }),
    [sellInRows],
  );
  const sellInDailyChartRows = useMemo(
    () => buildSellInDailyChartRows(sellInRows),
    [sellInRows],
  );
  const sellInProductChartRows = useMemo(
    () => buildSellInProductChartRows(sellInRows),
    [sellInRows],
  );
  const shippedOrderCount = useMemo(
    () => selectedOrders.filter((order) => order.status === "shipped").length,
    [selectedOrders],
  );
  const checkedHistoryOrders = useMemo(
    () =>
      selectedOrders.filter(
        (order) => order.status === "confirmed" || order.status === "shipped",
      ),
    [selectedOrders],
  );
  const sentHistoryOrders = useMemo(
    () => selectedOrders.filter((order) => order.status === "shipped"),
    [selectedOrders],
  );
  const filteredProducts = useMemo(() => {
    if (view === "products") {
      return products;
    }

    const keyword = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      const matchesClient =
        productClientFilter === "all" || product.clientId === productClientFilter;
      const matchesKeyword =
        !keyword ||
        [
          product.jan,
          product.name,
          product.cooolaCode,
          getClientName(product.clientId, clients),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return matchesClient && matchesKeyword;
    });
  }, [clients, productClientFilter, productSearch, products, view]);
  const exportCandidateProducts = useMemo(() => {
    const keyword = productExportSearch.trim().toLowerCase();

    return products.filter((product) => {
      const matchesClient =
        productExportClientFilter === "all" || product.clientId === productExportClientFilter;
      const matchesKeyword =
        !keyword ||
        [
          product.jan,
          product.name,
          product.formalProductName,
          product.productNameKana,
          getClientName(product.clientId, clients),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return matchesClient && matchesKeyword;
    });
  }, [clients, productExportClientFilter, productExportSearch, products]);
  const selectedProductExportKeySet = useMemo(
    () => new Set(selectedProductExportKeys),
    [selectedProductExportKeys],
  );
  const selectedProductExportProducts = useMemo(
    () =>
      products.filter((product) =>
        selectedProductExportKeySet.has(buildProductKey(product.clientId, product.jan)),
      ),
    [products, selectedProductExportKeySet],
  );
  const pagedProducts = useMemo(
    () =>
      view === "products" ? filteredProducts : paginateItems(filteredProducts, productPage).items,
    [filteredProducts, productPage, view],
  );
  const normalizedProductPage =
    view === "products" ? productPage : paginateItems(filteredProducts, productPage).page;
  const productPaginationTotalItems =
    view === "products" ? productTotalCount : filteredProducts.length;
  const selectedWholesalerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...customWholesalerOptions,
            ...selectedDeliveryDestinations.map(getDeliveryWholesalerName),
          ]
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ),
    [customWholesalerOptions, selectedDeliveryDestinations],
  );
  const filteredDeliveryDestinations = useMemo(() => {
    if (deliveryWholesalerFilter === "all") {
      return selectedDeliveryDestinations;
    }

    return selectedDeliveryDestinations.filter(
      (destination) => getDeliveryWholesalerName(destination) === deliveryWholesalerFilter,
    );
  }, [deliveryWholesalerFilter, selectedDeliveryDestinations]);
  const pagedDeliveryDestinations = useMemo(
    () =>
      paginateItems(filteredDeliveryDestinations, deliveryDestinationPage).items,
    [deliveryDestinationPage, filteredDeliveryDestinations],
  );
  const normalizedDeliveryDestinationPage = paginateItems(
    filteredDeliveryDestinations,
    deliveryDestinationPage,
  ).page;

  useEffect(() => {
    if (view !== "products") {
      return;
    }

    if (!skippedInitialProductPageLoadRef.current) {
      skippedInitialProductPageLoadRef.current = true;
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingProductPage(true);
      try {
        const result = await fetchProductMasterProducts({
          clientId: productClientFilter,
          search: productSearch,
          page: productPage,
          pageSize: masterPageSize,
        });

        if (!isActive) {
          return;
        }

        if (!result.ok) {
          setProductNotice(result.message);
          return;
        }

        setProducts(result.products);
        setProductTotalCount(result.totalCount);
      } catch (error) {
        if (isActive) {
          setProductNotice(`商品マスタの読み込みに失敗しました: ${getErrorMessage(error)}`);
        }
      } finally {
        if (isActive) {
          setIsLoadingProductPage(false);
        }
      }
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [productClientFilter, productPage, productSearch, view]);

  function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    setIsProcessingFile(true);
    setNotice(`${file.name} をチェックしています。`);
    readFileForImport(file)
      .then(async (result) => {
        const uploadedFile = await uploadPdfForViewing(file);

        if (result.type === "pdf") {
          await handlePdfImport(file.name, result, uploadedFile);
          return;
        }

        await applyImport(result.rows, file.name, uploadedFile);
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error);
        showImportErrorPopup([{ row: 0, field: "file", message }], "ファイルを読めませんでした。");
        setNotice(message);
      })
      .finally(() => {
        setIsProcessingFile(false);
        setFileInputKey((current) => current + 1);
      });
  }

  async function uploadPdfForViewing(file: File) {
    if (!isPdfFile(file) || !selectedClientId || !selectedSupplier) {
      return undefined;
    }

    const formData = new FormData();
    formData.append("clientId", selectedClientId);
    formData.append("supplierId", selectedSupplier.id);
    formData.append("file", file);

    const uploadResult = await uploadOrderFile(formData);
    if (!uploadResult.ok) {
      throw new Error(uploadResult.message);
    }

    if (!uploadResult.path) {
      throw new Error("PDFは読み取れましたが、PDFファイルを保存できませんでした。");
    }

    return {
      path: uploadResult.path,
      url: uploadResult.url,
    };
  }

  async function handlePdfImport(
    fileName: string,
    result: Extract<FileReadResult, { type: "pdf" }>,
    uploadedFile?: UploadedOrderFile,
  ) {
    setPendingImport(null);

    if (!selectedClientId || !selectedSupplier) {
      const message = "選択中クライアントの取込設定が見つかりません。";
      showImportErrorPopup([{ row: 0, field: "client", message }]);
      setNotice(message);
      return;
    }

    const parseResult = parsePdfOrderText({
      text: result.text,
      mapping: getSupplierMapping(selectedSupplier.mappingKey),
      deliveryDestinations: selectedDeliveryDestinations,
    });

    if (parseResult.errors.length > 0) {
      setImportBatches((current) => [
        buildImportBatch(fileName, "blocked", parseResult.errors, uploadedFile?.path, uploadedFile?.url),
        ...current,
      ]);
      setIsSavingImport(true);
      const saveResult = await saveBlockedImport({
        clientId: selectedClientId,
        supplierId: selectedSupplier.id,
        fileName,
        fileStoragePath: uploadedFile?.path,
        errors: parseResult.errors,
      });
      setIsSavingImport(false);
      const message = saveResult.ok
        ? `PDFは読み取れましたが、受注に変換できない項目があります。${saveResult.message}`
        : saveResult.message;
      showImportErrorPopup(parseResult.errors, message);
      setNotice(message);
      return;
    }

    await applyImport(parseResult.rows, fileName, uploadedFile);
  }

  async function applyImport(
    rows: Record<string, unknown>[],
    fileName: string,
    uploadedFile?: UploadedOrderFile,
  ) {
    if (!selectedClientId || !selectedSupplier) {
      const message = "選択中クライアントの取込設定が見つかりません。";
      showImportErrorPopup([{ row: 0, field: "client", message }]);
      setNotice(message);
      return;
    }

    const mapping = getSupplierMapping(selectedSupplier.mappingKey);
    const draft = buildImportDraft({
      rows,
      clientId: selectedClientId,
      supplier: selectedSupplier,
      mapping,
      products,
      existingOrders: orders,
      sourceFile: fileName,
    });

    if (draft.errors.length > 0) {
      setPendingImport({
        rows,
        fileName,
        fileStoragePath: uploadedFile?.path,
        fileStorageUrl: uploadedFile?.url,
        missingJans: draft.missingJans,
      });
      setImportBatches((current) => [
        buildImportBatch(fileName, "blocked", draft.errors, uploadedFile?.path, uploadedFile?.url),
        ...current,
      ]);
      setIsSavingImport(true);
      const saveResult = await saveBlockedImport({
        clientId: selectedClientId,
        supplierId: selectedSupplier.id,
        fileName,
        fileStoragePath: uploadedFile?.path,
        errors: draft.errors,
      });
      setIsSavingImport(false);
      const message = saveResult.ok
        ? `怪しい点があるため受注は保存していません。${saveResult.message}`
        : saveResult.message;
      showImportErrorPopup(draft.errors, message);
      setNotice(message);
      return;
    }

    setIsSavingImport(true);
    const saveResult = await saveImportedOrders({
      clientId: selectedClientId,
      supplierId: selectedSupplier.id,
      fileName,
      fileStoragePath: uploadedFile?.path,
      orders: draft.orders,
    });
    setIsSavingImport(false);

    if (!saveResult.ok) {
      showImportErrorPopup([{ row: 0, field: "save", message: saveResult.message }]);
      setNotice(saveResult.message);
      return;
    }

    if (saveResult.attachedFileOnly) {
      const attachedOrderIds = new Set(Object.values(saveResult.orderIds ?? {}));
      setOrders((current) =>
        current.map((order) =>
          attachedOrderIds.has(order.id)
            ? {
                ...order,
                sourceFile: fileName,
                sourceFilePath: uploadedFile?.path,
                sourceFileUrl: uploadedFile?.url,
              }
            : order,
        ),
      );
      setPendingImport(null);
      setImportBatches((current) => [
        buildImportBatch(fileName, "saved", [], uploadedFile?.path, uploadedFile?.url),
        ...current,
      ]);
      setNotice(saveResult.message);
      return;
    }

    const savedOrders = applySavedOrderIds(draft.orders, saveResult.orderIds).map((order) => ({
      ...order,
      sourceFilePath: uploadedFile?.path,
      sourceFileUrl: uploadedFile?.url,
    }));
    setOrders((current) => mergeImportedOrders(current, savedOrders));
    await promptToRegisterUnknownStores(savedOrders);
    setPendingImport(null);
    setImportBatches((current) => [
      buildImportBatch(fileName, "saved", [], uploadedFile?.path, uploadedFile?.url),
      ...current,
    ]);
    setNotice(`${draft.orders.length}件の受注を imported として保存しました。${saveResult.message}`);
  }

  async function promptToRegisterUnknownStores(importedOrders: Order[]) {
    const candidates = extractUnknownStoreCandidates(importedOrders, stores);

    if (candidates.length === 0) {
      return;
    }

    let currentStores = stores;
    const savedStores: Store[] = [];

    for (const candidate of candidates) {
      const targetName = window.prompt(
        [
          `発注書の備考欄から「${candidate}」を検出しました。`,
          "店舗マスタに登録する場合は店舗名を入力してください。",
          "既存店舗名を入力すると、その店舗の別名として追加します。",
          "登録しない場合はキャンセルしてください。",
        ].join("\n"),
        candidate,
      );

      if (targetName === null) {
        continue;
      }

      const normalizedTargetName = targetName.trim();

      if (!normalizedTargetName) {
        continue;
      }

      const existingStore = currentStores.find(
        (store) => normalizeStoreMatchText(store.name) === normalizeStoreMatchText(normalizedTargetName),
      );
      const nextStore: Store = existingStore
        ? {
            ...existingStore,
            aliases: Array.from(new Set([...existingStore.aliases, candidate, normalizedTargetName])),
          }
        : {
            id: createId(),
            name: normalizedTargetName,
            aliases: normalizedTargetName === candidate ? [] : [candidate],
          };

      const saveResult = await saveStore(nextStore);

      if (!saveResult.ok) {
        setStoreNotice(saveResult.message);
        setNotice(saveResult.message);
        return;
      }

      currentStores = [
        ...currentStores.filter((store) => store.id !== saveResult.store.id),
        saveResult.store,
      ];
      savedStores.push(saveResult.store);
    }

    if (savedStores.length > 0) {
      setStores(currentStores);
      setStoreNotice(`${savedStores.length}件の店舗候補を店舗マスタに反映しました。`);
      setNotice(`${savedStores.length}件の店舗候補を店舗マスタに反映しました。`);
    }
  }

  async function registerProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setProductNotice("");

    const normalizedForm = {
      jan: productForm.jan.trim(),
      internalSku: productForm.internalSku.trim(),
      cooolaCode: productForm.cooolaCode.trim(),
      name: productForm.name.trim(),
      wholesalePrice: productForm.wholesalePrice.trim(),
      taxRate: productForm.taxRate.trim(),
      retailPrice: productForm.retailPrice.trim(),
      payoutRate: productForm.payoutRate.trim(),
      memo: productForm.memo.trim(),
    };
    const wholesalePrice = Number(normalizedForm.wholesalePrice);
    const taxRate = Number(normalizedForm.taxRate);
    const retailPrice = Number(normalizedForm.retailPrice);
    const payoutRate = parseRatePercent(normalizedForm.payoutRate);
    const normalizedExtraFields = normalizeProductMasterExtraForm(productForm);

    if (
      !normalizedForm.jan ||
      !normalizedForm.name ||
      !normalizedForm.wholesalePrice ||
      !normalizedForm.retailPrice ||
      !normalizedForm.payoutRate
    ) {
      setNotice("JAN、商品名、下代（税抜）、上代（税抜）、掛け率は必須です。COOOLa商品コードは任意です。");
      setProductNotice("JAN、商品名、下代（税抜）、上代（税抜）、掛け率は必須です。COOOLa商品コードは任意です。");
      return;
    }

    if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
      setNotice("下代（税抜）は0以上の数字で入力してください。");
      setProductNotice("下代（税抜）は0以上の数字で入力してください。");
      return;
    }

    if (!Number.isFinite(taxRate) || taxRate < 0) {
      setNotice("税率は0以上の数字で入力してください。");
      setProductNotice("税率は0以上の数字で入力してください。");
      return;
    }

    if (!Number.isFinite(retailPrice) || retailPrice < 0) {
      setNotice("上代（税抜）は0以上の数字で入力してください。");
      setProductNotice("上代（税抜）は0以上の数字で入力してください。");
      return;
    }

    const registrationClient = clients.find((client) => client.id === productRegistrationClientId);
    const registrationClientFbpFeeRate = registrationClient?.fbpFeeRate ?? 0.08;

    if (!productRegistrationClientId || !registrationClient) {
      setNotice("登録先クライアントを選択してください。");
      setProductNotice("登録先クライアントを選択してください。");
      return;
    }

    if (payoutRate === null || payoutRate <= registrationClientFbpFeeRate) {
      const message = `掛け率は登録先クライアントのFBP手数料率（${formatNullableRate(registrationClientFbpFeeRate)}）より大きい数字で入力してください。`;
      setNotice(message);
      setProductNotice(message);
      return;
    }

    const nextProduct: Product = {
      jan: normalizedForm.jan,
      clientId: productRegistrationClientId,
      internalSku: normalizedForm.internalSku,
      cooolaCode: normalizedForm.cooolaCode,
      name: normalizedForm.name,
      wholesalePrice,
      taxRate,
      retailPrice,
      payoutRate,
      memo: normalizedForm.memo,
      productImagePath: productForm.productImagePath || undefined,
      productImageUrl: productForm.productImageUrl || undefined,
      ...normalizedExtraFields,
    };

    setIsSavingProduct(true);

    const saveResult = await saveProduct(nextProduct);
    setIsSavingProduct(false);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      setProductNotice(saveResult.message);
      return;
    }

    const nextProducts = [
      ...products.filter(
        (product) => !(product.clientId === productRegistrationClientId && product.jan === nextProduct.jan),
      ),
      nextProduct,
    ];

    setProducts(nextProducts);
    setProductForm(emptyProductForm);
    setNotice(`${nextProduct.jan} を商品マスタに登録しました。${saveResult.message}`);
    setProductNotice(`${nextProduct.jan} を商品マスタに登録しました。`);

    if (pendingImport) {
      const nextMissingJans = pendingImport.missingJans.filter((jan) => jan !== nextProduct.jan);
      setPendingImport({ ...pendingImport, missingJans: nextMissingJans });

      if (nextMissingJans.length === 0) {
        await retryImportAfterProductRegistration(
          pendingImport.rows,
          pendingImport.fileName,
          nextProducts,
          pendingImport.fileStoragePath,
          pendingImport.fileStorageUrl,
        );
      }
    }
  }

  async function handleProductMasterExcelChange(file: File | null) {
    if (!file) {
      return;
    }

    if (!productRegistrationClientId) {
      setProductNotice("登録先クライアントを選択してください。");
      setProductMasterFileInputKey((current) => current + 1);
      return;
    }

    setIsImportingProductMaster(true);
    setIsSavingProduct(true);
    setProductNotice(`${file.name} を読み込んでいます。`);

    try {
      const existingProductsResult = await fetchProductsForProductMasterImport(productRegistrationClientId);
      const existingProducts = existingProductsResult.ok ? existingProductsResult.products : products;
      const parsed = await parseProductMasterExcel(file, productRegistrationClientId, existingProducts);

      if (parsed.products.length === 0) {
        setProductNotice(
          parsed.errors.length > 0
            ? `登録できる商品がありませんでした。${parsed.errors.slice(0, 3).join(" / ")}`
            : "登録できる商品がありませんでした。",
        );
        return;
      }

      const savedProducts: Product[] = [];
      const saveMessages = new Set<string>();

      for (const product of parsed.products) {
        const saveResult = await saveProduct(product);

        if (!saveResult.ok) {
          setProductNotice(saveResult.message);
          setNotice(saveResult.message);
          return;
        }

        savedProducts.push(product);
        saveMessages.add(saveResult.message);
      }

      setProducts((current) => {
        const importedKeys = new Set(
          savedProducts.map((product) => buildProductKey(product.clientId, product.jan)),
        );

        return [
          ...current.filter((product) => !importedKeys.has(buildProductKey(product.clientId, product.jan))),
          ...savedProducts,
        ];
      });

      const errorText =
        parsed.errors.length > 0
          ? ` ${parsed.errors.length}行は未登録です: ${parsed.errors.slice(0, 3).join(" / ")}`
          : "";
      const extraMessage = Array.from(saveMessages).find((message) =>
        message.includes("追加項目を保存するには"),
      );
      const migrationText = extraMessage ? ` ${extraMessage}` : "";
      setProductNotice(`${savedProducts.length}件の商品マスタをExcelから登録しました。${errorText}${migrationText}`);
      setNotice(`${savedProducts.length}件の商品マスタをExcelから登録しました。`);
    } catch (error) {
      const message = getErrorMessage(error);
      setProductNotice(`商品マスタExcelを読み込めませんでした: ${message}`);
      setNotice(`商品マスタExcelを読み込めませんでした: ${message}`);
    } finally {
      setIsImportingProductMaster(false);
      setIsSavingProduct(false);
      setProductMasterFileInputKey((current) => current + 1);
    }
  }

  async function registerDeliveryDestination(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setDeliveryDestinationNotice("");

    const normalizedForm = {
      code: deliveryDestinationForm.code.trim(),
      wholesalerName: deliveryDestinationForm.wholesalerName.trim(),
      name: deliveryDestinationForm.name.trim(),
      postalCode: deliveryDestinationForm.postalCode.trim(),
      address1: deliveryDestinationForm.address1.trim(),
      address2: deliveryDestinationForm.address2.trim(),
      address3: deliveryDestinationForm.address3.trim(),
      tel: deliveryDestinationForm.tel.trim(),
      aliases: deliveryDestinationForm.aliases
        .split(/[\n,、]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
    };

    if (!selectedClientId) {
      setNotice("先にクライアントを選んでください。");
      setDeliveryDestinationNotice("先にクライアントを選んでください。");
      return;
    }

    if (
      !normalizedForm.code ||
      !normalizedForm.wholesalerName ||
      !normalizedForm.name ||
      !normalizedForm.postalCode ||
      !normalizedForm.address1 ||
      !normalizedForm.tel
    ) {
      const message = "配送先コード、問屋名、配送先名、郵便番号、住所1、TELは必須です。";
      setNotice(message);
      setDeliveryDestinationNotice(message);
      return;
    }

    const nextDestination: DeliveryDestination = {
      code: normalizedForm.code,
      wholesalerName: normalizedForm.wholesalerName,
      name: normalizedForm.name,
      postalCode: normalizedForm.postalCode,
      address1: normalizedForm.address1,
      address2: normalizedForm.address2,
      address3: normalizedForm.address3,
      tel: normalizedForm.tel,
      aliases: [normalizedForm.name, ...normalizedForm.aliases],
    };

    setIsSavingDeliveryDestination(true);
    const saveResult = await saveDeliveryDestinationForAllClients(nextDestination);
    setIsSavingDeliveryDestination(false);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      setDeliveryDestinationNotice(saveResult.message);
      return;
    }

    setDeliveryDestinations((current) => [
      ...current.filter((destination) => destination.code !== nextDestination.code),
      nextDestination,
    ]);
    setDeliveryDestinationForm(emptyDeliveryDestinationForm);
    setNotice(`${nextDestination.code} を配送先マスタに登録しました。${saveResult.message}`);
    setDeliveryDestinationNotice(`${nextDestination.code} を配送先マスタに登録しました。`);
  }

  async function registerStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const store: Store = {
      id: createId(),
      name: storeForm.name.trim(),
      aliases: parseAliasText(storeForm.aliases),
    };

    if (!store.name) {
      setStoreNotice("店舗名を入力してください。");
      return;
    }

    setIsSavingStore(true);
    const saveResult = await saveStore(store);
    setIsSavingStore(false);

    if (!saveResult.ok) {
      setStoreNotice(saveResult.message);
      setNotice(saveResult.message);
      return;
    }

    setStores((current) => [
      ...current.filter((currentStore) => currentStore.id !== saveResult.store.id),
      saveResult.store,
    ]);
    setStoreForm(emptyStoreForm);
    setStoreNotice(`${saveResult.store.name} を店舗マスタに登録しました。`);
    setNotice(`${saveResult.store.name} を店舗マスタに登録しました。${saveResult.message}`);
  }

  function startStoreMasterEdit() {
    setStoreMasterDrafts(stores.map(createStoreMasterDraft));
    setStoreNotice("");
    setIsEditingStoreMaster(true);
  }

  function cancelStoreMasterEdit() {
    setStoreMasterDrafts([]);
    setIsEditingStoreMaster(false);
    setStoreNotice("店舗マスタの編集をキャンセルしました。");
  }

  function updateStoreMasterDraft(index: number, patch: Partial<StoreMasterDraft>) {
    setStoreMasterDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  async function saveStoreMasterDrafts() {
    const nextStores: Store[] = [];

    for (const draft of storeMasterDrafts) {
      const store: Store = {
        id: draft.id,
        name: draft.name.trim(),
        aliases: parseAliasText(draft.aliases),
      };
      const currentStore = stores.find((current) => current.id === draft.id);

      if (!store.name) {
        setStoreNotice("店舗名を入力してください。");
        return;
      }

      if (!currentStore || hasStoreChanged(currentStore, store)) {
        nextStores.push(store);
      }
    }

    if (nextStores.length === 0) {
      setStoreNotice("変更はありません。");
      setIsEditingStoreMaster(false);
      return;
    }

    setIsSavingStore(true);

    for (const store of nextStores) {
      const saveResult = await saveStore(store);

      if (!saveResult.ok) {
        setIsSavingStore(false);
        setStoreNotice(saveResult.message);
        setNotice(saveResult.message);
        return;
      }
    }

    setIsSavingStore(false);
    setStores((current) =>
      current.map((store) => nextStores.find((nextStore) => nextStore.id === store.id) ?? store),
    );
    setStoreMasterDrafts([]);
    setIsEditingStoreMaster(false);
    setStoreNotice(`${nextStores.length}件の店舗マスタを更新しました。`);
    setNotice(`${nextStores.length}件の店舗マスタを更新しました。`);
  }

  async function importDeliveryDestinationsFromFile(file: File | null) {
    if (!file) {
      return;
    }

    setDeliveryDestinationNotice("");
    setIsSavingDeliveryDestination(true);

    try {
      const rows = await readRowsFromSpreadsheetFile(file);
      const { destinations, errors } = parseDeliveryDestinationRows(rows);

      if (errors.length > 0) {
        showImportErrorPopup(errors, "配送先一覧を登録できませんでした。");
        setDeliveryDestinationNotice("配送先一覧の内容に不足があります。");
        return;
      }

      if (destinations.length === 0) {
        const message = "登録できる配送先がありませんでした。";
        showImportErrorPopup([{ row: 0, field: "file", message }], message);
        setDeliveryDestinationNotice(message);
        return;
      }

      for (const destination of destinations) {
        const saveResult = await saveDeliveryDestinationForAllClients(destination);

        if (!saveResult.ok) {
          setDeliveryDestinationNotice(saveResult.message);
          setNotice(saveResult.message);
          return;
        }
      }

      const importedWholesalerNames = destinations
        .map((destination) => getDeliveryWholesalerName(destination))
        .filter(Boolean);
      setCustomWholesalerOptions((current) =>
        Array.from(new Set([...current, ...importedWholesalerNames])),
      );
      setDeliveryDestinations((current) => [
        ...current.filter(
          (destination) =>
            !destinations.some((nextDestination) => nextDestination.code === destination.code),
        ),
        ...destinations,
      ]);
      setDeliveryDestinationPage(0);
      setDeliveryDestinationNotice(`${destinations.length}件の配送先マスタを一括登録しました。`);
    } catch (error) {
      const message = getErrorMessage(error);
      showImportErrorPopup([{ row: 0, field: "file", message }], "配送先一覧を読み込めませんでした。");
      setDeliveryDestinationNotice(message);
    } finally {
      setIsSavingDeliveryDestination(false);
      setDeliveryDestinationFileInputKey((current) => current + 1);
    }
  }

  function startProductMasterEdit() {
    setProductMasterDrafts(pagedProducts.map(createProductMasterDraft));
    setProductNotice("");
    setIsEditingProductMaster(true);
  }

  function cancelProductMasterEdit() {
    setProductMasterDrafts([]);
    setIsEditingProductMaster(false);
    setProductNotice("商品マスタの編集をキャンセルしました。");
  }

  function updateProductMasterDraft(index: number, patch: Partial<ProductMasterDraft>) {
    setProductMasterDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  async function saveProductMasterDrafts() {
    const productUpdates: Array<{ product: Product; previousJan?: string }> = [];

    for (const draft of productMasterDrafts) {
      const normalizedProduct = normalizeProductDraft(draft, draft.originalClientId);
      const janChanged = normalizedProduct.product.jan !== draft.originalJan;
      const draftClient = clients.find((client) => client.id === draft.originalClientId);
      const draftClientFbpFeeRate = draftClient?.fbpFeeRate ?? 0.08;

      if (
        !normalizedProduct.product.jan ||
        !normalizedProduct.product.name ||
        !draft.wholesalePrice.trim()
      ) {
        setProductNotice("JAN、商品名、下代（税抜）は必須です。");
        return;
      }

      if (
        janChanged &&
        products.some(
          (product) =>
            product.clientId === draft.originalClientId &&
            product.jan === normalizedProduct.product.jan &&
            product.jan !== draft.originalJan,
        )
      ) {
        setProductNotice(`JANコード ${normalizedProduct.product.jan} は同じクライアントですでに登録されています。`);
        return;
      }

      if (
        !Number.isFinite(normalizedProduct.product.wholesalePrice) ||
        normalizedProduct.product.wholesalePrice < 0
      ) {
        setProductNotice(`${normalizedProduct.product.jan} の下代（税抜）は0以上の数字で入力してください。`);
        return;
      }

      if (
        !Number.isFinite(normalizedProduct.product.taxRate) ||
        normalizedProduct.product.taxRate < 0
      ) {
        setProductNotice(`${normalizedProduct.product.jan} の税率は0以上の数字で入力してください。`);
        return;
      }

      if (
        draft.retailPrice.trim() &&
        (
          normalizedProduct.product.retailPrice === null ||
          !Number.isFinite(normalizedProduct.product.retailPrice) ||
          normalizedProduct.product.retailPrice < 0
        )
      ) {
        setProductNotice(`${normalizedProduct.product.jan} の上代（税抜）は0以上の数字で入力してください。`);
        return;
      }

      if (
        draft.payoutRate.trim() &&
        (
          normalizedProduct.product.payoutRate === null ||
          normalizedProduct.product.payoutRate <= draftClientFbpFeeRate
        )
      ) {
        setProductNotice(
          `${getClientName(draft.originalClientId, clients)} / ${normalizedProduct.product.jan} の掛け率はFBP手数料率（${formatNullableRate(draftClientFbpFeeRate)}）より大きい数字で入力してください。`,
        );
        return;
      }

      const currentProduct = products.find(
        (product) => product.clientId === draft.originalClientId && product.jan === draft.originalJan,
      );

      if (!currentProduct || hasProductChanged(currentProduct, normalizedProduct.product) || janChanged) {
        productUpdates.push({
          product: normalizedProduct.product,
          previousJan: janChanged ? draft.originalJan : undefined,
        });
      }
    }

    if (productUpdates.length === 0) {
      setProductNotice("変更はありません。");
      setIsEditingProductMaster(false);
      return;
    }

    setIsSavingProduct(true);

    for (const { product, previousJan } of productUpdates) {
      const saveResult = await saveProduct(product, { previousJan });

      if (!saveResult.ok) {
        setIsSavingProduct(false);
        setProductNotice(saveResult.message);
        setNotice(saveResult.message);
        return;
      }
    }

    setIsSavingProduct(false);
    setProducts((current) => {
      let nextProducts = [...current];

      for (const { product, previousJan } of productUpdates) {
        if (previousJan) {
          nextProducts = nextProducts.filter(
            (item) => !(item.clientId === product.clientId && item.jan === previousJan),
          );
        }

        const existingIndex = nextProducts.findIndex(
          (item) => item.clientId === product.clientId && item.jan === product.jan,
        );

        if (existingIndex >= 0) {
          nextProducts[existingIndex] = product;
        } else {
          nextProducts.push(product);
        }
      }

      return nextProducts;
    });
    setOrders((current) =>
      current.map((order) => ({
        ...order,
        lines: order.lines.map((line) => {
          const update = productUpdates.find(
            ({ product, previousJan }) =>
              previousJan &&
              order.clientId === product.clientId &&
              line.jan === previousJan,
          );

          if (!update?.previousJan) {
            return line;
          }

          return { ...line, jan: update.product.jan };
        }),
      })),
    );
    setProductMasterDrafts([]);
    setIsEditingProductMaster(false);
    setProductNotice(`${productUpdates.length}件の商品マスタを更新しました。`);
    setNotice(`${productUpdates.length}件の商品マスタを更新しました。`);
  }

  async function removeProductFromMaster(clientId: string, jan: string) {
    if (usedProductKeys.has(buildProductKey(clientId, jan))) {
      setProductNotice("この商品は受注明細で使用されているため削除できません。商品名や下代（税抜）の編集はできます。");
      return;
    }

    const confirmed = window.confirm(`${getClientName(clientId, clients)} / JAN ${jan} を商品マスタから削除します。よろしいですか？`);

    if (!confirmed) {
      return;
    }

    setIsSavingProduct(true);
    const saveResult = await deleteProduct({ clientId, jan });
    setIsSavingProduct(false);

    if (!saveResult.ok) {
      setProductNotice(saveResult.message);
      return;
    }

    setProducts((current) =>
      current.filter((product) => !(product.clientId === clientId && product.jan === jan)),
    );
    setProductMasterDrafts((current) =>
      current.filter((draft) => !(draft.originalClientId === clientId && draft.originalJan === jan)),
    );
    setProductNotice(`${jan} を商品マスタから削除しました。`);
  }

  function startDeliveryDestinationMasterEdit() {
    setDeliveryDestinationMasterDrafts(
      pagedDeliveryDestinations.map(createDeliveryDestinationMasterDraft),
    );
    setDeliveryDestinationNotice("");
    setIsEditingDeliveryDestinationMaster(true);
  }

  function cancelDeliveryDestinationMasterEdit() {
    setDeliveryDestinationMasterDrafts([]);
    setIsEditingDeliveryDestinationMaster(false);
    setDeliveryDestinationNotice("配送先マスタの編集をキャンセルしました。");
  }

  function updateDeliveryDestinationMasterDraft(
    index: number,
    patch: Partial<DeliveryDestinationMasterDraft>,
  ) {
    setDeliveryDestinationMasterDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  async function saveDeliveryDestinationMasterDrafts() {
    const nextDestinations: DeliveryDestination[] = [];

    for (const draft of deliveryDestinationMasterDrafts) {
      const nextDestination = normalizeDeliveryDestinationDraft(draft);

      if (
        !nextDestination.code ||
        !nextDestination.wholesalerName ||
        !nextDestination.name ||
        !nextDestination.postalCode ||
        !nextDestination.address1 ||
        !nextDestination.tel
      ) {
        setDeliveryDestinationNotice("配送先コード、問屋名、配送先名、郵便番号、住所1、TELは必須です。");
        return;
      }

      const currentDestination = selectedDeliveryDestinations.find(
        (destination) => destination.code === draft.originalCode,
      );

      if (!currentDestination || hasDeliveryDestinationChanged(currentDestination, nextDestination)) {
        nextDestinations.push(nextDestination);
      }
    }

    if (nextDestinations.length === 0) {
      setDeliveryDestinationNotice("変更はありません。");
      setIsEditingDeliveryDestinationMaster(false);
      return;
    }

    setIsSavingDeliveryDestination(true);

    for (const destination of nextDestinations) {
      const saveResult = await saveDeliveryDestinationForAllClients(destination);

      if (!saveResult.ok) {
        setIsSavingDeliveryDestination(false);
        setDeliveryDestinationNotice(saveResult.message);
        setNotice(saveResult.message);
        return;
      }
    }

    setIsSavingDeliveryDestination(false);
    setDeliveryDestinations((current) => [
      ...current.filter(
        (destination) =>
          !nextDestinations.some(
            (nextDestination) => destination.code === nextDestination.code,
          ),
      ),
      ...nextDestinations,
    ]);
    setDeliveryDestinationMasterDrafts([]);
    setIsEditingDeliveryDestinationMaster(false);
    setDeliveryDestinationNotice(`${nextDestinations.length}件の配送先マスタを更新しました。`);
    setNotice(`${nextDestinations.length}件の配送先マスタを更新しました。`);
  }

  async function retryImportAfterProductRegistration(
    rows: Record<string, unknown>[],
    fileName: string,
    nextProducts: Product[],
    fileStoragePath?: string,
    fileStorageUrl?: string,
  ) {
    if (!selectedSupplier) {
      return;
    }

    const draft = buildImportDraft({
      rows,
      clientId: selectedClientId,
      supplier: selectedSupplier,
      mapping: getSupplierMapping(selectedSupplier.mappingKey),
      products: nextProducts,
      existingOrders: orders,
      sourceFile: fileName,
    });

    if (draft.errors.length > 0) {
      const message = "商品登録後もエラーが残っています。";
      showImportErrorPopup(draft.errors, message);
      setNotice(message);
      return;
    }

    setIsSavingImport(true);
    const saveResult = await saveImportedOrders({
      clientId: selectedClientId,
      supplierId: selectedSupplier.id,
      fileName,
      fileStoragePath,
      orders: draft.orders,
    });
    setIsSavingImport(false);

    if (!saveResult.ok) {
      showImportErrorPopup([{ row: 0, field: "save", message: saveResult.message }]);
      setNotice(saveResult.message);
      return;
    }

    if (saveResult.attachedFileOnly) {
      const attachedOrderIds = new Set(Object.values(saveResult.orderIds ?? {}));
      setOrders((current) =>
        current.map((order) =>
          attachedOrderIds.has(order.id)
            ? {
                ...order,
                sourceFile: fileName,
                sourceFilePath: fileStoragePath,
                sourceFileUrl: fileStorageUrl,
              }
            : order,
        ),
      );
      setPendingImport(null);
      setImportBatches((current) => [
        buildImportBatch(fileName, "saved", [], fileStoragePath, fileStorageUrl),
        ...current,
      ]);
      setNotice(saveResult.message);
      return;
    }

    const savedOrders = applySavedOrderIds(draft.orders, saveResult.orderIds).map((order) => ({
      ...order,
      sourceFilePath: fileStoragePath,
      sourceFileUrl: fileStorageUrl,
    }));
    setOrders((current) => mergeImportedOrders(current, savedOrders));
    setPendingImport(null);
    setImportBatches((current) => [
      buildImportBatch(fileName, "saved", [], fileStoragePath, fileStorageUrl),
      ...current,
    ]);
    setNotice(`商品登録後に再チェックし、受注を自動保存しました。${saveResult.message}`);
  }

  async function updateOrderStatus(orderId: string, action: "confirm" | "undo" | "ship") {
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      setNotice("対象の受注が見つかりません。");
      return;
    }

    if (action === "confirm") {
      const confirmed = window.confirm(
        [
          `発注番号 ${targetOrder.orderNo} をチェック済みにします。`,
          "",
          "チェック済みにすると、この時点の商品価格・税率を受注に固定します。",
          "後から商品マスターの価格や税率を変更しても、この受注金額は変わりません。",
          "",
          "よろしいですか？",
        ].join("\n"),
      );

      if (!confirmed) {
        return;
      }
    }

    if (action === "ship") {
      const confirmed = window.confirm(
        targetOrder.status === "shipped"
          ? `発注番号 ${targetOrder.orderNo} の発送済みを解除します。よろしいですか？`
          : `発注番号 ${targetOrder.orderNo} を発送済みにします。よろしいですか？`,
      );

      if (!confirmed) {
        return;
      }
    }

    setSavingOrderId(orderId);
    const saveResult = await saveOrderStatusAction(targetOrder, action);
    setSavingOrderId(null);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        if (action === "confirm") {
          return confirmOrderWithPayoutFee(order, products, selectedClient?.fbpFeeRate ?? 0.08);
        }

        if (action === "ship") {
          return {
            ...order,
            status: order.status === "shipped" ? "confirmed" : "shipped",
          };
        }

        return {
          ...order,
          status: "imported",
          lines: order.lines.map((line) => ({
            ...line,
            unitPriceSnapshot: null,
            taxRateSnapshot: null,
            amount: null,
            retailPriceSnapshot: null,
            payoutRateSnapshot: null,
            fbpFeeRateSnapshot: null,
            payoutAmount: null,
          })),
        };
      }),
    );
    setNotice(saveResult.message);
  }

  async function updateOrderArrivalDueDate(orderId: string, arrivalDueDate: string) {
    const targetOrder = orders.find((order) => order.id === orderId);

    if (!targetOrder) {
      setNotice("対象の受注が見つかりません。");
      return;
    }

    if (!arrivalDueDate || Number.isNaN(Date.parse(arrivalDueDate))) {
      setNotice("到着指定日を日付で入力してください。");
      return;
    }

    setSavingOrderId(orderId);
    const saveResult = await updateOrderArrivalDueDateInSupabase({
      clientId: targetOrder.clientId,
      orderId: targetOrder.id,
      arrivalDueDate,
    });
    setSavingOrderId(null);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              arrivalDueDate,
              deliveryDueDate: arrivalDueDate,
            }
          : order,
      ),
    );
    setNotice(saveResult.message);
  }

  async function saveOrderStatusAction(
    targetOrder: Order,
    action: "confirm" | "undo" | "ship",
  ) {
    if (action === "confirm") {
      return confirmOrderInSupabase({
        clientId: targetOrder.clientId,
        orderId: targetOrder.id,
      });
    }

    if (action === "ship") {
      if (targetOrder.status === "shipped") {
        return markOrderCheckedInSupabase({
          clientId: targetOrder.clientId,
          orderId: targetOrder.id,
        });
      }

      return markOrderShippedInSupabase({
        clientId: targetOrder.clientId,
        orderId: targetOrder.id,
      });
    }

    return undoOrderConfirmationInSupabase({
      clientId: targetOrder.clientId,
      orderId: targetOrder.id,
    });
  }

  async function deleteOrder(orderId: string) {
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      setNotice("対象の受注が見つかりません。");
      return;
    }

    const confirmed = window.confirm(
      `発注番号 ${targetOrder.orderNo} を受注一覧とDBから削除します。よろしいですか？`,
    );

    if (!confirmed) {
      return;
    }

    setSavingOrderId(orderId);
    const saveResult = await deleteOrderInSupabase({
      clientId: targetOrder.clientId,
      orderId: targetOrder.id,
    });
    setSavingOrderId(null);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    setOrders((current) => current.filter((order) => order.id !== orderId));
    setNotice(saveResult.message);
  }

  function exportCooolaCsv(orderId: string) {
    const targetOrder = orders.find((order) => order.id === orderId);

    if (!targetOrder) {
      setNotice("対象の受注が見つかりません。");
      return;
    }

    if (targetOrder.status !== "confirmed" && targetOrder.status !== "shipped") {
      setNotice("メーカー向けCSVはチェック済みまたは発送済み受注だけ出力できます。");
      return;
    }

    downloadTextFile({
      fileName: buildCooolaExportFileName(targetOrder),
      text: buildCooolaCsv(targetOrder, products),
      type: "text/csv;charset=utf-8",
    });
    setCsvExportedOrderIds((current) =>
      current.includes(orderId) ? current : [...current, orderId],
    );
    setNotice(`発注番号 ${targetOrder.orderNo} のメーカー向けCSVを出力しました。`);
  }

  function exportSellInCsv() {
    downloadTextFile({
      fileName: buildSellInExportFileName("csv", sellInPeriodStart, sellInPeriodEnd),
      text: Papa.unparse(buildSellInExportRows(sellInRows)),
      type: "text/csv;charset=utf-8",
    });
    setNotice("セルインデータCSVを出力しました。");
  }

  function exportSellInExcel() {
    const worksheet = XLSX.utils.json_to_sheet(buildSellInExportRows(sellInRows));
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "セルイン");
    XLSX.writeFile(workbook, buildSellInExportFileName("xlsx", sellInPeriodStart, sellInPeriodEnd));
    setNotice("セルインデータExcelを出力しました。");
  }

  function openProductMasterExportPanel() {
    setProductExportClientFilter(productClientFilter);
    setProductExportSearch(productSearch);
    setSelectedProductExportKeys(filteredProducts.map((product) => buildProductKey(product.clientId, product.jan)));
    setIsProductExportPanelOpen(true);
  }

  function toggleProductExportSelection(product: Product, checked: boolean) {
    const productKey = buildProductKey(product.clientId, product.jan);

    setSelectedProductExportKeys((current) =>
      checked
        ? Array.from(new Set([...current, productKey]))
        : current.filter((key) => key !== productKey),
    );
  }

  function selectAllProductExportCandidates() {
    const candidateKeys = exportCandidateProducts.map((product) => buildProductKey(product.clientId, product.jan));
    setSelectedProductExportKeys((current) => Array.from(new Set([...current, ...candidateKeys])));
  }

  function clearProductExportSelection() {
    setSelectedProductExportKeys([]);
  }

  function exportProductMasterExcel() {
    if (selectedProductExportProducts.length === 0) {
      setProductNotice("Excel出力する商品を選択してください。");
      return;
    }

    const worksheet = XLSXStyle.utils.aoa_to_sheet(buildProductMasterExportRows(selectedProductExportProducts));
    const workbook = XLSXStyle.utils.book_new();

    worksheet["!cols"] = productMasterListFields.map((field) => ({
      wch: field.input === "textarea" ? 36 : Math.max(14, field.label.length * 2),
    }));
    styleProductMasterWorksheet(worksheet);
    XLSXStyle.utils.book_append_sheet(workbook, worksheet, "商品マスタ");
    XLSXStyle.writeFile(
      workbook,
      buildProductMasterExportFileName({
        clientName:
          productExportClientFilter === "all" ? "すべて" : getClientName(productExportClientFilter, clients),
        search: productExportSearch,
      }),
    );
    setProductNotice(`${selectedProductExportProducts.length}件の商品マスタExcelを出力しました。`);
    setIsProductExportPanelOpen(false);
  }

  function handleClientChange(clientId: string) {
    const firstSupplier = suppliers.find((supplier) => supplier.clientId === clientId);
    setSelectedClientId(clientId);
    setSelectedSupplierId(firstSupplier?.id ?? "");
    setProductRegistrationClientId(clientId);
    setPendingImport(null);
    setProductForm(emptyProductForm);
    setDeliveryDestinationForm(emptyDeliveryDestinationForm);
    setProductNotice("");
    setDeliveryDestinationNotice("");
    setOrderFileSearch("");
    setSellInStoreFilter("all");
    setSellInSearch("");
    setProductMasterDrafts([]);
    setDeliveryDestinationMasterDrafts([]);
    setIsEditingProductMaster(false);
    setIsEditingDeliveryDestinationMaster(false);
    setFileInputKey((current) => current + 1);
  }

  function addWholesalerOption(name: string) {
    const normalizedName = name.trim();

    if (!normalizedName) {
      return;
    }

    setCustomWholesalerOptions((current) =>
      current.includes(normalizedName) ? current : [...current, normalizedName],
    );
  }

  async function saveDeliveryDestinationForAllClients(destination: DeliveryDestination) {
    if (clients.length === 0) {
      return saveDeliveryDestination({ ...destination, clientId: selectedClientId });
    }

    for (const client of clients) {
      const saveResult = await saveDeliveryDestination({
        ...destination,
        clientId: client.id,
      });

      if (!saveResult.ok) {
        return saveResult;
      }
    }

    return {
      ok: true as const,
      savedToSupabase: true,
      message: "全クライアント共通の配送先マスタに登録しました。",
    };
  }

  async function registerClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = clientName.trim();
    setClientNotice("");

    if (!normalizedName) {
      setClientNotice("クライアント名を入力してください。");
      return;
    }

    setIsSavingClient(true);
    const saveResult = await saveClient(normalizedName);
    setIsSavingClient(false);

    if (!saveResult.ok) {
      setClientNotice(saveResult.message);
      setNotice(saveResult.message);
      return;
    }

    setClients((current) => [...current, saveResult.client]);
    setSuppliers((current) => [...current, saveResult.supplier]);
    setSelectedClientId(saveResult.client.id);
    setSelectedSupplierId(saveResult.supplier.id);
    setClientMasterDrafts((current) =>
      isEditingClientMaster
        ? [...current, createClientMasterDraft(saveResult.client)]
        : current,
    );
    setClientName("");
    setPendingImport(null);
    setClientNotice(`${saveResult.client.name} を追加しました。`);
    setNotice(`${saveResult.client.name} を追加しました。${saveResult.message}`);
  }

  function startClientMasterEdit() {
    setClientMasterDrafts(clients.map(createClientMasterDraft));
    setClientNotice("");
    setIsEditingClientMaster(true);
  }

  function cancelClientMasterEdit() {
    setClientMasterDrafts([]);
    setIsEditingClientMaster(false);
    setClientNotice("クライアントマスタの編集をキャンセルしました。");
  }

  function updateClientMasterDraft(index: number, patch: Partial<ClientMasterDraft>) {
    setClientMasterDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  async function saveClientMasterDrafts() {
    const changedClients: Client[] = [];

    for (const draft of clientMasterDrafts) {
      const normalizedName = draft.name.trim();
      const fbpFeeRate = parseRatePercent(draft.fbpFeeRate.trim());
      const currentClient = clients.find((client) => client.id === draft.id);

      if (!normalizedName) {
        setClientNotice("クライアント名を入力してください。");
        return;
      }

      if (fbpFeeRate === null || fbpFeeRate < 0) {
        setClientNotice(`${normalizedName} のFBP手数料率は0以上の数字で入力してください。`);
        return;
      }

      if (!currentClient) {
        continue;
      }

      if (currentClient.name !== normalizedName || currentClient.fbpFeeRate !== fbpFeeRate) {
        changedClients.push({
          id: draft.id,
          name: normalizedName,
          fbpFeeRate,
        });
      }
    }

    if (changedClients.length === 0) {
      setClientNotice("変更はありません。");
      setIsEditingClientMaster(false);
      return;
    }

    setIsSavingClient(true);

    for (const client of changedClients) {
      const saveResult = await updateClient(client);

      if (!saveResult.ok) {
        setIsSavingClient(false);
        setClientNotice(saveResult.message);
        setNotice(saveResult.message);
        return;
      }
    }

    setIsSavingClient(false);
    setClients((current) =>
      current.map((client) => changedClients.find((nextClient) => nextClient.id === client.id) ?? client),
    );
    setClientMasterDrafts([]);
    setIsEditingClientMaster(false);
    setClientNotice(`${changedClients.length}件のクライアント情報を更新しました。`);
    setNotice(`${changedClients.length}件のクライアント情報を更新しました。`);
  }

  return (
    <main className="min-h-screen bg-background py-8 pr-6 pl-40 text-foreground">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight">{pageTitle}</h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {pageDescription}
            </p>
          </div>
        </header>

        {initialData.source !== "supabase" ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {initialData.message}
          </div>
        ) : null}

        {view === "orders" ? (
          <ClientSelectorBar
            clients={clients}
            selectedClientId={selectedClientId}
            fileInputKey={fileInputKey}
            isProcessingFile={isProcessingFile}
            isSavingImport={isSavingImport}
            onClientChange={handleClientChange}
            onFileChange={handleFileChange}
          />
        ) : null}

        {view === "orders" ? (
        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="受注件数" value={`${selectedOrders.length}件`} />
          <SummaryCard label="発送件数" value={`${shippedOrderCount}件`} />
          <SummaryCard label="表示中の仮合計" value={`${totalAmount.toLocaleString()}円`} />
        </section>
        ) : null}

        <MasterSidebar currentView={view} selectedClientId={selectedClientId} />

        {view === "orders" ? (
        <section className="grid gap-4">
          <div className="flex flex-col gap-4">
            <Panel title="受注一覧" action={<OrderStatusLegend />}>
              <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
                <Field>
                  <FieldLabel>検索</FieldLabel>
                  <SearchInput
                    value={orderSearch}
                    placeholder="発注番号・PDFファイル名・届け先"
                    onChange={setOrderSearch}
                  />
                </Field>
                <Field>
                  <FieldLabel>期間</FieldLabel>
                  <Select
                    items={[
                      { label: "すべて", value: "all" },
                      { label: "今月", value: "thisMonth" },
                      { label: "先月", value: "lastMonth" },
                      { label: "期間指定", value: "custom" },
                    ]}
                    value={orderPeriodFilter}
                    onValueChange={(value) =>
                      setOrderPeriodFilter((value ?? "all") as OrderPeriodFilter)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">すべて</SelectItem>
                        <SelectItem value="thisMonth">今月</SelectItem>
                        <SelectItem value="lastMonth">先月</SelectItem>
                        <SelectItem value="custom">期間指定</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>ステータス</FieldLabel>
                  <Select
                    items={[
                      { label: "すべて", value: "all" },
                      { label: "取込済み", value: "imported" },
                      { label: "チェック済み", value: "confirmed" },
                      { label: "発送済み", value: "shipped" },
                    ]}
                    value={orderStatusFilter}
                    onValueChange={(value) => setOrderStatusFilter(value ?? "all")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">すべて</SelectItem>
                        <SelectItem value="imported">取込済み</SelectItem>
                        <SelectItem value="confirmed">チェック済み</SelectItem>
                        <SelectItem value="shipped">発送済み</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {orderPeriodFilter === "custom" ? (
                <div className="grid gap-3 md:grid-cols-[180px_180px]">
                  <Field>
                    <FieldLabel>開始日</FieldLabel>
                    <Input
                      type="date"
                      value={orderPeriodStart}
                      onChange={(event) => setOrderPeriodStart(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>終了日</FieldLabel>
                    <Input
                      type="date"
                      value={orderPeriodEnd}
                      onChange={(event) => setOrderPeriodEnd(event.target.value)}
                    />
                  </Field>
                </div>
              ) : null}

              {selectedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  まだ受注がありません。`samples/sample-order.csv` を取り込むと動きを確認できます。
                </p>
              ) : filteredOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  条件に一致する受注はありません。
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      products={products}
                      isSaving={savingOrderId === order.id}
                      hasExportedCsv={csvExportedOrderIds.includes(order.id)}
                      onConfirm={() => updateOrderStatus(order.id, "confirm")}
                      onUndo={() => updateOrderStatus(order.id, "undo")}
                      onShip={() => updateOrderStatus(order.id, "ship")}
                      onDelete={() => deleteOrder(order.id)}
                      onExportCooola={() => exportCooolaCsv(order.id)}
                      onUpdateArrivalDueDate={(arrivalDueDate) =>
                        updateOrderArrivalDueDate(order.id, arrivalDueDate)
                      }
                    />
                  ))}
                </div>
              )}
            </Panel>

          </div>
        </section>
        ) : null}

        {view === "clients" ? (
          <section className="grid gap-4 xl:grid-cols-[minmax(360px,460px)_1fr]">
            <Panel title="クライアント登録" titleSize="lg">
              <form className="grid gap-3" onSubmit={registerClient}>
                <Field>
                  <FieldLabel>新規クライアント</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      value={clientName}
                      placeholder="クライアント名"
                      disabled={isSavingClient}
                      onChange={(event) => setClientName(event.target.value)}
                    />
                    <Button type="submit" disabled={isSavingClient}>
                      {isSavingClient ? "追加中..." : "追加"}
                    </Button>
                  </div>
                </Field>
                {clientNotice ? (
                  <p className="text-sm text-muted-foreground">{clientNotice}</p>
                ) : null}
              </form>
            </Panel>

            <Panel
              title="クライアント一覧"
              titleSize="lg"
              action={
                isEditingClientMaster ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingClient}
                      onClick={saveClientMasterDrafts}
                    >
                      {isSavingClient ? "保存中..." : "保存"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSavingClient}
                      onClick={cancelClientMasterEdit}
                    >
                      キャンセル
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={clients.length === 0}
                    onClick={startClientMasterEdit}
                  >
                    編集
                  </Button>
                )
              }
            >
              {isEditingClientMaster ? (
                <p className="text-sm text-muted-foreground">
                  クライアント名とFBP手数料率をまとめて編集できます。8%の場合は 8 と入力してください。
                </p>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>クライアント名</TableHead>
                    <TableHead>FBP手数料率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isEditingClientMaster
                    ? clientMasterDrafts.map((draft, index) => (
                        <TableRow key={draft.id}>
                          <TableCell>
                            <Input
                              value={draft.name}
                              onChange={(event) =>
                                updateClientMasterDraft(index, { name: event.target.value })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={draft.fbpFeeRate}
                              className="w-[120px]"
                              placeholder="8"
                              onChange={(event) =>
                                updateClientMasterDraft(index, { fbpFeeRate: event.target.value })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    : clients.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell>{client.name}</TableCell>
                          <TableCell>{formatNullableRate(client.fbpFeeRate)}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </Panel>
          </section>
        ) : null}

        {view === "products" ? (
        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Panel
            title={missingJans.length > 0 ? "未登録JANの商品登録" : "商品マスタ登録/更新"}
            titleSize="lg"
          >
            <p className="text-sm text-muted-foreground">
              {missingJans.length > 0
                ? "未登録JANがあるため、注文はまだ保存していません。商品を登録すると自動で再チェックします。"
                : "新規商品を登録できます。登録済み商品は商品マスタ右上の編集ボタンからまとめて更新できます。"}
            </p>
            <Field>
              <FieldLabel>登録先クライアント</FieldLabel>
              <Select
                items={clients.map((client) => ({
                  label: client.name,
                  value: client.id,
                }))}
                value={productRegistrationClientId}
                onValueChange={(value) => setProductRegistrationClientId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                手入力登録とExcelアップロードは、このクライアントの商品マスタとして保存します。
              </p>
            </Field>
            {missingJans.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {missingJans.map((jan) => (
                  <Button
                    variant="outline"
                    size="sm"
                    key={jan}
                    type="button"
                    onClick={() => setProductForm({ ...emptyProductForm, jan })}
                  >
                    {jan}
                  </Button>
                ))}
              </div>
            ) : null}
            <FileUploadButton
              key={`product-master-${productMasterFileInputKey}`}
              accept=".xlsx,.xls"
              disabled={isSavingProduct || isImportingProductMaster}
              label={isImportingProductMaster ? "商品マスタExcelを取込中..." : "商品マスタExcelをアップロード"}
              description="商品マスタテンプレートの列名を読み取り、表示中クライアントの商品マスタへ登録します。"
              onFileChange={handleProductMasterExcelChange}
            />
            <ProductRegistrationForm
              form={productForm}
              clientId={productRegistrationClientId}
              isSaving={isSavingProduct}
              notice={productNotice}
              onChange={setProductForm}
              onImageNotice={setProductNotice}
              onSubmit={registerProduct}
            />
          </Panel>

          <Panel
            title="商品マスタ"
            titleSize="lg"
            action={
              isEditingProductMaster ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSavingProduct}
                    onClick={saveProductMasterDrafts}
                  >
                    {isSavingProduct ? "保存中..." : "保存"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSavingProduct}
                    onClick={cancelProductMasterEdit}
                  >
                    キャンセル
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={productPaginationTotalItems === 0 || isLoadingProductPage}
                    onClick={openProductMasterExportPanel}
                  >
                    Excel出力
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={products.length === 0 || isLoadingProductPage}
                    onClick={startProductMasterEdit}
                  >
                    編集
                  </Button>
                </div>
              )
            }
          >
            {productNotice ? <p className="text-sm text-muted-foreground">{productNotice}</p> : null}
            {view === "products" ? (
              <p className="text-sm text-muted-foreground">
                {isLoadingProductPage
                  ? "商品マスタを読み込んでいます..."
                  : `${productPaginationTotalItems.toLocaleString()}件中 ${products.length.toLocaleString()}件を表示しています。`}
              </p>
            ) : null}
            {isEditingProductMaster ? (
              <p className="text-sm text-muted-foreground">
                受注明細で使用されている商品は、過去の受注データを守るため削除できません。商品名・下代（税抜）・税率などの編集はできます。
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
              <Field>
                <FieldLabel>クライアント</FieldLabel>
                <Select
                  items={[
                    { label: "すべて", value: "all" },
                    ...clients.map((client) => ({
                      label: client.name,
                      value: client.id,
                    })),
                  ]}
                  value={productClientFilter}
                  onValueChange={(value) => {
                    setProductClientFilter(value ?? "all");
                    setProductPage(0);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">すべて</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>検索</FieldLabel>
                <SearchInput
                  value={productSearch}
                  placeholder="JANコード・商品名"
                  onChange={(value) => {
                    setProductSearch(value);
                    setProductPage(0);
                  }}
                />
              </Field>
            </div>
            {isProductExportPanelOpen ? (
              <div className="grid gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">Excel出力する商品を選択</h3>
                  <p className="text-xs text-muted-foreground">
                    クライアント名と商品名で絞り込み、チェックした商品だけをアップロード用フォーマットで出力します。
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
                  <Field>
                    <FieldLabel>クライアント</FieldLabel>
                    <Select
                      items={[
                        { label: "すべて", value: "all" },
                        ...clients.map((client) => ({
                          label: client.name,
                          value: client.id,
                        })),
                      ]}
                      value={productExportClientFilter}
                      onValueChange={(value) => setProductExportClientFilter(value ?? "all")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">すべて</SelectItem>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>商品名・JAN検索</FieldLabel>
                    <SearchInput
                      value={productExportSearch}
                      placeholder="商品名・JANコード"
                      onChange={setProductExportSearch}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    候補 {exportCandidateProducts.length}件 / 選択 {selectedProductExportProducts.length}件
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={exportCandidateProducts.length === 0}
                      onClick={selectAllProductExportCandidates}
                    >
                      候補をすべて選択
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedProductExportProducts.length === 0}
                      onClick={clearProductExportSelection}
                    >
                      選択解除
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={selectedProductExportProducts.length === 0}
                      onClick={exportProductMasterExcel}
                    >
                      選択商品をExcel出力
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIsProductExportPanelOpen(false)}
                    >
                      閉じる
                    </Button>
                  </div>
                </div>
                <div className="max-h-[320px] overflow-auto rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[56px]">選択</TableHead>
                        <TableHead>クライアント</TableHead>
                        <TableHead>商品名</TableHead>
                        <TableHead>JANコード</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exportCandidateProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground">
                            条件に合う商品がありません。
                          </TableCell>
                        </TableRow>
                      ) : (
                        exportCandidateProducts.map((product) => {
                          const productKey = buildProductKey(product.clientId, product.jan);

                          return (
                            <TableRow key={productKey}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={selectedProductExportKeySet.has(productKey)}
                                  onChange={(event) =>
                                    toggleProductExportSelection(product, event.target.checked)
                                  }
                                  aria-label={`${product.name} をExcel出力対象にする`}
                                />
                              </TableCell>
                              <TableCell>{getClientName(product.clientId, clients)}</TableCell>
                              <TableCell>{product.name}</TableCell>
                              <TableCell className="font-mono text-xs">{product.jan}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
            <Table className="min-w-[3600px]">
                <TableHeader>
                  <TableRow>
                    {productMasterDisplayFields.map((field) => (
                      <TableHead
                        key={String(field.key)}
                        className={field.key === "productImagePath" ? "w-[140px]" : "min-w-[150px]"}
                      >
                        {field.label}
                      </TableHead>
                    ))}
                    {isEditingProductMaster ? <TableHead className="w-[240px]">削除</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingProductPage ? (
                    <TableRow>
                      <TableCell
                        colSpan={productMasterDisplayFields.length + (isEditingProductMaster ? 1 : 0)}
                        className="text-muted-foreground"
                      >
                        商品マスタを読み込んでいます...
                      </TableCell>
                    </TableRow>
                  ) : isEditingProductMaster
                    ? productMasterDrafts.map((draft, index) => (
                        <TableRow key={buildProductKey(draft.originalClientId, draft.originalJan)}>
                          {productMasterDisplayFields.map((field) => (
                            <ProductMasterTableCell
                              key={String(field.key)}
                              field={field}
                              value={
                                field.key === "productImagePath"
                                  ? draft.productImagePath
                                  : draft[field.key]
                              }
                              imageUrl={draft.productImageUrl}
                              clientId={draft.originalClientId}
                              jan={draft.jan || draft.originalJan}
                              isEditing
                              onChange={(value) =>
                                updateProductMasterDraft(index, {
                                  [field.key]: value,
                                } as Partial<ProductMasterDraft>)
                              }
                              onImageChange={(path, url) =>
                                updateProductMasterDraft(index, {
                                  productImagePath: path,
                                  productImageUrl: url,
                                })
                              }
                              onImageNotice={setProductNotice}
                            />
                          ))}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon-sm"
                                disabled={
                                  isSavingProduct ||
                                  usedProductKeys.has(buildProductKey(draft.originalClientId, draft.originalJan))
                                }
                                onClick={() => removeProductFromMaster(draft.originalClientId, draft.originalJan)}
                                aria-label={`${draft.originalJan} を削除`}
                                title={
                                  usedProductKeys.has(buildProductKey(draft.originalClientId, draft.originalJan))
                                    ? "受注明細で使用中のため削除できません"
                                    : "削除"
                                }
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              {usedProductKeys.has(buildProductKey(draft.originalClientId, draft.originalJan)) ? (
                                <span className="whitespace-nowrap text-xs text-muted-foreground">
                                  受注で使用中のため削除できません
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    : pagedProducts.map((product) => (
                        <TableRow key={buildProductKey(product.clientId, product.jan)}>
                          {productMasterDisplayFields.map((field) => (
                            <ProductMasterTableCell
                              key={String(field.key)}
                              field={field}
                              value={
                                field.key === "productImagePath"
                                  ? product.productImagePath ?? ""
                                  : getProductMasterDisplayValue(product, field.key)
                              }
                              imageUrl={product.productImageUrl}
                              clientId={product.clientId}
                              jan={product.jan}
                            />
                          ))}
                        </TableRow>
                      ))}
                </TableBody>
            </Table>
            </div>
            <MasterPagination
              totalItems={productPaginationTotalItems}
              page={normalizedProductPage}
              onPageChange={setProductPage}
            />
          </Panel>
        </section>
        ) : null}

        {view === "payouts" ? (
          <section className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-4">
              <SummaryCard
                label="下代金額"
                value={`${payoutWholesaleTotal.toLocaleString()}円`}
                description="下代単価 × 数量（下代単価は円単位）"
              />
              <SummaryCard
                label="月次振り込み"
                value={`${payoutTotal.toLocaleString()}円`}
                description="下代金額 - FBP手数料"
              />
              <SummaryCard
                label="FBP手数料"
                value={`${payoutFbpFeeTotal.toLocaleString()}円`}
                description="上代 × 数量 × FBP手数料率（合計後に四捨五入）"
              />
              <SummaryCard
                label="対象明細"
                value={`${payoutLines.length}件`}
                description="対象月の発送済み明細数"
              />
            </div>

            <Panel
              title="注文詳細"
              titleSize="lg"
              action={
                <div className="grid gap-3 md:grid-cols-[240px_180px]">
                  <ClientSelectField
                    clients={clients}
                    selectedClientId={selectedClientId}
                    onClientChange={handleClientChange}
                  />
                  <Field>
                    <FieldLabel>対象月</FieldLabel>
                    <Input
                      type="month"
                      value={payoutMonth}
                      className="w-full"
                      onChange={(event) => setPayoutMonth(event.target.value)}
                    />
                  </Field>
                </div>
              }
            >
              <p className="text-sm text-muted-foreground">
                選択中クライアントの発送済み受注を、到着指定日の月で集計します。月次振り込みは
                下代金額 - FBP手数料 で算出します。下代金額は円単位の下代単価 × 数量、FBP手数料は
                上代（税抜） × 数量 × FBP手数料率を合計後に四捨五入します。
                現在のFBP手数料率は {formatNullableRate(selectedClient?.fbpFeeRate ?? null)} です。
              </p>
              {payoutIssueCount > 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  上代（税抜）・掛け率が商品マスタにも未設定の明細があります。商品マスタを確認してください。
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <Table className="min-w-[1120px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>到着指定日</TableHead>
                      <TableHead>発注番号</TableHead>
                      <TableHead>JAN</TableHead>
                      <TableHead>商品名</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>上代（税抜）</TableHead>
                      <TableHead>掛け率</TableHead>
                      <TableHead>振込額</TableHead>
                      <TableHead>状態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payoutLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-muted-foreground">
                          対象月の発送済み受注はありません。
                        </TableCell>
                      </TableRow>
                    ) : (
                      payoutLines.map((row) => (
                        <TableRow key={`${row.order.id}-${row.line.id}`}>
                          <TableCell>{row.order.arrivalDueDate || "-"}</TableCell>
                          <TableCell>{row.order.orderNo}</TableCell>
                          <TableCell className="font-mono text-xs">{row.line.jan}</TableCell>
                          <TableCell>{row.product?.name ?? "未登録"}</TableCell>
                          <TableCell>{row.line.qty}</TableCell>
                          <TableCell>{formatNullableCurrency(row.retailPrice)}</TableCell>
                          <TableCell>{formatNullableRate(row.payoutRate)}</TableCell>
                          <TableCell>
                            {row.payoutAmount === null
                              ? "未計算"
                              : `${row.payoutAmount.toLocaleString()}円`}
                          </TableCell>
                          <TableCell>
                            {row.payoutAmount === null ? (
                              <Badge variant="secondary" className="border border-amber-200 bg-amber-100 text-amber-900">
                                要対応
                              </Badge>
                            ) : (
                              <Badge variant="secondary">計算済み</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </section>
        ) : null}

        {view === "sellIn" ? (
          <section className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-5">
              <SummaryCard label="発注件数" value={`${sellInOrderCount.toLocaleString()}件`} />
              <SummaryCard label="数量合計" value={`${sellInTotals.qty.toLocaleString()}点`} />
              <SummaryCard
                label="下代"
                value={formatNullableCurrency(sellInTotals.wholesaleAmount)}
              />
              <SummaryCard
                label="上代"
                value={formatNullableCurrency(sellInTotals.retailAmount)}
              />
              <SummaryCard label="要対応" value={`${sellInTotals.issueCount}件`} />
            </div>

            <Panel
              title="セルインデータ"
              titleSize="lg"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={exportSellInCsv}>
                    CSV出力
                  </Button>
                  <Button type="button" onClick={exportSellInExcel}>
                    Excel出力
                  </Button>
                </div>
              }
            >
              <p className="text-sm text-muted-foreground">
                受注を発注日ベースで、日付・JAN・商品ごとに集計します。
                店舗フィルターで店舗を選んだ場合だけ、その店舗に絞って表示します。
                発注がない日は、期間内に一度でも出た商品を0件として表示します。
              </p>
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_1.5fr]">
                <ClientSelectField
                  clients={clients}
                  selectedClientId={selectedClientId}
                  onClientChange={handleClientChange}
                />
                <Field>
                  <FieldLabel>開始日</FieldLabel>
                  <Input
                    type="date"
                    value={sellInPeriodStart}
                    onChange={(event) => {
                      setSellInPeriodStart(event.target.value);
                      setSellInStoreFilter("all");
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>終了日</FieldLabel>
                  <Input
                    type="date"
                    value={sellInPeriodEnd}
                    onChange={(event) => {
                      setSellInPeriodEnd(event.target.value);
                      setSellInStoreFilter("all");
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>店舗</FieldLabel>
                  <select
                    key={`${sellInPeriodStart}:${sellInPeriodEnd}:${sellInSearch}:${sellInStores.join("|")}`}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={sellInStoreFilter}
                    onChange={(event) => setSellInStoreFilter(event.target.value)}
                  >
                    <option value="all">すべて</option>
                    {sellInStores.map((store) => (
                      <option key={store} value={store}>
                        {store}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel>JAN / 商品名</FieldLabel>
                  <Input
                    value={sellInSearch}
                    placeholder="JAN・商品名で検索"
                    onChange={(event) => setSellInSearch(event.target.value)}
                  />
                </Field>
              </div>
              <SellInCharts
                dailyRows={sellInDailyChartRows}
                productRows={sellInProductChartRows}
              />
              {sellInTotals.issueCount > 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  店舗不明、商品未登録、または価格未設定の行があります。備考欄と商品マスタを確認してください。
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>日付</TableHead>
                      <TableHead>店舗</TableHead>
                      <TableHead>JAN</TableHead>
                      <TableHead>商品名</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>下代</TableHead>
                      <TableHead>上代</TableHead>
                      <TableHead>状態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellInRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">
                          対象期間のセルインデータはありません。
                        </TableCell>
                      </TableRow>
                    ) : (
                      sellInRows.map((row) => (
                        <TableRow key={`${row.date}-${row.storeName}-${row.jan}`}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.storeName}</TableCell>
                          <TableCell className="font-mono text-xs">{row.jan}</TableCell>
                          <TableCell>{row.productName}</TableCell>
                          <TableCell>{row.qty.toLocaleString()}</TableCell>
                          <TableCell>{formatNullableCurrency(row.wholesaleAmount)}</TableCell>
                          <TableCell>{formatNullableCurrency(row.retailAmount)}</TableCell>
                          <TableCell>
                            {row.hasIssue ? (
                              <Badge variant="secondary" className="border border-amber-200 bg-amber-100 text-amber-900">
                                要対応
                              </Badge>
                            ) : (
                              <Badge variant="secondary">計算済み</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </section>
        ) : null}

        {view === "stores" ? (
          <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Panel title="店舗マスタ登録" titleSize="lg">
              <form className="grid gap-4" onSubmit={registerStore}>
                <TextInput
                  label="店舗名"
                  value={storeForm.name}
                  required
                  onChange={(name) => setStoreForm({ ...storeForm, name })}
                />
                <TextInput
                  label="別名・OCR候補"
                  value={storeForm.aliases}
                  description="発注書の備考欄に出る表記ゆれを、改行またはカンマ区切りで入力します。"
                  onChange={(aliases) => setStoreForm({ ...storeForm, aliases })}
                />
                {storeNotice ? <p className="text-sm text-muted-foreground">{storeNotice}</p> : null}
                <Button type="submit" disabled={isSavingStore}>
                  {isSavingStore ? "登録中..." : "店舗を登録"}
                </Button>
              </form>
            </Panel>

            <Panel
              title="店舗マスタ"
              titleSize="lg"
              action={
                isEditingStoreMaster ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingStore}
                      onClick={saveStoreMasterDrafts}
                    >
                      {isSavingStore ? "保存中..." : "保存"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSavingStore}
                      onClick={cancelStoreMasterEdit}
                    >
                      キャンセル
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={stores.length === 0}
                    onClick={startStoreMasterEdit}
                  >
                    編集
                  </Button>
                )
              }
            >
              {isEditingStoreMaster ? (
                <p className="text-sm text-muted-foreground">
                  正式店舗名と、備考欄/OCRで拾った別名候補をまとめて編集できます。
                </p>
              ) : null}
              {stores.length === 0 ? (
                <p className="text-sm text-muted-foreground">店舗マスタはまだありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">店舗名</TableHead>
                        <TableHead>別名・OCR候補</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isEditingStoreMaster
                        ? storeMasterDrafts.map((draft, index) => (
                            <TableRow key={draft.id}>
                              <TableCell>
                                <Input
                                  value={draft.name}
                                  onChange={(event) =>
                                    updateStoreMasterDraft(index, { name: event.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={draft.aliases}
                                  onChange={(event) =>
                                    updateStoreMasterDraft(index, { aliases: event.target.value })
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))
                        : stores.map((store) => (
                            <TableRow key={store.id}>
                              <TableCell>{store.name}</TableCell>
                              <TableCell>{store.aliases.join(" / ") || "-"}</TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>
          </section>
        ) : null}

        {view === "deliveryDestinations" ? (
        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Panel title="配送先マスタ登録" titleSize="lg">
            <FileUploadButton
              key={deliveryDestinationFileInputKey}
              label="配送先一覧をアップロード"
              description="問屋からもらったExcel、CSVファイルを一括登録できます。"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isSavingDeliveryDestination}
              fullWidth
              onFileChange={importDeliveryDestinationsFromFile}
            />
            <DeliveryDestinationRegistrationForm
              form={deliveryDestinationForm}
              isSaving={isSavingDeliveryDestination}
              notice={deliveryDestinationNotice}
              wholesalerOptions={selectedWholesalerOptions}
              onChange={setDeliveryDestinationForm}
              onAddWholesaler={addWholesalerOption}
              onSubmit={registerDeliveryDestination}
            />
          </Panel>

          <Panel
            title="配送先マスタ"
            titleSize="lg"
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Select
                  items={[
                    { label: "すべて", value: "all" },
                    ...selectedWholesalerOptions.map((name) => ({ label: name, value: name })),
                  ]}
                  value={deliveryWholesalerFilter}
                  onValueChange={(value) => {
                    setDeliveryWholesalerFilter(value ?? "all");
                    setDeliveryDestinationPage(0);
                  }}
                >
                  <SelectTrigger className="w-24">
                    <ListFilter className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">問屋名で絞り込み</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">すべて</SelectItem>
                      {selectedWholesalerOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {isEditingDeliveryDestinationMaster ? (
                  <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSavingDeliveryDestination}
                    onClick={saveDeliveryDestinationMasterDrafts}
                  >
                    {isSavingDeliveryDestination ? "保存中..." : "保存"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSavingDeliveryDestination}
                    onClick={cancelDeliveryDestinationMasterEdit}
                  >
                    キャンセル
                  </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedDeliveryDestinations.length === 0}
                    onClick={startDeliveryDestinationMasterEdit}
                  >
                    編集
                  </Button>
                )}
              </div>
            }
          >
            <div className="flex flex-col gap-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>コード</TableHead>
                    <TableHead>問屋名</TableHead>
                    <TableHead>配送先名</TableHead>
                    <TableHead>住所</TableHead>
                    <TableHead>TEL</TableHead>
                    <TableHead>別名/OCR候補</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isEditingDeliveryDestinationMaster
                    ? deliveryDestinationMasterDrafts
                    : pagedDeliveryDestinations
                  ).map((destination, index) => (
                    <TableRow
                      key={getDeliveryDestinationRowKey(destination)}
                    >
                      <TableCell className="font-mono text-xs">{destination.code}</TableCell>
                      <TableCell>
                        {isEditingDeliveryDestinationMaster ? (
                          <WholesalerSelect
                            value={getDeliveryDestinationWholesalerValue(destination)}
                            options={selectedWholesalerOptions}
                            onChange={(wholesalerName) =>
                              updateDeliveryDestinationMasterDraft(index, { wholesalerName })
                            }
                          />
                        ) : (
                          getDeliveryDestinationWholesalerValue(destination) || "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditingDeliveryDestinationMaster ? (
                          <Input
                            value={destination.name}
                            onChange={(event) =>
                              updateDeliveryDestinationMasterDraft(index, {
                                name: event.target.value,
                              })
                            }
                          />
                        ) : (
                          destination.name
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditingDeliveryDestinationMaster ? (
                          <div className="grid gap-2">
                            <Input
                              value={destination.postalCode}
                              placeholder="郵便番号"
                              onChange={(event) =>
                                updateDeliveryDestinationMasterDraft(index, {
                                  postalCode: event.target.value,
                                })
                              }
                            />
                            <Input
                              value={destination.address1}
                              placeholder="住所1"
                              onChange={(event) =>
                                updateDeliveryDestinationMasterDraft(index, {
                                  address1: event.target.value,
                                })
                              }
                            />
                            <Input
                              value={destination.address2}
                              placeholder="住所2"
                              onChange={(event) =>
                                updateDeliveryDestinationMasterDraft(index, {
                                  address2: event.target.value,
                                })
                              }
                            />
                            <Input
                              value={destination.address3}
                              placeholder="住所3"
                              onChange={(event) =>
                                updateDeliveryDestinationMasterDraft(index, {
                                  address3: event.target.value,
                                })
                              }
                            />
                          </div>
                        ) : (
                          [destination.postalCode, destination.address1].filter(Boolean).join(" ")
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditingDeliveryDestinationMaster ? (
                          <Input
                            value={destination.tel}
                            onChange={(event) =>
                              updateDeliveryDestinationMasterDraft(index, {
                                tel: event.target.value,
                              })
                            }
                          />
                        ) : (
                          destination.tel
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditingDeliveryDestinationMaster ? (
                          <Input
                            value={getDeliveryDestinationAliasesValue(destination)}
                            placeholder="別名・OCR候補"
                            onChange={(event) =>
                              updateDeliveryDestinationMasterDraft(index, {
                                aliases: event.target.value,
                              })
                            }
                          />
                        ) : (
                          getDeliveryDestinationAliasesValue(destination)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <MasterPagination
                totalItems={filteredDeliveryDestinations.length}
                page={normalizedDeliveryDestinationPage}
                onPageChange={setDeliveryDestinationPage}
              />
            </div>
          </Panel>
        </section>
        ) : null}

        {view === "orderFiles" ? (
        <section className="grid gap-4">
          <Panel
            title="受注データ"
            action={
              <Field>
                <FieldLabel>受注番号検索</FieldLabel>
                <Input
                  value={orderFileSearch}
                  className="w-[260px]"
                  placeholder="受注番号・ファイル名を入力"
                  onChange={(event) => setOrderFileSearch(event.target.value)}
                />
              </Field>
            }
          >
            {selectedImportBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                このクライアントのアップロード済み発注書はまだありません。
              </p>
            ) : filteredOrderFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                受注番号・ファイル名に一致する発注書はありません。
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>受注番号</TableHead>
                    <TableHead>元ファイル</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>取込日時</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrderFiles.map((batch) => {
                    const relatedOrders = getOrdersForImportBatch(batch, selectedOrders);

                    return (
                    <TableRow key={batch.id}>
                      <TableCell>
                        {relatedOrders.length > 0
                          ? relatedOrders.map((order) => order.orderNo).join("、")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {batch.fileName || "-"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell>
                        {new Date(batch.importedAt).toLocaleString("ja-JP")}
                      </TableCell>
                      <TableCell>
                        {batch.fileUrl || batch.fileStoragePath ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openOrderFile(batch.fileStoragePath, batch.fileUrl)}
                            >
                              表示
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                downloadOrderFile(batch.fileStoragePath, batch.fileUrl, batch.fileName)
                              }
                            >
                              ダウンロード
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">ファイルなし</span>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </section>
        ) : null}

        {view === "history" ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <Panel title="取込履歴">
            {selectedImportBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">取込履歴はまだありません。</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedImportBatches.map((batch) => (
                  <Card size="sm" key={batch.id}>
                    <CardContent>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {batch.fileUrl ? (
                            <a
                              href={batch.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {batch.fileName}
                            </a>
                          ) : (
                            <span className="font-medium">{batch.fileName}</span>
                          )}
                          <StatusBadge status={batch.status} />
                        </div>
                        <p className="text-muted-foreground">
                          {new Date(batch.importedAt).toLocaleString("ja-JP")} / エラー{" "}
                          {batch.errors.length}件
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="チェック履歴">
            {checkedHistoryOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">チェック履歴はまだありません。</p>
            ) : (
              <div className="flex flex-col gap-2">
                {checkedHistoryOrders.map((order) => (
                  <Card size="sm" key={`checked-${order.id}`}>
                    <CardContent>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">発注番号 {order.orderNo}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-muted-foreground">
                          {new Date(order.importedAt).toLocaleString("ja-JP")}
                          {order.sourceFile ? ` / ${order.sourceFile}` : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="送信履歴">
            {sentHistoryOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">送信履歴はまだありません。</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sentHistoryOrders.map((order) => (
                  <Card size="sm" key={`sent-${order.id}`}>
                    <CardContent>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">発注番号 {order.orderNo}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-muted-foreground">
                          {new Date(order.importedAt).toLocaleString("ja-JP")}
                          {order.sourceFile ? ` / ${order.sourceFile}` : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </Panel>
        </section>
        ) : null}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {description ? (
          <CardDescription className="text-xs">{description}</CardDescription>
        ) : null}
      </CardHeader>
    </Card>
  );
}

function SellInCharts({
  dailyRows,
  productRows,
}: {
  dailyRows: SellInChartRow[];
  productRows: SellInChartRow[];
}) {
  const maxDailyWholesaleAmount = Math.max(
    ...dailyRows.map((row) => row.wholesaleAmount ?? 0),
    1,
  );
  const dailyWholesaleScaleMax = getNiceChartMax(maxDailyWholesaleAmount);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">日別下代売上推移</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">表示できるデータがありません。</p>
          ) : (
            <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
              <div className="flex min-h-52 flex-col justify-between pb-6 text-right text-[10px] text-muted-foreground">
                <span>{formatChartAmount(dailyWholesaleScaleMax)}</span>
                <span>{formatChartAmount(Math.floor(dailyWholesaleScaleMax / 2))}</span>
                <span>0</span>
              </div>
              <div className="relative">
                <div className="overflow-x-auto pb-8">
                  <div className="relative flex min-h-64 min-w-[1040px] items-end gap-2 border-b pb-8 pt-8">
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
                    {dailyRows.map((row) => {
                      const wholesaleAmount = row.wholesaleAmount ?? 0;
                      const height = wholesaleAmount > 0
                        ? Math.max((wholesaleAmount / dailyWholesaleScaleMax) * 144, 48)
                        : 0;

                      return (
                        <div key={row.label} className="flex min-w-[30px] flex-1 flex-col items-center gap-1 text-xs">
                          <div
                            className={`group relative w-full min-w-[24px] rounded-t ${
                              wholesaleAmount > 0 ? "bg-blue-600 shadow-sm" : "bg-transparent"
                            }`}
                            style={{ height: `${height}px` }}
                          >
                            {wholesaleAmount > 0 ? (
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border bg-popover px-2 py-1 text-[13px] font-normal text-popover-foreground shadow-md group-hover:block">
                                {formatNullableCurrency(row.wholesaleAmount)}
                              </div>
                            ) : null}
                          </div>
                          <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                            {formatChartDateLabel(row.label)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="pointer-events-none absolute right-3 bottom-3 flex justify-end">
                  <span className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
                    スクロールできます →
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品別発注数量ランキング</CardTitle>
        </CardHeader>
        <CardContent>
          {productRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">表示できるデータがありません。</p>
          ) : (
            <div className="flex flex-col gap-3">
              {productRows.map((row) => {
                const maxQty = Math.max(...productRows.map((candidate) => candidate.qty), 1);
                const width = Math.max((row.qty / maxQty) * 100, row.qty > 0 ? 6 : 1);

                return (
                  <div key={row.label} className="grid gap-1.5">
                    <div className="truncate text-xs font-medium text-foreground">{row.label}</div>
                    <div className="relative h-[18px] overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-700" style={{ width: `${width}%` }} />
                      <div className="absolute inset-y-0 left-0 flex items-center rounded-full bg-emerald-900 px-3 text-xs font-bold text-white">
                        <span className="shrink-0">
                          {row.qty.toLocaleString()}点 / 下代 {formatNullableCurrency(row.wholesaleAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderStatusLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
      <LegendItem className="bg-red-50 ring-red-200" label="赤色: チェック必要" />
      <LegendItem className="bg-yellow-100 ring-yellow-300" label="黄色: 発送が必要" />
      <LegendItem className="bg-slate-100 ring-slate-200" label="グレー: 発送済み" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-3 w-3 rounded-full ring-1 ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function getWorkbenchPageTitle(view: WorkbenchView) {
  if (view === "clients") {
    return "クライアントマスタ";
  }

  if (view === "products") {
    return "商品マスタ";
  }

  if (view === "deliveryDestinations") {
    return "配送先マスタ";
  }

  if (view === "stores") {
    return "店舗マスタ";
  }

  if (view === "orderFiles") {
    return "受注DB";
  }

  if (view === "payouts") {
    return "振り込み管理";
  }

  if (view === "sellIn") {
    return "セルインデータ";
  }

  if (view === "history") {
    return "履歴";
  }

  return "受注管理システム";
}

function getWorkbenchPageDescription(view: WorkbenchView) {
  if (view === "clients") {
    return "クライアント名とFBP手数料率を管理します。";
  }

  if (view === "products") {
    return "新規商品がある場合必ず、商品マスタに登録するようにしてください。";
  }

  if (view === "deliveryDestinations") {
    return "新規配送先がある場合必ず、配送先マスタに登録するようにしてください。";
  }

  if (view === "stores") {
    return "セルイン集計に使う店舗名と、発注書備考欄の表記ゆれを管理します。";
  }

  if (view === "orderFiles") {
    return "受注データを見ることができます。";
  }

  if (view === "payouts") {
    return "発送済み受注の明細と、クライアントへの振込金額を確認できます。";
  }

  if (view === "sellIn") {
    return "発送済み受注を発注日、店舗、商品ごとに集計し、セルインデータとして確認・出力できます。";
  }

  if (view === "history") {
    return "発注ファイルの取り込み結果とエラー履歴を確認します。";
  }

  return "発注ファイルの取り込み、CSVファイルの出力、発送、未発送の管理ができます。";
}

function MasterSidebar({
  currentView,
  selectedClientId,
}: {
  currentView: WorkbenchView;
  selectedClientId: string;
}) {
  const links = [
    { href: "/", label: "メイン画面", view: "orders" },
    { href: "/clients", label: "クライアントマスタ", view: "clients" },
    { href: "/products", label: "商品マスタ", view: "products" },
    { href: "/delivery-destinations", label: "配送先マスタ", view: "deliveryDestinations" },
    { href: "/stores", label: "店舗マスタ", view: "stores" },
    { href: "/order-files", label: "受注DB", view: "orderFiles" },
    { href: "/payouts", label: "振り込み管理", view: "payouts" },
    { href: "/sell-in", label: "セルイン", view: "sellIn" },
    { href: "/history", label: "履歴", view: "history" },
  ] satisfies { href: string; label: string; view: WorkbenchView }[];

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-32 border-r border-sidebar-border bg-sidebar px-3 py-5 text-sidebar-foreground">
      <nav className="flex flex-col gap-1 text-sm font-medium">
        {links.map((link) => {
          const isActive = currentView === link.view;

          return (
            <Link
              key={link.href}
              href={buildNavHref(link.href, selectedClientId)}
              className={`rounded-md px-2 py-2 transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function buildNavHref(href: string, selectedClientId: string) {
  return selectedClientId ? `${href}?clientId=${encodeURIComponent(selectedClientId)}` : href;
}

function ClientSelectField({
  clients,
  selectedClientId,
  onClientChange,
}: {
  clients: Client[];
  selectedClientId: string;
  onClientChange: (clientId: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>クライアント</FieldLabel>
      <Select
        items={clients.map((client) => ({
          label: client.name,
          value: client.id,
        }))}
        value={selectedClientId}
        onValueChange={(value) => onClientChange(value ?? "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function ClientSelectorBar({
  clients,
  selectedClientId,
  fileInputKey,
  isProcessingFile,
  isSavingImport,
  onClientChange,
  onFileChange,
}: {
  clients: Client[];
  selectedClientId: string;
  fileInputKey: number;
  isProcessingFile: boolean;
  isSavingImport: boolean;
  onClientChange: (clientId: string) => void;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <Card>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(280px,1fr)]">
          <Field>
            <FieldLabel>クライアント</FieldLabel>
            <Select
              items={clients.map((client) => ({
                label: client.name,
                value: client.id,
              }))}
              value={selectedClientId}
              onValueChange={(value) => onClientChange(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <FieldLabel>発注ファイル</FieldLabel>
            <FileUploadButton
              key={fileInputKey}
              accept=".csv,.xlsx,.xls,.pdf,application/pdf"
              disabled={isSavingImport}
              fullWidth
              onFileChange={onFileChange}
            />
            {isProcessingFile || isSavingImport ? (
              <UploadStatus
                isProcessing
                message={isProcessingFile ? "アップロード中" : "保存中"}
              />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadStatus({
  isProcessing,
  message,
}: {
  isProcessing: boolean;
  message: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {isProcessing ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      <span>{message}</span>
    </div>
  );
}

function MasterPagination({
  totalItems,
  page,
  onPageChange,
}: {
  totalItems: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / masterPageSize);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page <= 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
        aria-label="前のページ"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span>
        {page + 1} / {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        aria-label="次のページ"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function paginateItems<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / masterPageSize));
  const normalizedPage = Math.min(Math.max(0, page), totalPages - 1);

  return {
    page: normalizedPage,
    items: items.slice(
      normalizedPage * masterPageSize,
      (normalizedPage + 1) * masterPageSize,
    ),
  };
}

function getOrdersForImportBatch(batch: ImportBatch, orders: Order[]) {
  return orders.filter((order) => {
    if (batch.fileStoragePath && order.sourceFilePath) {
      return order.sourceFilePath === batch.fileStoragePath;
    }

    return Boolean(batch.fileName && order.sourceFile === batch.fileName);
  });
}

function Panel({
  title,
  titleSize = "default",
  action,
  children,
}: {
  title?: string;
  titleSize?: "default" | "lg";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleClassName =
    titleSize === "lg" ? "text-2xl leading-tight" : "text-xl leading-tight";

  return (
    <Card>
      {title || action ? (
        <CardHeader>
          {title ? (
            <CardTitle className={titleClassName}>
              {title}
            </CardTitle>
          ) : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function FileUploadButton({
  accept,
  disabled,
  fullWidth = false,
  label = "発注ファイルをアップロード",
  description = "PDF、CSV、Excelファイルを選択できます。",
  onFileChange,
}: {
  accept: string;
  disabled: boolean;
  fullWidth?: boolean;
  label?: string;
  description?: string;
  onFileChange: (file: File | null) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-bold text-white shadow-[0_3px_0_rgb(29,78,216),0_6px_10px_rgba(37,99,235,0.28)] transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_5px_0_rgb(29,78,216),0_10px_14px_rgba(37,99,235,0.32)] active:translate-y-1 active:shadow-[0_1px_0_rgb(29,78,216),0_3px_8px_rgba(37,99,235,0.22)] ${
          fullWidth ? "w-full" : ""
        } ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        {label}
      </button>
      <Input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      {description ? (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function ProductRegistrationForm({
  form,
  clientId,
  isSaving,
  notice,
  onChange,
  onImageNotice,
  onSubmit,
}: {
  form: ProductForm;
  clientId: string;
  isSaving: boolean;
  notice: string;
  onChange: (form: ProductForm) => void;
  onImageNotice?: (message: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  async function handleImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    if (!clientId) {
      onImageNotice?.("登録先クライアントを選択してから画像をアップロードしてください。");
      return;
    }

    const formData = new FormData();
    formData.set("clientId", clientId);
    if (form.jan.trim()) {
      formData.set("jan", form.jan.trim());
    }
    formData.set("file", file);

    const uploadResult = await uploadProductImage(formData);

    if (!uploadResult.ok) {
      onImageNotice?.(uploadResult.message);
      return;
    }

    onChange({
      ...form,
      productImagePath: uploadResult.path,
      productImageUrl: uploadResult.url ?? "",
    });
    onImageNotice?.(uploadResult.message);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="rounded-lg border bg-muted/20 p-4">
        <h3 className="mb-3 text-sm font-medium">商品画像</h3>
        <ProductImageField
          imageUrl={form.productImageUrl}
          disabled={isSaving || !clientId}
          onFileChange={handleImageUpload}
          onClear={() => onChange({ ...form, productImagePath: "", productImageUrl: "" })}
        />
      </section>
      {productFormSections.map((section) => (
        <section key={section.title} className="rounded-lg border bg-muted/20 p-4">
          <h3 className="mb-3 text-sm font-medium">{section.title}</h3>
          <div className="grid gap-3">
            {section.fields.map((field) => (
              <ProductFormFieldRow
                key={String(field.key)}
                field={field}
                value={form[field.key]}
                onChange={(value) => onChange({ ...form, [field.key]: value })}
              />
            ))}
          </div>
        </section>
      ))}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? "登録中..." : "商品を登録"}
      </Button>
    </form>
  );
}

function ProductFormFieldRow({
  field,
  value,
  onChange,
}: {
  field: ProductFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-md bg-background p-3">
      <FieldLabel>
        <span className="inline-flex items-center gap-2">
          {field.label}
          {field.required ? <RequiredMark /> : null}
        </span>
      </FieldLabel>
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {field.description || "説明なし"}
      </p>
      {field.input === "taxRate" ? (
        <TaxRateSelect value={value} onChange={onChange} />
      ) : field.input === "textarea" ? (
        <textarea
          value={value}
          required={field.required}
          rows={4}
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          value={value}
          required={field.required}
          className="min-w-0 max-w-full"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function ProductMasterTableCell({
  field,
  value,
  imageUrl = "",
  clientId = "",
  jan = "",
  isEditing = false,
  onChange,
  onImageChange,
  onImageNotice,
}: {
  field: ProductFormField;
  value: string;
  imageUrl?: string;
  clientId?: string;
  jan?: string;
  isEditing?: boolean;
  onChange?: (value: string) => void;
  onImageChange?: (path: string, url: string) => void;
  onImageNotice?: (message: string) => void;
}) {
  if (field.input === "image") {
    return (
      <TableCell className="min-w-[140px] align-middle">
        {isEditing ? (
          <ProductImageField
            imageUrl={imageUrl}
            compact
            disabled={!clientId}
            onFileChange={async (file) => {
              if (!file || !clientId) {
                return;
              }

              const formData = new FormData();
              formData.set("clientId", clientId);
              if (jan.trim()) {
                formData.set("jan", jan.trim());
              }
              formData.set("file", file);

              const uploadResult = await uploadProductImage(formData);

              if (!uploadResult.ok) {
                onImageNotice?.(uploadResult.message);
                return;
              }

              onImageChange?.(uploadResult.path, uploadResult.url ?? "");
              onImageNotice?.(uploadResult.message);
            }}
            onClear={() => onImageChange?.("", "")}
          />
        ) : (
          <ProductImagePreview imageUrl={imageUrl} />
        )}
      </TableCell>
    );
  }

  if (!isEditing) {
    return (
      <TableCell className="h-12 max-w-[220px] align-middle">
        <CopyableTableValue
          value={value}
          className={field.key === "jan" ? "font-mono text-xs" : ""}
        />
      </TableCell>
    );
  }

  if (field.input === "taxRate") {
    return (
      <TableCell>
        <TaxRateSelect
          value={value}
          triggerClassName="w-[96px]"
          onChange={(nextValue) => onChange?.(nextValue)}
        />
      </TableCell>
    );
  }

  if (field.input === "textarea") {
    return (
      <TableCell>
        <textarea
          value={value}
          rows={3}
          className="min-w-[240px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => onChange?.(event.target.value)}
        />
      </TableCell>
    );
  }

  return (
    <TableCell>
      <Input
        value={value}
        className={
          field.key === "name" || field.key === "formalProductName"
            ? "min-w-[240px]"
            : field.key === "jan"
              ? "w-[180px] font-mono text-xs"
              : "w-[150px]"
        }
        onChange={(event) => onChange?.(event.target.value)}
      />
    </TableCell>
  );
}

function ProductImagePreview({
  imageUrl,
  compact = false,
}: {
  imageUrl?: string;
  compact?: boolean;
}) {
  if (!imageUrl) {
    return <span className="text-xs text-muted-foreground">未登録</span>;
  }

  return (
    <img
      src={imageUrl}
      alt="商品画像"
      className={`rounded-md border object-cover ${compact ? "h-12 w-12" : "h-24 w-24"}`}
    />
  );
}

function ProductImageField({
  imageUrl,
  compact = false,
  disabled = false,
  onFileChange,
  onClear,
}: {
  imageUrl?: string;
  compact?: boolean;
  disabled?: boolean;
  onFileChange: (file: File | null) => void | Promise<void>;
  onClear: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <ProductImagePreview imageUrl={imageUrl} compact={compact} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          画像を選択
        </Button>
        {imageUrl ? (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onClear}>
            画像を削除
          </Button>
        ) : null}
      </div>
      <Input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          void onFileChange(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <p className="text-[11px] text-muted-foreground">JPEG、PNG、WebP、GIF形式に対応しています。</p>
    </div>
  );
}

function CopyableTableValue({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const displayValue = value || "未設定";
  const canCopy = Boolean(value);

  async function copyValue() {
    if (!canCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("コピーしてください", value);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className={`block min-w-0 flex-1 truncate ${className}`}
        title={displayValue}
      >
        {displayValue}
      </span>
      {canCopy ? (
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={copyValue}
          aria-label={`${displayValue} をコピー`}
          title="コピー"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}

function DeliveryDestinationRegistrationForm({
  form,
  isSaving,
  notice,
  wholesalerOptions,
  onChange,
  onAddWholesaler,
  onSubmit,
}: {
  form: DeliveryDestinationForm;
  isSaving: boolean;
  notice: string;
  wholesalerOptions: string[];
  onChange: (form: DeliveryDestinationForm) => void;
  onAddWholesaler: (name: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <TextInput
          label="配送先コード"
          value={form.code}
          required
          onChange={(code) => onChange({ ...form, code })}
        />
        <Field>
          <FieldLabel>
            <span className="inline-flex items-center gap-2">
              問屋名
              <RequiredMark />
            </span>
          </FieldLabel>
          <WholesalerSelect
            value={form.wholesalerName}
            options={wholesalerOptions}
            allowCreate
            onChange={(wholesalerName) => onChange({ ...form, wholesalerName })}
            onAdd={(wholesalerName) => {
              onAddWholesaler(wholesalerName);
              onChange({ ...form, wholesalerName });
            }}
          />
        </Field>
        <TextInput
          label="配送先名"
          value={form.name}
          required
          onChange={(name) => onChange({ ...form, name })}
        />
        <TextInput
          label="郵便番号"
          value={form.postalCode}
          required
          onChange={(postalCode) => onChange({ ...form, postalCode })}
        />
        <TextInput
          label="住所1"
          value={form.address1}
          required
          onChange={(address1) => onChange({ ...form, address1 })}
        />
        <TextInput
          label="住所2"
          value={form.address2}
          onChange={(address2) => onChange({ ...form, address2 })}
        />
        <TextInput
          label="住所3"
          value={form.address3}
          onChange={(address3) => onChange({ ...form, address3 })}
        />
        <TextInput
          label="TEL"
          value={form.tel}
          required
          onChange={(tel) => onChange({ ...form, tel })}
        />
        <TextInput
          label="別名・OCR候補"
          value={form.aliases}
          onChange={(aliases) => onChange({ ...form, aliases })}
        />
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "登録中..." : "配送先を登録"}
        </Button>
      </FieldGroup>
    </form>
  );
}

function TextInput({
  label,
  value,
  required = false,
  description,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>
        <span className="inline-flex items-center gap-2">
          {label}
          {required ? <RequiredMark /> : null}
        </span>
      </FieldLabel>
      <Input
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </Field>
  );
}

function TaxRateSelect({
  value,
  triggerClassName = "w-full",
  onChange,
}: {
  value: string;
  triggerClassName?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={taxRateOptions}
      value={value}
      onValueChange={(nextValue) => onChange(nextValue ?? "0.1")}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="税率を選択" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {taxRateOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function RequiredMark() {
  return (
    <span className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[11px] font-medium leading-none text-red-500">
      必須
    </span>
  );
}

function WholesalerSelect({
  value,
  options,
  allowCreate = false,
  onChange,
  onAdd,
}: {
  value: string;
  options: string[];
  allowCreate?: boolean;
  onChange: (value: string) => void;
  onAdd?: (value: string) => void;
}) {
  const [newWholesalerName, setNewWholesalerName] = useState("");
  const selectOptions = Array.from(
    new Set([value, ...options].map((name) => name.trim()).filter(Boolean)),
  );

  function addNewWholesaler() {
    const normalizedName = newWholesalerName.trim();

    if (!normalizedName) {
      return;
    }

    onAdd?.(normalizedName);
    onChange(normalizedName);
    setNewWholesalerName("");
  }

  return (
    <Select
      items={selectOptions.map((name) => ({ label: name, value: name }))}
      value={value}
      onValueChange={(nextValue) => onChange(nextValue ?? "")}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="問屋名を選択" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {selectOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectGroup>
        {allowCreate ? (
          <>
            <SelectSeparator />
            <div
              className="flex gap-2 p-1"
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Input
                value={newWholesalerName}
                placeholder="新しい問屋名"
                onChange={(event) => setNewWholesalerName(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={addNewWholesaler}>
                追加
              </Button>
            </div>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}

function SearchInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        placeholder={placeholder}
        className="pl-8"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function createClientMasterDraft(client: Client): ClientMasterDraft {
  return {
    id: client.id,
    name: client.name,
    fbpFeeRate: formatRatePercentInput(client.fbpFeeRate),
  };
}

function createStoreMasterDraft(store: Store): StoreMasterDraft {
  return {
    id: store.id,
    name: store.name,
    aliases: store.aliases.join("\n"),
  };
}

function parseAliasText(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,、]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  );
}

function hasStoreChanged(current: Store, next: Store) {
  return (
    current.name !== next.name ||
    current.aliases.slice().sort().join("\n") !== next.aliases.slice().sort().join("\n")
  );
}

function createProductMasterDraft(product: Product): ProductMasterDraft {
  return {
    originalJan: product.jan,
    originalClientId: product.clientId,
    jan: product.jan,
    internalSku: product.internalSku,
    cooolaCode: product.cooolaCode,
    name: product.name,
    wholesalePrice: String(product.wholesalePrice),
    taxRate: String(product.taxRate),
    retailPrice: product.retailPrice === null ? "" : String(product.retailPrice),
    payoutRate: product.payoutRate === null ? "" : formatRatePercentInput(product.payoutRate),
    memo: product.memo,
    productImagePath: product.productImagePath ?? "",
    productImageUrl: product.productImageUrl ?? "",
    ...productMasterExtraToForm(product),
  };
}

function getProductMasterDisplayValue(product: Product, key: ProductFormFieldKey) {
  if (key === "productImagePath") {
    return product.productImagePath ?? "";
  }

  if (key === "wholesalePrice") {
    return `${product.wholesalePrice.toLocaleString()}円`;
  }

  if (key === "taxRate") {
    return formatTaxRate(product.taxRate);
  }

  if (key === "retailPrice") {
    return formatNullableCurrency(product.retailPrice);
  }

  if (key === "payoutRate") {
    return formatNullableRate(product.payoutRate);
  }

  const value = product[key];

  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value);
}

function buildProductMasterExportRows(products: Product[]) {
  const categoryRow: string[] = [];
  const headerRow = productMasterListFields.map((field) => field.label);
  const descriptionRow = productMasterListFields.map((field) => field.description ?? "");

  productFormSections.forEach((section) => {
    section.fields.forEach((_, index) => {
      categoryRow.push(index === 0 ? section.title : "");
    });
  });

  return [
    ["商品マスタ"],
    categoryRow,
    headerRow,
    descriptionRow,
    ...products.map((product) =>
      productMasterListFields.map((field) => getProductMasterExportValue(product, field.key)),
    ),
  ];
}

function styleProductMasterWorksheet(worksheet: XLSXStyle.WorkSheet) {
  const range = XLSXStyle.utils.decode_range(worksheet["!ref"] ?? "A1:A1");
  const lastColumn = XLSXStyle.utils.encode_col(range.e.c);
  const sectionRanges = getProductMasterExportSectionRanges();

  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } },
    ...sectionRanges.map((sectionRange) => ({
      s: { r: 1, c: sectionRange.start },
      e: { r: 1, c: sectionRange.end },
    })),
  ];
  worksheet["!autofilter"] = { ref: `A3:${lastColumn}${range.e.r + 1}` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 3 };
  worksheet["!rows"] = [
    { hpt: 28 },
    { hpt: 22 },
    { hpt: 24 },
    { hpt: 42 },
    ...Array(Math.max(0, range.e.r - 3)).fill({ hpt: 22 }),
  ];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cellAddress = XLSXStyle.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[cellAddress] ?? { t: "s", v: "" };
      const sectionColor = getProductMasterExportSectionColor(column);
      worksheet[cellAddress] = cell;

      cell.s = {
        alignment: {
          vertical: "center",
          wrapText: row === 3,
        },
        border: {
          top: { style: "thin", color: { rgb: "D9E2F3" } },
          bottom: { style: "thin", color: { rgb: "D9E2F3" } },
          left: { style: "thin", color: { rgb: "D9E2F3" } },
          right: { style: "thin", color: { rgb: "D9E2F3" } },
        },
        fill: row >= 4 ? { patternType: "solid", fgColor: { rgb: sectionColor.data } } : undefined,
      };

      if (row === 0) {
        cell.s = {
          ...cell.s,
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 },
          fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      } else if (row === 1) {
        cell.s = {
          ...cell.s,
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: sectionColor.dark } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      } else if (row === 2) {
        cell.s = {
          ...cell.s,
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: sectionColor.medium } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      } else if (row === 3) {
        cell.s = {
          ...cell.s,
          font: { color: { rgb: "666666" }, sz: 10 },
          fill: { patternType: "solid", fgColor: { rgb: sectionColor.light } },
          alignment: { vertical: "top", wrapText: true },
        };
      }
    }
  }
}

function getProductMasterExportSectionRanges() {
  let start = 0;

  return productFormSections.map((section) => {
    const end = start + section.fields.length - 1;
    const sectionRange = { start, end };
    start = end + 1;
    return sectionRange;
  });
}

function getProductMasterExportSectionColor(column: number) {
  const sectionRanges = getProductMasterExportSectionRanges();
  const sectionIndex = Math.max(
    0,
    sectionRanges.findIndex((sectionRange) => column >= sectionRange.start && column <= sectionRange.end),
  );
  const colors = [
    { dark: "1F4E78", medium: "5B9BD5", light: "DDEBF7", data: "F8FBFE" },
    { dark: "548235", medium: "70AD47", light: "E2F0D9", data: "FAFCF7" },
    { dark: "9E480E", medium: "ED7D31", light: "FCE4D6", data: "FFFAF6" },
    { dark: "7030A0", medium: "A64DFF", light: "EADCF8", data: "FCF8FF" },
  ];

  return colors[sectionIndex] ?? colors[0];
}

function getProductMasterExportValue(product: Product, key: ProductFormFieldKey) {
  if (key === "wholesalePrice") {
    return product.wholesalePrice;
  }

  if (key === "taxRate") {
    return formatTaxRate(product.taxRate);
  }

  if (key === "retailPrice") {
    return product.retailPrice ?? "";
  }

  if (key === "payoutRate") {
    return product.payoutRate === null ? "" : formatRatePercentInput(product.payoutRate);
  }

  const value = product[key];
  return value === null || value === undefined ? "" : value;
}

function buildProductMasterExportFileName({
  clientName,
  search,
}: {
  clientName: string;
  search: string;
}) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = [clientName, search.trim()]
    .map((value) => value.replace(/[\\/:*?"<>|]/g, "").trim())
    .filter(Boolean)
    .join("_");

  return `商品マスタ_${suffix || "全件"}_${date}.xlsx`;
}

function getDeliveryWholesalerName(destination: Pick<DeliveryDestination, "wholesalerName" | "name" | "aliases" | "code">) {
  if (destination.wholesalerName) {
    return destination.wholesalerName;
  }

  const text = [destination.code, destination.name, ...destination.aliases].join(" ");

  if (/大山|オオヤマ|ｵｵﾔﾏ/i.test(text)) {
    return "大山";
  }

  return "";
}

function normalizeProductDraft(draft: ProductMasterDraft, clientId: string) {
  return {
    product: {
      jan: normalizeJanCell(draft.jan),
      clientId,
      internalSku: draft.internalSku.trim(),
      cooolaCode: draft.cooolaCode.trim(),
      name: draft.name.trim(),
      wholesalePrice: Number(draft.wholesalePrice.trim()),
      taxRate: Number(draft.taxRate.trim()),
      retailPrice: draft.retailPrice.trim() ? Number(draft.retailPrice.trim()) : null,
      payoutRate: parseRatePercent(draft.payoutRate.trim()),
      memo: draft.memo.trim(),
      productImagePath: draft.productImagePath.trim() || undefined,
      productImageUrl: draft.productImageUrl.trim() || undefined,
      ...normalizeProductMasterExtraForm(draft),
    },
  };
}

function buildProductKey(clientId: string, jan: string) {
  return `${clientId}:${jan}`;
}

function getClientName(clientId: string, clients: Client[]) {
  return clients.find((client) => client.id === clientId)?.name ?? "不明なクライアント";
}

function hasProductChanged(current: Product, next: Product) {
  return (
    current.jan !== next.jan ||
    (current.productImagePath ?? "") !== (next.productImagePath ?? "") ||
    current.name !== next.name ||
    current.internalSku !== next.internalSku ||
    current.cooolaCode !== next.cooolaCode ||
    current.wholesalePrice !== next.wholesalePrice ||
    current.taxRate !== next.taxRate ||
    current.retailPrice !== next.retailPrice ||
    current.payoutRate !== next.payoutRate ||
    current.memo !== next.memo ||
    productMasterExtraFields.some((field) => current[field.key] !== next[field.key])
  );
}

function createDeliveryDestinationMasterDraft(
  destination: DeliveryDestination,
): DeliveryDestinationMasterDraft {
  return {
    originalCode: destination.code,
    originalClientId: destination.clientId,
    code: destination.code,
    wholesalerName: getDeliveryWholesalerName(destination),
    name: destination.name,
    postalCode: destination.postalCode,
    address1: destination.address1,
    address2: destination.address2,
    address3: destination.address3,
    tel: destination.tel,
    aliases: destination.aliases.join("\n"),
  };
}

function normalizeDeliveryDestinationDraft(
  draft: DeliveryDestinationMasterDraft,
): DeliveryDestination {
  const aliases = draft.aliases
    .split(/[\n,、]/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return {
    code: draft.originalCode.trim(),
    wholesalerName: draft.wholesalerName.trim(),
    name: draft.name.trim(),
    postalCode: draft.postalCode.trim(),
    address1: draft.address1.trim(),
    address2: draft.address2.trim(),
    address3: draft.address3.trim(),
    tel: draft.tel.trim(),
    aliases: Array.from(new Set([draft.name.trim(), ...aliases].filter(Boolean))),
  };
}

function hasDeliveryDestinationChanged(
  current: DeliveryDestination,
  next: DeliveryDestination,
) {
  return (
    current.name !== next.name ||
    getDeliveryWholesalerName(current) !== getDeliveryWholesalerName(next) ||
    current.postalCode !== next.postalCode ||
    current.address1 !== next.address1 ||
    current.address2 !== next.address2 ||
    current.address3 !== next.address3 ||
    current.tel !== next.tel ||
    normalizeAliasesForComparison(current.name, current.aliases) !==
      normalizeAliasesForComparison(next.name, next.aliases)
  );
}

function normalizeAliasesForComparison(name: string, aliases: string[]) {
  return Array.from(new Set([name, ...aliases].map((alias) => alias.trim()).filter(Boolean)))
    .sort()
    .join("\n");
}

function isDeliveryDestinationMasterDraft(
  destination: DeliveryDestination | DeliveryDestinationMasterDraft,
): destination is DeliveryDestinationMasterDraft {
  return "originalCode" in destination;
}

function getDeliveryDestinationRowKey(
  destination: DeliveryDestination | DeliveryDestinationMasterDraft,
) {
  if (isDeliveryDestinationMasterDraft(destination)) {
    return `${destination.originalClientId ?? "base"}-${destination.originalCode}`;
  }

  return `${destination.clientId ?? "base"}-${destination.code}`;
}

function getDeliveryDestinationWholesalerValue(
  destination: DeliveryDestination | DeliveryDestinationMasterDraft,
) {
  if (isDeliveryDestinationMasterDraft(destination)) {
    return destination.wholesalerName;
  }

  return getDeliveryWholesalerName(destination);
}

function getDeliveryDestinationAliasesValue(
  destination: DeliveryDestination | DeliveryDestinationMasterDraft,
) {
  if (isDeliveryDestinationMasterDraft(destination)) {
    return destination.aliases;
  }

  return destination.aliases.slice(0, 2).join(" / ");
}

function dedupeDeliveryDestinations(destinations: DeliveryDestination[]) {
  const destinationsByCode = new Map<string, DeliveryDestination>();

  destinations.forEach((destination) => {
    const current = destinationsByCode.get(destination.code);

    if (!current || (!current.clientId && destination.clientId)) {
      destinationsByCode.set(destination.code, destination);
    }
  });

  return Array.from(destinationsByCode.values()).sort((a, b) => a.code.localeCompare(b.code, "ja"));
}

function getSupplierMapping(mappingKey: string) {
  const baseMappingKey = mappingKey.split(":")[0];

  return (
    supplierMappings[mappingKey] ??
    supplierMappings[baseMappingKey] ??
    supplierMappings[defaultSupplierMappingKey]
  );
}

function compareOrdersForWorkbench(a: Order, b: Order) {
  const statusCompare = getOrderStatusSortRank(a.status) - getOrderStatusSortRank(b.status);

  if (statusCompare !== 0) {
    return statusCompare;
  }

  const dateCompare = getSortableDateValue(a.arrivalDueDate).localeCompare(
    getSortableDateValue(b.arrivalDueDate),
  );

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return a.orderNo.localeCompare(b.orderNo, "ja");
}

function getOrderStatusSortRank(status: Order["status"]) {
  if (status === "imported") {
    return 0;
  }

  if (status === "confirmed") {
    return 1;
  }

  if (status === "shipped") {
    return 2;
  }

  return 3;
}

function getSortableDateValue(value: string) {
  return value || "9999-12-31";
}

function buildPayoutLineRows(
  orders: Order[],
  products: Product[],
  month: string,
): PayoutLineRow[] {
  return orders
    .filter((order) => order.status === "shipped" && isOrderArrivalInMonth(order, month))
    .flatMap((order) =>
      order.lines.map((line) => {
        const product = products.find(
          (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
        );

        return {
          order,
          line,
          product,
          retailPrice: line.retailPriceSnapshot,
          payoutRate: line.payoutRateSnapshot,
          fbpFeeRate: line.fbpFeeRateSnapshot ?? 0.08,
          payoutAmount: line.payoutAmount,
        };
      }),
    )
    .sort((a, b) => {
      const dateCompare = a.order.arrivalDueDate.localeCompare(b.order.arrivalDueDate);

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return a.order.orderNo.localeCompare(b.order.orderNo, "ja");
    });
}

function buildSellInRows({
  orders,
  products,
  stores,
  startDate,
  endDate,
  storeFilter,
  search,
}: {
  orders: Order[];
  products: Product[];
  stores: Store[];
  startDate: string;
  endDate: string;
  storeFilter: string;
  search: string;
}): SellInRow[] {
  const days = buildDateRange(startDate, endDate);
  const normalizedSearch = search.trim().toLowerCase();
  const productsByKey = new Map(products.map((product) => [`${product.clientId}:${product.jan}`, product]));
  const shouldGroupByStore = storeFilter !== "all";
  const actualRows = orders
    .flatMap((order) =>
      order.lines.map((line) => {
        const date = normalizeDateValue(order.orderDate);
        const product = productsByKey.get(`${order.clientId}:${line.jan}`);
        const storeName = getStoreNameFromOrderLine(line, stores);
        const hasIssue = storeName === "店舗不明" || !product || product.retailPrice === null;
        const wholesaleAmount = product ? Math.floor(product.wholesalePrice * line.qty) : null;
        const retailAmount = product?.retailPrice === null || !product
          ? null
          : Math.floor(product.retailPrice * line.qty);

        return {
          date,
          storeName,
          jan: line.jan,
          productName: product?.name ?? "未登録",
          qty: line.qty,
          wholesaleAmount,
          retailAmount,
          hasIssue,
        };
      }),
    )
    .filter((row) => row.date && days.includes(row.date))
    .filter((row) => !shouldGroupByStore || row.storeName === storeFilter)
    .map((row) => (shouldGroupByStore ? row : { ...row, storeName: "全店舗" }));

  const actualRowsByKey = new Map<string, SellInRow>();
  actualRows.forEach((row) => {
    const key = buildSellInKey(row.date, row.storeName, row.jan);
    const current = actualRowsByKey.get(key);

    if (!current) {
      actualRowsByKey.set(key, row);
      return;
    }

    actualRowsByKey.set(key, {
      ...current,
      qty: current.qty + row.qty,
      wholesaleAmount: addNullableAmounts(current.wholesaleAmount, row.wholesaleAmount),
      retailAmount: addNullableAmounts(current.retailAmount, row.retailAmount),
      hasIssue: current.hasIssue || row.hasIssue,
    });
  });

  const activeCombos = new Map<string, Omit<SellInRow, "date" | "qty" | "wholesaleAmount" | "retailAmount">>();
  actualRows.forEach((row) => {
    activeCombos.set(buildSellInComboKey(row.storeName, row.jan), {
      storeName: row.storeName,
      jan: row.jan,
      productName: row.productName,
      hasIssue: row.hasIssue,
    });
  });

  return days
    .flatMap((date) =>
      Array.from(activeCombos.values()).map((combo) => {
        const actual = actualRowsByKey.get(buildSellInKey(date, combo.storeName, combo.jan));

        if (actual) {
          return actual;
        }

        const product = products.find((candidate) => candidate.jan === combo.jan);
        return {
          date,
          storeName: combo.storeName,
          jan: combo.jan,
          productName: combo.productName,
          qty: 0,
          wholesaleAmount: product ? 0 : null,
          retailAmount: product?.retailPrice === null || !product ? null : 0,
          hasIssue: combo.hasIssue,
        };
      }),
    )
    .filter((row) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        row.jan.toLowerCase().includes(normalizedSearch) ||
        row.productName.toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }

      const storeCompare = a.storeName.localeCompare(b.storeName, "ja");
      if (storeCompare !== 0) {
        return storeCompare;
      }

      return a.jan.localeCompare(b.jan, "ja");
    });
}

function buildSellInStoreOptions({
  orders,
  products,
  stores,
  startDate,
  endDate,
  search,
}: {
  orders: Order[];
  products: Product[];
  stores: Store[];
  startDate: string;
  endDate: string;
  search: string;
}) {
  const normalizedStartDate = normalizeDateValue(startDate);
  const normalizedEndDate = normalizeDateValue(endDate);
  const normalizedSearch = search.trim().toLowerCase();
  const productsByKey = new Map(products.map((product) => [`${product.clientId}:${product.jan}`, product]));
  const orderStoreNames = orders
    .filter((order) => {
      const orderDate = normalizeDateValue(order.orderDate);

      return orderDate >= normalizedStartDate && orderDate <= normalizedEndDate;
    })
    .flatMap((order) =>
      order.lines
        .filter((line) => {
          if (!normalizedSearch) {
            return true;
          }

          const product = productsByKey.get(`${order.clientId}:${line.jan}`);
          return (
            line.jan.toLowerCase().includes(normalizedSearch) ||
            (product?.name ?? "").toLowerCase().includes(normalizedSearch)
          );
        })
        .map((line) => getStoreNameFromMemo(line.memo, stores)),
    );

  return Array.from(new Set(orderStoreNames)).sort((a, b) => a.localeCompare(b, "ja"));
}

function countSellInOrders({
  orders,
  products,
  stores,
  startDate,
  endDate,
  storeFilter,
  search,
}: {
  orders: Order[];
  products: Product[];
  stores: Store[];
  startDate: string;
  endDate: string;
  storeFilter: string;
  search: string;
}) {
  const days = buildDateRange(startDate, endDate);
  const normalizedSearch = search.trim().toLowerCase();
  const productsByKey = new Map(products.map((product) => [`${product.clientId}:${product.jan}`, product]));

  return orders.filter((order) => {
    if (!days.includes(normalizeDateValue(order.orderDate))) {
      return false;
    }

    return order.lines.some((line) => {
      const storeName = getStoreNameFromOrderLine(line, stores);
      const product = productsByKey.get(`${order.clientId}:${line.jan}`);

      if (storeFilter !== "all" && storeName !== storeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        line.jan.toLowerCase().includes(normalizedSearch) ||
        (product?.name ?? "").toLowerCase().includes(normalizedSearch)
      );
    });
  }).length;
}

function getStoreNameFromOrderLine(line: Order["lines"][number], stores: Store[]) {
  return getStoreNameFromMemo(line.memo, stores);
}

function extractUnknownStoreCandidates(orders: Order[], stores: Store[]) {
  const candidates = orders.flatMap((order) =>
    order.lines
      .map((line) => normalizeStoreName(line.memo))
      .filter((candidate) => isUnknownStoreCandidate(candidate, stores)),
  );

  return Array.from(new Set(candidates));
}

function isUnknownStoreCandidate(candidate: string, stores: Store[]) {
  if (!candidate) {
    return false;
  }

  if (getDefaultStoreNameFromMemo(candidate)) {
    return false;
  }

  const matchingStores = mergeStoreChains(defaultStoreChains, stores);
  return matchingStores.every((store) => getStoreMatchScore(candidate, store) === 0);
}

function getStoreNameFromMemo(memo: string, stores: Store[]) {
  const memoStoreName = normalizeStoreName(memo);

  if (!memoStoreName) {
    return "店舗不明";
  }

  const defaultStoreName = getDefaultStoreNameFromMemo(memoStoreName);
  if (defaultStoreName) {
    return defaultStoreName;
  }

  const matchingStores = mergeStoreChains(defaultStoreChains, stores);
  const matchedStore = matchingStores
    .map((store) => ({
      store,
      score: getStoreMatchScore(memoStoreName, store),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.store;

  return matchedStore?.name ?? memoStoreName;
}

function getDefaultStoreNameFromMemo(memoStoreName: string) {
  const memo = memoStoreName
    .toLowerCase()
    .replaceAll(" ", "")
    .replaceAll("　", "")
    .replaceAll("*", "")
    .replaceAll("＊", "");

  if (memo.includes("ロフト") || memo.includes("loft")) {
    return "ロフト";
  }

  if (memo.includes("ハンズ") || memo.includes("tokyuhands") || memo.includes("hands")) {
    return "ハンズ";
  }

  if (memo.includes("アインズ") || memo.includes("ainz")) {
    return "アインズ";
  }

  if (memo.includes("イナイミモザ") || memo.includes("ミモザ")) {
    return "ミモザ";
  }

  return null;
}

function mergeStoreChains(defaultStores: Store[], stores: Store[]) {
  const mergedStores: Store[] = [];

  defaultStores.forEach((store) => {
    mergedStores.push({
      ...store,
      aliases: Array.from(new Set([...store.aliases, store.name])),
    });
  });

  stores.forEach((store) => {
    const existingIndex = mergedStores.findIndex((candidate) => storesRepresentSameChain(candidate, store));

    if (existingIndex === -1) {
      mergedStores.push({
        ...store,
        aliases: Array.from(new Set([...store.aliases, store.name])),
      });
      return;
    }

    const existing = mergedStores[existingIndex];
    mergedStores[existingIndex] = {
      ...existing,
      aliases: Array.from(new Set([...existing.aliases, existing.name, store.name, ...store.aliases])),
    };
  });

  return mergedStores;
}

function storesRepresentSameChain(a: Store, b: Store) {
  const aCandidates = [a.name, ...a.aliases].map(normalizeStoreMatchText).filter(Boolean);
  const bCandidates = [b.name, ...b.aliases].map(normalizeStoreMatchText).filter(Boolean);

  return aCandidates.some((aCandidate) => bCandidates.some((bCandidate) => aCandidate === bCandidate));
}

function normalizeStoreName(value: string) {
  return value
    .replace(/^入荷先[:：]?/, "")
    .replace(/^店舗[:：]?/, "")
    .replace(/^店名[:：]?/, "")
    .replace(/^\*+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStoreMatchText(value: string) {
  return normalizeStoreName(value)
    .toLowerCase()
    .replace(/[\\s　・･\\/／\\-ー‐‑‒–—―_,，、.．()（）［\]\\[【】]/g, "");
}

function getStoreMatchScore(memoStoreName: string, store: Store) {
  const memo = normalizeStoreMatchText(memoStoreName);
  const candidates = [store.name, ...store.aliases]
    .map((alias) => normalizeStoreMatchText(alias))
    .filter(Boolean);

  return candidates.reduce((score, candidate) => {
    if (memo === candidate) {
      return Math.max(score, candidate.length + 1000);
    }

    if (memo.includes(candidate)) {
      return Math.max(score, candidate.length);
    }

    return score;
  }, 0);
}

function buildSellInKey(date: string, storeName: string, jan: string) {
  return `${date}::${storeName}::${jan}`;
}

function buildSellInComboKey(storeName: string, jan: string) {
  return `${storeName}::${jan}`;
}

function buildDateRange(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end || start > end) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function parseDateOnly(value: string) {
  const normalized = normalizeDateValue(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateValue(value: string) {
  if (!value) {
    return "";
  }

  const normalized = value.replaceAll("/", "-").trim();
  const date = new Date(normalized);

  if (!Number.isNaN(date.getTime())) {
    return formatDateOnly(date);
  }

  return normalized.slice(0, 10);
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentMonthStartValue() {
  const now = new Date();

  return formatDateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getCurrentMonthEndValue() {
  const now = new Date();

  return formatDateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function addNullableAmounts(current: number | null, next: number | null) {
  if (current === null || next === null) {
    return null;
  }

  return current + next;
}

function sumNullableAmounts(values: (number | null)[]) {
  if (values.some((value) => value === null)) {
    return null;
  }

  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function buildSellInDailyChartRows(rows: SellInRow[]): SellInChartRow[] {
  const rowsByDate = new Map<string, SellInChartRow>();

  rows.forEach((row) => {
    const current = rowsByDate.get(row.date) ?? {
      label: row.date,
      qty: 0,
      wholesaleAmount: 0,
      retailAmount: 0,
    };

    rowsByDate.set(row.date, {
      ...current,
      qty: current.qty + row.qty,
      wholesaleAmount: addNullableAmounts(current.wholesaleAmount, row.wholesaleAmount),
      retailAmount: addNullableAmounts(current.retailAmount, row.retailAmount),
    });
  });

  return Array.from(rowsByDate.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildSellInProductChartRows(rows: SellInRow[]): SellInChartRow[] {
  const rowsByProduct = new Map<string, SellInChartRow>();

  rows.forEach((row) => {
    const label = row.productName;
    const current = rowsByProduct.get(label) ?? {
      label,
      qty: 0,
      wholesaleAmount: 0,
      retailAmount: 0,
    };

    rowsByProduct.set(label, {
      ...current,
      qty: current.qty + row.qty,
      wholesaleAmount: addNullableAmounts(current.wholesaleAmount, row.wholesaleAmount),
      retailAmount: addNullableAmounts(current.retailAmount, row.retailAmount),
    });
  });

  return Array.from(rowsByProduct.values())
    .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, "ja"))
    .slice(0, 8);
}

function formatChartDateLabel(value: string) {
  const [, month, day] = value.split("-");

  return month && day ? `${Number(month)}/${Number(day)}` : value;
}

function formatChartAmount(value: number | null) {
  if (value === null) {
    return "-";
  }

  if (value >= 10000) {
    return `${Math.round(value / 1000) / 10}万`;
  }

  return value.toLocaleString();
}

function getNiceChartMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const niceFraction =
    fraction <= 1 ? 1 :
    fraction <= 1.5 ? 1.5 :
    fraction <= 2 ? 2 :
    fraction <= 3 ? 3 :
    fraction <= 5 ? 5 :
    10;

  return niceFraction * base;
}

function buildSellInExportRows(rows: SellInRow[]) {
  return rows.map((row) => ({
    日付: row.date,
    店舗: row.storeName,
    JAN: row.jan,
    商品名: row.productName,
    数量: row.qty,
    下代: row.wholesaleAmount ?? "未計算",
    上代: row.retailAmount ?? "未計算",
  }));
}

function buildSellInExportFileName(extension: "csv" | "xlsx", startDate: string, endDate: string) {
  const period = startDate && endDate ? `${startDate}_${endDate}` : getCurrentMonthValue();

  return `sell-in-${period}.${extension}`;
}

function isOrderArrivalInMonth(order: Order, month: string) {
  if (!month || !order.arrivalDueDate) {
    return false;
  }

  return normalizeMonthValue(order.arrivalDueDate) === month;
}

function getCurrentMonthValue() {
  return normalizeMonthValue(new Date().toISOString());
}

function normalizeMonthValue(value: string) {
  const normalized = value.replaceAll("/", "-");

  return normalized.slice(0, 7);
}

function OrderCard({
  order,
  products,
  isSaving,
  hasExportedCsv,
  onConfirm,
  onUndo,
  onShip,
  onDelete,
  onExportCooola,
  onUpdateArrivalDueDate,
}: {
  order: Order;
  products: Product[];
  isSaving: boolean;
  hasExportedCsv: boolean;
  onConfirm: () => void;
  onUndo: () => void;
  onShip: () => void;
  onDelete: () => void;
  onExportCooola: () => void;
  onUpdateArrivalDueDate: (arrivalDueDate: string) => void;
}) {
  const amount = order.lines.reduce(
    (sum, line) => sum + calculateLineAmount(order, line, products),
    0,
  );

  return (
    <Card size="sm" className={getOrderCardClassName(order.status)}>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 shadow-xs">
                発注番号 {order.orderNo}
              </span>
            </CardTitle>
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              到着指定日
              <input
                type="date"
                value={order.arrivalDueDate}
                disabled={isSaving}
                className="bg-transparent text-xs outline-none"
                onChange={(event) => onUpdateArrivalDueDate(event.target.value)}
              />
            </label>
            <StatusBadge status={order.status} />
          </div>
          <CardDescription>
            {formatOrderCardDescription(order)}
          </CardDescription>
        </div>
        <CardAction>
        <div className="flex flex-wrap justify-end gap-2">
          {order.status === "imported" ? (
            <Button
              type="button"
              disabled={isSaving}
              onClick={onConfirm}
            >
              {isSaving ? "保存中..." : "チェック済みにする"}
            </Button>
          ) : null}
          {order.status === "shipped" ? (
            <Button
              variant="outline"
              className="!bg-black !text-white hover:!bg-black/85"
              type="button"
              disabled={isSaving}
              onClick={onExportCooola}
            >
              CSVファイルを出力
            </Button>
          ) : null}
          {order.status === "shipped" ? (
            <Button
              variant="default"
              type="button"
              aria-pressed={order.status === "shipped"}
              disabled={isSaving}
              onClick={onShip}
            >
              {isSaving ? "保存中..." : "発送済み"}
            </Button>
          ) : null}
          {order.status === "imported" || order.status === "confirmed" ? (
            <Button
              variant="destructive"
              size="icon"
              type="button"
              disabled={isSaving}
              onClick={onDelete}
              aria-label="削除"
              title="削除"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
          <OrderActionMenu
            order={order}
            isSaving={isSaving}
            onUndo={onUndo}
          />
        </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>JAN</TableHead>
              <TableHead>商品名</TableHead>
              <TableHead>COOOLaコード</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>単価</TableHead>
              <TableHead>金額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.lines.map((line) => {
              const product = products.find(
                (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
              );
              const unitPrice =
                order.status === "imported"
                  ? product?.wholesalePrice ?? 0
                  : line.unitPriceSnapshot ?? 0;

              return (
                <TableRow key={line.id}>
                  <TableCell className="font-mono text-xs">
                    {line.jan}
                  </TableCell>
                  <TableCell>{product?.name ?? "未登録"}</TableCell>
                  <TableCell>{product?.cooolaCode ?? "-"}</TableCell>
                  <TableCell>{line.qty}</TableCell>
                  <TableCell>
                    {unitPrice.toLocaleString()}円
                  </TableCell>
                  <TableCell>
                    {calculateLineAmount(order, line, products).toLocaleString()}円
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {order.status === "confirmed" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-blue-900">
                次の作業: メーカーCSVを出力
              </p>
              <p className="text-xs text-blue-800">
                {hasExportedCsv
                  ? "CSV出力済みです。発送済みにできます。"
                  : "CSVを出力してから、発送済みにしてください。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="!bg-black !text-white hover:!bg-black/85"
                disabled={isSaving}
                onClick={onExportCooola}
              >
                メーカーCSVを出力
              </Button>
              <Button
                type="button"
                variant={hasExportedCsv ? "default" : "outline"}
                disabled={isSaving}
                onClick={onShip}
              >
                {isSaving ? "保存中..." : "発送済みにする"}
              </Button>
            </div>
          </div>
        ) : null}

      <p className="text-right text-sm font-semibold">合計 {amount.toLocaleString()}円</p>
      </CardContent>
    </Card>
  );
}

function OrderActionMenu({
  order,
  isSaving,
  onUndo,
}: {
  order: Order;
  isSaving: boolean;
  onUndo: () => void;
}) {
  const canUndo = order.status === "confirmed";

  if (!canUndo) {
    return null;
  }

  return (
    <details className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center justify-center rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
        その他
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex min-w-44 flex-col overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        <button
          type="button"
          disabled={isSaving}
          onClick={onUndo}
          className="rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          チェックを取り消す
        </button>
      </div>
    </details>
  );
}

function formatOrderCardDescription(order: Order) {
  return [order.shipToName, order.shipToAddress, order.sourceFile]
    .filter((value) => value && value !== "PDF発注書")
    .join(" / ");
}

function isOrderInPeriod(
  order: Order,
  period: OrderPeriodFilter,
  startDate: string,
  endDate: string,
) {
  if (period === "all") {
    return true;
  }

  const importedAt = new Date(order.importedAt);

  if (Number.isNaN(importedAt.getTime())) {
    return false;
  }

  if (period === "thisMonth" || period === "lastMonth") {
    const now = new Date();
    const targetYear = period === "thisMonth" ? now.getFullYear() : getPreviousMonthDate(now).getFullYear();
    const targetMonth = period === "thisMonth" ? now.getMonth() : getPreviousMonthDate(now).getMonth();

    return importedAt.getFullYear() === targetYear && importedAt.getMonth() === targetMonth;
  }

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

  if (start && importedAt < start) {
    return false;
  }

  if (end && importedAt > end) {
    return false;
  }

  return true;
}

function getPreviousMonthDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function StatusBadge({ status }: { status: string }) {
  const className = getStatusBadgeClassName(status);
  const variant =
    status === "saved" || status === "confirmed"
      ? "default"
      : status === "blocked"
        ? "destructive"
        : "secondary";

  return (
    <Badge variant={variant} className={className}>{getStatusLabel(status)}</Badge>
  );
}

function getOrderCardClassName(status: Order["status"]) {
  if (status === "imported") {
    return "border border-red-200 bg-red-50/75 ring-red-200";
  }

  if (status === "confirmed") {
    return "border border-yellow-200 bg-yellow-50/85 ring-yellow-200";
  }

  if (status === "shipped") {
    return "border border-slate-200 bg-slate-100 text-slate-700 ring-slate-200";
  }

  return undefined;
}

function getStatusBadgeClassName(status: string) {
  if (status === "imported") {
    return "border border-red-200 bg-red-100 text-red-700";
  }

  if (status === "confirmed") {
    return "border border-yellow-300 bg-yellow-100 text-yellow-900";
  }

  if (status === "shipped") {
    return "border border-slate-300 bg-slate-300 text-slate-800";
  }

  return undefined;
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    imported: "取込済み",
    confirmed: "チェック済み",
    shipping_instructed: "出荷指示済み",
    shipped: "発送済み",
    saved: "保存成功",
    blocked: "要確認",
  };

  return labels[status] ?? status;
}

function buildImportBatch(
  fileName: string,
  status: ImportBatch["status"],
  errors: ImportError[],
  fileStoragePath?: string,
  fileUrl?: string,
): ImportBatch {
  return {
    id: createId(),
    fileName,
    clientId: "",
    supplierId: "",
    fileStoragePath,
    fileUrl,
    importedAt: new Date().toISOString(),
    status,
    errors,
  };
}

function mergeImportedOrders(current: Order[], importedOrders: Order[]) {
  const importedKeys = new Set(
    importedOrders.map((order) => `${order.clientId}:${order.supplierId}:${order.orderNo}`),
  );

  return [
    ...current.filter((order) => !importedKeys.has(`${order.clientId}:${order.supplierId}:${order.orderNo}`)),
    ...importedOrders,
  ];
}

function applySavedOrderIds(orders: Order[], orderIds?: Record<string, string>) {
  if (!orderIds) {
    return orders;
  }

  return orders.map((order) => ({
    ...order,
    id: orderIds[order.orderNo] ?? order.id,
  }));
}

async function readFileForImport(file: File): Promise<FileReadResult> {
  const fileName = file.name.toLowerCase();

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/parse-pdf", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as {
      extractionMethod?: "pdf-text" | "ocr" | "mac-vision";
      confidence?: number;
      pages?: number;
      text?: string;
      error?: string;
    };

    if (!response.ok || !result.text) {
      throw new Error(result.error ?? "PDFを読めませんでした。");
    }

    return {
      type: "pdf",
      extractionMethod: result.extractionMethod ?? "pdf-text",
      confidence: result.confidence,
      pages: result.pages ?? 0,
      text: result.text,
    };
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return {
      type: "rows",
      rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }),
    };
  }

  if (!fileName.endsWith(".csv")) {
    throw new Error("PDF、Excel、CSVファイルをアップロードしてください。");
  }

  const text = await readCsvText(file);

  const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: reject,
    });
  });

  return {
    type: "rows",
    rows,
  };
}

async function readRowsFromSpreadsheetFile(file: File) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }

  if (fileName.endsWith(".csv")) {
    const text = await readCsvText(file);

    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: reject,
      });
    });
  }

  throw new Error("ExcelまたはCSVファイルをアップロードしてください。");
}

function parseDeliveryDestinationRows(rows: Record<string, unknown>[]) {
  const destinations: DeliveryDestination[] = [];
  const errors: ImportError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const destination = normalizeDeliveryDestinationImportRow(row);

    if (
      !destination.code ||
      !destination.wholesalerName ||
      !destination.name ||
      !destination.postalCode ||
      !destination.address1 ||
      !destination.tel
    ) {
      errors.push({
        row: rowNumber,
        field: "deliveryDestination",
        message: "配送先コード、問屋名、配送先名、郵便番号、住所1、TELは必須です。",
      });
      return;
    }

    destinations.push(destination);
  });

  return {
    destinations: dedupeDeliveryDestinations(destinations),
    errors,
  };
}

function normalizeDeliveryDestinationImportRow(row: Record<string, unknown>): DeliveryDestination {
  const code = getSpreadsheetValue(row, [
    "配送先コード",
    "配送コード",
    "納品先コード",
    "届け先コード",
    "お届け先コード",
    "コード",
  ]);
  const wholesalerName = getSpreadsheetValue(row, ["問屋名", "問屋", "卸先", "卸", "取引先"]);
  const name = getSpreadsheetValue(row, [
    "配送先名",
    "納品先名",
    "届け先名",
    "お届け先名",
    "センター名",
    "名称",
    "名前",
  ]);
  const postalCode = getSpreadsheetValue(row, ["郵便番号", "郵便", "〒", "郵便No"]);
  const address1 = getSpreadsheetValue(row, ["住所1", "住所", "所在地", "住所①"]);
  const address2 = getSpreadsheetValue(row, ["住所2", "住所②", "建物名", "建物"]);
  const address3 = getSpreadsheetValue(row, ["住所3", "住所③", "備考住所"]);
  const tel = getSpreadsheetValue(row, ["TEL", "Tel", "tel", "電話番号", "電話"]);
  const aliases = getSpreadsheetValue(row, [
    "別名・OCR候補",
    "別名",
    "OCR候補",
    "エイリアス",
    "候補名",
  ])
    .split(/[\n,、]/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return {
    code,
    wholesalerName,
    name,
    postalCode,
    address1,
    address2,
    address3,
    tel,
    aliases: Array.from(new Set([name, ...aliases].filter(Boolean))),
  };
}

function getSpreadsheetValue(row: Record<string, unknown>, candidateKeys: string[]) {
  const normalizedCandidates = candidateKeys.map(normalizeSpreadsheetHeader);
  const matchedKey = Object.keys(row).find((key) =>
    normalizedCandidates.includes(normalizeSpreadsheetHeader(key)),
  );

  if (!matchedKey) {
    return "";
  }

  const value = row[matchedKey];

  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeSpreadsheetHeader(header: string) {
  return header
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s＿_\-‐ー－・:：()（）［\]\[\].．。]/g, "");
}

async function readCsvText(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);

  if (!utf8Text.includes("\uFFFD")) {
    return utf8Text;
  }

  return new TextDecoder("shift-jis").decode(buffer);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "不明なエラーです";
}

function showImportErrorPopup(errors: ImportError[], heading = "発注ファイルの取り込みでエラーが発生しました。") {
  window.alert(formatImportErrorMessage(errors, heading));
}

function formatImportErrorMessage(errors: ImportError[], heading: string) {
  const visibleErrors = errors.slice(0, 10);
  const errorLines = visibleErrors.map((error) => {
    const location = error.row > 0 ? `${error.row}行目` : "ファイル全体";
    return `・${location}: ${error.message}`;
  });
  const remainingCount = errors.length - visibleErrors.length;

  if (remainingCount > 0) {
    errorLines.push(`・ほか${remainingCount}件のエラーがあります。`);
  }

  return [heading, "", "エラー理由:", ...errorLines].join("\n");
}

function formatTaxRate(taxRate: number) {
  const option = taxRateOptions.find((candidate) => Number(candidate.value) === taxRate);

  if (option) {
    return option.label;
  }

  return `${Math.round(taxRate * 1000) / 10}%`;
}

function parseRatePercent(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value.replace("%", "").trim();
  const rate = Number(normalized);

  if (!Number.isFinite(rate)) {
    return null;
  }

  return rate / 100;
}

function formatNullableCurrency(value: number | null) {
  return value === null ? "未設定" : `${value.toLocaleString()}円`;
}

function formatNullableRate(value: number | null) {
  return value === null ? "未設定" : `${formatRatePercentInput(value)}%`;
}

function formatRatePercentInput(value: number) {
  return (Math.round(value * 1000000) / 10000).toString();
}

function downloadTextFile({
  fileName,
  text,
  type,
}: {
  fileName: string;
  text: string;
  type: string;
}) {
  const blob = new Blob([`\uFEFF${text}`], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadFileFromUrl(url: string, fileName: string) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("ファイルを取得できませんでした。");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    window.alert(getErrorMessage(error));
  }
}

async function downloadOrderFile(path?: string, url?: string, fileName = "発注書.pdf") {
  const result = path ? await createOrderFileDownloadUrl(path) : null;

  if (result && !result.ok) {
    window.alert(result.message);
    return;
  }

  const downloadUrl = result?.url ?? url;

  if (!downloadUrl) {
    window.alert("PDFファイルの保存パスがありません。");
    return;
  }

  await downloadFileFromUrl(downloadUrl, fileName);
}

async function openOrderFile(path?: string, url?: string) {
  const result = path ? await createOrderFileDownloadUrl(path) : null;

  if (result && !result.ok) {
    window.alert(result.message);
    return;
  }

  const viewUrl = result?.url ?? url;

  if (!viewUrl) {
    window.alert("PDFファイルの保存パスがありません。");
    return;
  }

  window.open(viewUrl, "_blank", "noopener,noreferrer");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
