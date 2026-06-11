import {
  deliveryDestinations as staticDeliveryDestinations,
  type DeliveryDestination,
} from "@/lib/delivery-destination-master";
import type {
  Client,
  ImportBatch,
  ImportError,
  Order,
  OrderLine,
  OrderStatus,
  Product,
  Store,
  Supplier,
} from "@/lib/types";
import { productMasterExtraFields } from "@/lib/product-master-fields";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const productSelectColumns = [
  "client_id",
  "jan",
  "internal_sku",
  "cooola_code",
  "name",
  "wholesale_price",
  "tax_rate",
  "retail_price",
  "payout_rate",
  "flags",
  ...productMasterExtraFields.map((field) => field.column),
].join(", ");

export type OrderWorkbenchDataScope =
  | "orders"
  | "clients"
  | "products"
  | "deliveryDestinations"
  | "stores"
  | "orderFiles"
  | "payouts"
  | "sellIn"
  | "history";

export type OrderWorkbenchInitialData = {
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  orders: Order[];
  importBatches: ImportBatch[];
  deliveryDestinations: DeliveryDestination[];
  stores: Store[];
  source: "supabase" | "error";
  message: string;
};

type ProductRow = {
  client_id: string;
  jan: string;
  internal_sku: string | null;
  cooola_code: string | null;
  name: string;
  wholesale_price: number | string;
  tax_rate: number | string;
  retail_price?: number | string | null;
  payout_rate?: number | string | null;
  flags: Record<string, unknown> | null;
} & Record<string, number | string | Record<string, unknown> | null | undefined>;

type ClientRow = {
  id: string;
  name: string;
  fbp_fee_rate?: number | string | null;
};

type SupplierRow = {
  id: string;
  client_id: string;
  name: string;
  mapping_key: string;
};

type OrderLineRow = {
  id: string;
  line_no: number;
  jan: string;
  qty: number;
  unit_price_snapshot: number | string | null;
  tax_rate_snapshot: number | string | null;
  amount: number | string | null;
  retail_price_snapshot?: number | string | null;
  payout_rate_snapshot?: number | string | null;
  fbp_fee_rate_snapshot?: number | string | null;
  payout_amount?: number | string | null;
  memo: string | null;
};

type OrderRow = {
  id: string;
  client_id: string;
  supplier_id: string;
  order_no: string;
  order_date: string;
  arrival_due_date: string | null;
  delivery_due_date: string | null;
  ship_to_name: string;
  ship_to_center: string | null;
  ship_to_address: string | null;
  ship_to_tel: string | null;
  warehouse: string | null;
  status: OrderStatus;
  source_file: string | null;
  source_file_path?: string | null;
  imported_at: string;
  order_lines: OrderLineRow[] | null;
};

type ImportErrorRow = {
  row_number: number | null;
  field: string;
  message: string;
};

type ImportBatchRow = {
  id: string;
  client_id: string;
  supplier_id: string;
  file_name: string;
  file_storage_path?: string | null;
  status: "saved" | "blocked";
  imported_at: string;
  import_errors: ImportErrorRow[] | null;
};

type DeliveryDestinationRow = {
  client_id: string;
  code: string;
  wholesaler_name?: string | null;
  name: string;
  postal_code: string;
  address1: string;
  address2: string | null;
  address3: string | null;
  tel: string;
  aliases: string[] | null;
};

type StoreRow = {
  id: string;
  name: string;
  aliases: string[] | null;
};

