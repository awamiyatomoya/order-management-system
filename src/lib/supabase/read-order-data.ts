import {
  clients as mockClients,
  orders as mockOrders,
  products as mockProducts,
  suppliers as mockSuppliers,
} from "@/lib/mock-data";
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
  Supplier,
} from "@/lib/types";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

export type OrderWorkbenchInitialData = {
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  orders: Order[];
  importBatches: ImportBatch[];
  deliveryDestinations: DeliveryDestination[];
  source: "supabase" | "mock";
  message: string;
};

type ProductRow = {
  client_id: string;
  jan: string;
  internal_sku: string | null;
  cooola_code: string;
  name: string;
  wholesale_price: number | string;
  tax_rate: number | string;
  flags: Record<string, unknown> | null;
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
  status: "saved" | "blocked";
  imported_at: string;
  import_errors: ImportErrorRow[] | null;
};

type DeliveryDestinationRow = {
  client_id: string;
  code: string;
  name: string;
  postal_code: string;
  address1: string;
  address2: string | null;
  address3: string | null;
  tel: string;
  aliases: string[] | null;
};

export async function getOrderWorkbenchInitialData(): Promise<OrderWorkbenchInitialData> {
  if (!hasSupabaseServerEnv()) {
    return getMockInitialData("Supabase環境変数が未設定のため、サンプルデータを表示しています。");
  }

  try {
    const supabase = createServerSupabaseClient();
    const [clientsResult, suppliersResult, productsResult, ordersResult, importBatchesResult] =
      await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("suppliers").select("id, client_id, name, mapping_key").order("name"),
      supabase
        .from("products")
        .select("client_id, jan, internal_sku, cooola_code, name, wholesale_price, tax_rate, flags")
        .order("name"),
      supabase
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
          imported_at,
          order_lines (
            id,
            line_no,
            jan,
            qty,
            unit_price_snapshot,
            tax_rate_snapshot,
            amount,
            memo
          )
        `,
        )
        .order("imported_at", { ascending: false }),
      supabase
        .from("import_batches")
        .select(
          `
          id,
          client_id,
          supplier_id,
          file_name,
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
        .limit(20),
    ]);

    const firstError =
      clientsResult.error ??
      suppliersResult.error ??
      productsResult.error ??
      ordersResult.error ??
      importBatchesResult.error;

    if (firstError) {
      return getMockInitialData(
        `Supabase読み取りに失敗したため、サンプルデータを表示しています: ${firstError.message}`,
      );
    }

    const deliveryDestinations = await readDeliveryDestinations(supabase);

    return {
      clients: (clientsResult.data ?? []).map((client) => ({
        id: client.id,
        name: client.name,
      })),
      suppliers: ((suppliersResult.data ?? []) as SupplierRow[]).map(mapSupplier),
      products: ((productsResult.data ?? []) as ProductRow[]).map(mapProduct),
      orders: ((ordersResult.data ?? []) as OrderRow[]).map(mapOrder),
      importBatches: ((importBatchesResult.data ?? []) as ImportBatchRow[]).map(mapImportBatch),
      deliveryDestinations,
      source: "supabase",
      message: "Supabaseから読み取ったデータを表示しています。保存処理はまだ仮実装です。",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return getMockInitialData(
      `Supabase読み取りに失敗したため、サンプルデータを表示しています: ${message}`,
    );
  }
}

function getMockInitialData(message: string): OrderWorkbenchInitialData {
  return {
    clients: mockClients,
    suppliers: mockSuppliers,
    products: mockProducts,
    orders: mockOrders,
    importBatches: [],
    deliveryDestinations: staticDeliveryDestinations,
    source: "mock",
    message,
  };
}

async function readDeliveryDestinations(
  supabase: ReturnType<typeof createServerSupabaseClient>,
) {
  const { data, error } = await supabase
    .from("delivery_destinations")
    .select("client_id, code, name, postal_code, address1, address2, address3, tel, aliases")
    .order("code");

  if (error) {
    return staticDeliveryDestinations;
  }

  return [...staticDeliveryDestinations, ...((data ?? []) as DeliveryDestinationRow[]).map(mapDeliveryDestination)];
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    mappingKey: row.mapping_key,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    jan: row.jan,
    clientId: row.client_id,
    internalSku: row.internal_sku ?? "",
    cooolaCode: row.cooola_code,
    name: row.name,
    wholesalePrice: Number(row.wholesale_price),
    taxRate: Number(row.tax_rate),
    memo: typeof row.flags?.memo === "string" ? row.flags.memo : "",
  };
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
    memo: row.memo ?? "",
  };
}

function mapImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    clientId: row.client_id,
    supplierId: row.supplier_id,
    fileName: row.file_name,
    importedAt: row.imported_at,
    status: row.status,
    errors: (row.import_errors ?? []).map(mapImportError),
  };
}

function mapDeliveryDestination(row: DeliveryDestinationRow): DeliveryDestination {
  return {
    clientId: row.client_id,
    code: row.code,
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