export async function getOrderWorkbenchInitialData(
  scope: OrderWorkbenchDataScope = "orders",
): Promise<OrderWorkbenchInitialData> {
  if (!hasSupabaseServerEnv()) {
    return getEmptyInitialData(
      "Supabase環境変数が未設定のため、データを表示できません。サンプルデータへの自動切り替えは無効です。",
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const requirements = getDataRequirements(scope);
    const [
      clientsResult,
      suppliersResult,
      productsResult,
      ordersResult,
      importBatchesResult,
      deliveryDestinations,
      stores,
    ] = await Promise.all([
      requirements.clients ? readClients(supabase) : null,
      requirements.suppliers ? readSuppliers(supabase) : null,
      requirements.products ? readProducts(supabase) : null,
      requirements.orders ? readOrders(supabase) : null,
      requirements.importBatches ? readImportBatches(supabase) : null,
      requirements.deliveryDestinations ? readDeliveryDestinations(supabase) : [],
      requirements.stores ? readStores(supabase) : [],
    ]);

    const firstError = [
      clientsResult?.error,
      suppliersResult?.error,
      productsResult?.error,
      ordersResult?.error,
      importBatchesResult?.error,
    ].find(Boolean);

    if (firstError) {
      return getEmptyInitialData(
        `Supabase読み取りに失敗したため、データを表示できません。サンプルデータへの自動切り替えは無効です: ${firstError.message}`,
      );
    }

    const clients = ((clientsResult?.data ?? []) as ClientRow[]).map(mapClient);
    const products = ((productsResult?.data ?? []) as unknown as ProductRow[]).map(mapProduct);
    const orders = ((ordersResult?.data ?? []) as OrderRow[]).map(mapOrder);
    const importBatches = ((importBatchesResult?.data ?? []) as ImportBatchRow[]).map(mapImportBatch);

    return {
      clients,
      suppliers: ((suppliersResult?.data ?? []) as SupplierRow[]).map(mapSupplier),
      products,
      orders,
      importBatches,
      deliveryDestinations,
      stores,
      source: "supabase",
      message: "Supabaseから読み取ったデータを表示しています。保存処理はまだ仮実装です。",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return getEmptyInitialData(
      `Supabase読み取りに失敗したため、データを表示できません。サンプルデータへの自動切り替えは無効です: ${message}`,
    );
  }
}

function getDataRequirements(scope: OrderWorkbenchDataScope) {
  return {
    clients: scope !== "stores",
    suppliers: scope === "orders",
    products: scope === "orders" || scope === "products" || scope === "sellIn" || scope === "payouts" || scope === "history",
    orders: scope === "orders" || scope === "sellIn" || scope === "payouts" || scope === "orderFiles" || scope === "history",
    importBatches: scope === "orderFiles" || scope === "history",
    deliveryDestinations: scope === "orders" || scope === "deliveryDestinations",
    stores: scope === "orders" || scope === "sellIn" || scope === "stores",
  };
}

function getEmptyInitialData(message: string): OrderWorkbenchInitialData {
  return {
    clients: [],
    suppliers: [],
    products: [],
    orders: [],
    importBatches: [],
    deliveryDestinations: [],
    stores: [],
    source: "error",
    message,
  };
}

function readClients(supabase: ReturnType<typeof createServerSupabaseClient>) {
  return supabase.from("clients").select("id, name, fbp_fee_rate").order("name");
}

function readSuppliers(supabase: ReturnType<typeof createServerSupabaseClient>) {
  return supabase.from("suppliers").select("id, client_id, name, mapping_key").order("name");
}

function readProducts(supabase: ReturnType<typeof createServerSupabaseClient>) {
  return supabase.from("products").select(productSelectColumns).order("name");
}

function readOrders(supabase: ReturnType<typeof createServerSupabaseClient>) {
  return supabase
    .from("orders")
    .select(
      `
      id,
      client_id,
      supplier_id,
      order_no,
      order_date,
      arrival_due_date,
      delivery_due_date,
      ship_to_name,
      ship_to_center,
      ship_to_address,
      ship_to_tel,
      warehouse,
      status,
      source_file,
      source_file_path,
      imported_at,
      order_lines (
        id,
        line_no,
        jan,
        qty,
        unit_price_snapshot,
        tax_rate_snapshot,
        amount,
        retail_price_snapshot,
        payout_rate_snapshot,
        fbp_fee_rate_snapshot,
        payout_amount,
        memo
      )
    `,
    )
    .order("imported_at", { ascending: false });
}

function readImportBatches(supabase: ReturnType<typeof createServerSupabaseClient>) {
  return supabase
    .from("import_batches")
    .select(
      `
      id,
      client_id,
      supplier_id,
      file_name,
      file_storage_path,
      status,
      imported_at,
      import_errors (
        row_number,
        field,
        message
      )
    `,
    )
    .order("imported_at", { ascending: false })
    .limit(20);
}

async function readStores(
  supabase: ReturnType<typeof createServerSupabaseClient>,
) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, aliases")
    .order("name");

  if (error) {
    return [];
  }

  return ((data ?? []) as StoreRow[]).map(mapStore);
}

async function readDeliveryDestinations(
  supabase: ReturnType<typeof createServerSupabaseClient>,
) {
  const { data, error } = await supabase
    .from("delivery_destinations")
    .select("client_id, code, wholesaler_name, name, postal_code, address1, address2, address3, tel, aliases")
    .order("code");

  if (error) {
    return staticDeliveryDestinations;
  }

  const destinations = [
    ...staticDeliveryDestinations,
    ...((data ?? []) as DeliveryDestinationRow[]).map(mapDeliveryDestination),
  ];
  return destinations;
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    fbpFeeRate: row.fbp_fee_rate == null ? 0.08 : Number(row.fbp_fee_rate),
  };
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    mappingKey: row.mapping_key,
  };
}

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
  };
}

function mapProduct(row: ProductRow): Product {
  const extraFields = Object.fromEntries(
    productMasterExtraFields.map((field) => [
      field.key,
      normalizeProductMasterField(row[field.column]),
    ]),
  );

  return {
    jan: row.jan,
    clientId: row.client_id,
    internalSku: row.internal_sku ?? "",
    cooolaCode: row.cooola_code ?? "",
    name: row.name,
    wholesalePrice: Number(row.wholesale_price),
    taxRate: Number(row.tax_rate),
    retailPrice: row.retail_price == null ? null : Number(row.retail_price),
    payoutRate: row.payout_rate == null ? null : Number(row.payout_rate),
    memo: typeof row.flags?.memo === "string" ? row.flags.memo : "",
    ...extraFields,
  };
}

function normalizeProductMasterField(
  value: number | string | Record<string, unknown> | null | undefined,
) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return null;
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    clientId: row.client_id,
    supplierId: row.supplier_id,
    orderNo: row.order_no,
    orderDate: row.order_date,
    arrivalDueDate: row.arrival_due_date ?? "",
    deliveryDueDate: row.delivery_due_date ?? "",
    shipToName: row.ship_to_name,
    shipToCenter: row.ship_to_center ?? "",
    shipToAddress: row.ship_to_address ?? "",
    shipToTel: row.ship_to_tel ?? "",
    warehouse: row.warehouse ?? "",
    status: row.status,
    sourceFile: row.source_file ?? "",
    sourceFilePath: row.source_file_path ?? undefined,
    importedAt: row.imported_at,
    lines: (row.order_lines ?? []).map(mapOrderLine),
  };
}

function mapOrderLine(row: OrderLineRow): OrderLine {
  return {
    id: row.id,
    lineNo: row.line_no,
    jan: row.jan,
    qty: row.qty,
    unitPriceSnapshot:
      row.unit_price_snapshot === null ? null : Number(row.unit_price_snapshot),
    taxRateSnapshot: row.tax_rate_snapshot === null ? null : Number(row.tax_rate_snapshot),
    amount: row.amount === null ? null : Number(row.amount),
    retailPriceSnapshot:
      row.retail_price_snapshot == null ? null : Number(row.retail_price_snapshot),
    payoutRateSnapshot:
      row.payout_rate_snapshot == null ? null : Number(row.payout_rate_snapshot),
    fbpFeeRateSnapshot:
      row.fbp_fee_rate_snapshot == null ? null : Number(row.fbp_fee_rate_snapshot),
    payoutAmount: row.payout_amount == null ? null : Number(row.payout_amount),
    memo: row.memo ?? "",
  };
}

function mapImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    clientId: row.client_id,
    supplierId: row.supplier_id,
    fileName: row.file_name,
    fileStoragePath: row.file_storage_path ?? undefined,
    importedAt: row.imported_at,
    status: row.status,
    errors: (row.import_errors ?? []).map(mapImportError),
  };
}

function mapDeliveryDestination(row: DeliveryDestinationRow): DeliveryDestination {
  return {
    clientId: row.client_id,
    code: row.code,
    wholesalerName: row.wholesaler_name ?? undefined,
    name: row.name,
    postalCode: row.postal_code,
    address1: row.address1,
    address2: row.address2 ?? "",
    address3: row.address3 ?? "",
    tel: row.tel,
    aliases: row.aliases ?? [],
  };
}

function mapImportError(row: ImportErrorRow): ImportError {
  return {
    row: row.row_number ?? 0,
    field: row.field,
    message: row.message,
  };
}
