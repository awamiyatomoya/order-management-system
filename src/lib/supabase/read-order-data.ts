import {
  clients as mockClients,
  orders as mockOrders,
  products as mockProducts,
  suppliers as mockSuppliers,
} from "@/lib/mock-data";
import { calculatePayoutLineAmount } from "@/lib/import-orders";
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
].join(", ");

const productMasterExtraSelectColumns = [
  "client_id",
  "jan",
  ...productMasterExtraFields.map((field) => field.column),
].join(", ");

export type OrderWorkbenchInitialData = {
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  orders: Order[];
  importBatches: ImportBatch[];
  deliveryDestinations: DeliveryDestination[];
  stores: Store[];
  source: "supabase" | "mock" | "error";
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

export async function getOrderWorkbenchInitialData(): Promise<OrderWorkbenchInitialData> {
  if (!hasSupabaseServerEnv()) {
    if (isProductionRuntime()) {
      return getEmptyInitialData(
        "Supabase環境変数が未設定のため、データを表示できません。サンプルデータへの自動切り替えは無効です。",
      );
    }

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
        .select(productSelectColumns)
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
      if (isProductionRuntime()) {
        return getEmptyInitialData(
          `Supabase読み取りに失敗したため、データを表示できません。サンプルデータへの自動切り替えは無効です: ${firstError.message}`,
        );
      }

      return getMockInitialData(
        `Supabase読み取りに失敗したため、サンプルデータを表示しています: ${firstError.message}`,
      );
    }

    const [deliveryDestinations, stores] = await Promise.all([
      readDeliveryDestinations(supabase),
      readStores(supabase),
    ]);
    const clients = ((clientsResult.data ?? []) as ClientRow[]).map(mapClient);
    const products = ((productsResult.data ?? []) as unknown as ProductRow[]).map(mapProduct);
    const orders = ((ordersResult.data ?? []) as OrderRow[]).map(mapOrder);
    const importBatches = ((importBatchesResult.data ?? []) as ImportBatchRow[]).map(mapImportBatch);
    await attachClientFbpFeeRates(supabase, clients);
    await attachProductMasterExtraFields(supabase, products);
    await attachPayoutFields(supabase, products, orders);
    await backfillMissingPayoutSnapshots(supabase, clients, products, orders);
    await attachOrderFilePaths(supabase, orders, importBatches);
    await attachOrderFileUrls(supabase, orders, importBatches);

    return {
      clients,
      suppliers: ((suppliersResult.data ?? []) as SupplierRow[]).map(mapSupplier),
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

    if (isProductionRuntime()) {
      return getEmptyInitialData(
        `Supabase読み取りに失敗したため、データを表示できません。サンプルデータへの自動切り替えは無効です: ${message}`,
      );
    }

    return getMockInitialData(
      `Supabase読み取りに失敗したため、サンプルデータを表示しています: ${message}`,
    );
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
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

function getMockInitialData(message: string): OrderWorkbenchInitialData {
  return {
    clients: mockClients,
    suppliers: mockSuppliers,
    products: mockProducts,
    orders: mockOrders,
    importBatches: [],
    deliveryDestinations: staticDeliveryDestinations,
    stores: [],
    source: "mock",
    message,
  };
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
    .select("client_id, code, name, postal_code, address1, address2, address3, tel, aliases")
    .order("code");

  if (error) {
    return staticDeliveryDestinations;
  }

  const destinations = [
    ...staticDeliveryDestinations,
    ...((data ?? []) as DeliveryDestinationRow[]).map(mapDeliveryDestination),
  ];
  await attachWholesalerNames(supabase, destinations);

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

async function attachClientFbpFeeRates(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clients: Client[],
) {
  const { data, error } = await supabase.from("clients").select("id, fbp_fee_rate");

  if (error) {
    return;
  }

  const ratesByClientId = new Map(
    (
      (data ?? []) as {
        id: string;
        fbp_fee_rate: number | string | null;
      }[]
    ).map((row) => [row.id, row.fbp_fee_rate === null ? 0.08 : Number(row.fbp_fee_rate)]),
  );

  clients.forEach((client) => {
    client.fbpFeeRate = ratesByClientId.get(client.id) ?? client.fbpFeeRate;
  });
}

async function attachPayoutFields(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  products: Product[],
  orders: Order[],
) {
  const [productsResult, linesResult] = await Promise.all([
    supabase.from("products").select("client_id, jan, retail_price, payout_rate"),
    supabase
      .from("order_lines")
      .select("id, retail_price_snapshot, payout_rate_snapshot, fbp_fee_rate_snapshot, payout_amount"),
  ]);

  if (!productsResult.error) {
    const payoutFieldsByProduct = new Map(
      (
        (productsResult.data ?? []) as {
          client_id: string;
          jan: string;
          retail_price: number | string | null;
          payout_rate: number | string | null;
        }[]
      ).map((row) => [
        `${row.client_id}:${row.jan}`,
        {
          retailPrice: row.retail_price === null ? null : Number(row.retail_price),
          payoutRate: row.payout_rate === null ? null : Number(row.payout_rate),
        },
      ]),
    );

    products.forEach((product) => {
      const payoutFields = payoutFieldsByProduct.get(`${product.clientId}:${product.jan}`);

      if (payoutFields) {
        product.retailPrice = payoutFields.retailPrice;
        product.payoutRate = payoutFields.payoutRate;
      }
    });
  }

  if (!linesResult.error) {
    const payoutFieldsByLine = new Map(
      (
        (linesResult.data ?? []) as {
          id: string;
          retail_price_snapshot: number | string | null;
          payout_rate_snapshot: number | string | null;
          fbp_fee_rate_snapshot: number | string | null;
          payout_amount: number | string | null;
        }[]
      ).map((row) => [
        row.id,
        {
          retailPriceSnapshot:
            row.retail_price_snapshot === null ? null : Number(row.retail_price_snapshot),
          payoutRateSnapshot:
            row.payout_rate_snapshot === null ? null : Number(row.payout_rate_snapshot),
          fbpFeeRateSnapshot:
            row.fbp_fee_rate_snapshot === null ? null : Number(row.fbp_fee_rate_snapshot),
          payoutAmount: row.payout_amount === null ? null : Number(row.payout_amount),
        },
      ]),
    );

    orders.forEach((order) => {
      order.lines.forEach((line) => {
        const payoutFields = payoutFieldsByLine.get(line.id);

        if (payoutFields) {
          line.retailPriceSnapshot = payoutFields.retailPriceSnapshot;
          line.payoutRateSnapshot = payoutFields.payoutRateSnapshot;
          line.fbpFeeRateSnapshot = payoutFields.fbpFeeRateSnapshot;
          line.payoutAmount = payoutFields.payoutAmount;
        }
      });
    });
  }
}

async function attachProductMasterExtraFields(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  products: Product[],
) {
  const { data, error } = await supabase.from("products").select(productMasterExtraSelectColumns);

  if (error) {
    return;
  }

  const extraFieldsByProduct = new Map(
    ((data ?? []) as unknown as ProductRow[]).map((row) => [
      `${row.client_id}:${row.jan}`,
      Object.fromEntries(
        productMasterExtraFields.map((field) => [
          field.key,
          normalizeProductMasterField(row[field.column]),
        ]),
      ),
    ]),
  );

  products.forEach((product) => {
    const extraFields = extraFieldsByProduct.get(`${product.clientId}:${product.jan}`);

    if (extraFields) {
      Object.assign(product, extraFields);
    }
  });
}

async function backfillMissingPayoutSnapshots(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clients: Client[],
  products: Product[],
  orders: Order[],
) {
  const productsByKey = new Map(products.map((product) => [`${product.clientId}:${product.jan}`, product]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const updates: PromiseLike<{ error: { message: string } | null }>[] = [];

  orders
    .filter((order) => order.status === "confirmed" || order.status === "shipped")
    .forEach((order) => {
      const client = clientsById.get(order.clientId);
      const fbpFeeRate = client?.fbpFeeRate ?? 0.08;

      order.lines.forEach((line) => {
        if (
          line.retailPriceSnapshot !== null &&
          line.payoutRateSnapshot !== null &&
          line.fbpFeeRateSnapshot !== null &&
          line.payoutAmount !== null
        ) {
          return;
        }

        const product = productsByKey.get(`${order.clientId}:${line.jan}`);
        if (!product || product.retailPrice === null || product.payoutRate === null) {
          return;
        }

        const payoutAmount = calculatePayoutLineAmount({
          qty: line.qty,
          retailPrice: product.retailPrice,
          payoutRate: product.payoutRate,
          fbpFeeRate,
        });

        if (payoutAmount === null) {
          return;
        }

        line.retailPriceSnapshot = product.retailPrice;
        line.payoutRateSnapshot = product.payoutRate;
        line.fbpFeeRateSnapshot = fbpFeeRate;
        line.payoutAmount = payoutAmount;
        updates.push(
          supabase
            .from("order_lines")
            .update({
              retail_price_snapshot: product.retailPrice,
              payout_rate_snapshot: product.payoutRate,
              fbp_fee_rate_snapshot: fbpFeeRate,
              payout_amount: payoutAmount,
            })
            .eq("client_id", order.clientId)
            .eq("id", line.id),
        );
      });
    });

  const results = await Promise.all(updates);
  const firstError = results.find((result) => result.error)?.error;

  if (firstError) {
    console.warn("Failed to backfill payout snapshots:", firstError.message);
  }
}

async function attachOrderFilePaths(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  orders: Order[],
  importBatches: ImportBatch[],
) {
  const [orderPathsResult, batchPathsResult] = await Promise.all([
    supabase.from("orders").select("id, source_file_path"),
    supabase.from("import_batches").select("id, file_storage_path"),
  ]);

  if (!orderPathsResult.error) {
    const pathsByOrderId = new Map(
      ((orderPathsResult.data ?? []) as { id: string; source_file_path: string | null }[]).map(
        (row) => [row.id, row.source_file_path],
      ),
    );
    orders.forEach((order) => {
      order.sourceFilePath = pathsByOrderId.get(order.id) ?? undefined;
    });
  }

  if (!batchPathsResult.error) {
    const pathsByBatchId = new Map(
      ((batchPathsResult.data ?? []) as { id: string; file_storage_path: string | null }[]).map(
        (row) => [row.id, row.file_storage_path],
      ),
    );
    importBatches.forEach((batch) => {
      batch.fileStoragePath = pathsByBatchId.get(batch.id) ?? undefined;
    });
  }
}

async function attachOrderFileUrls(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  orders: Order[],
  importBatches: ImportBatch[],
) {
  const paths = Array.from(
    new Set(
      [
        ...orders.map((order) => order.sourceFilePath),
        ...importBatches.map((batch) => batch.fileStoragePath),
      ].filter((path): path is string => Boolean(path)),
    ),
  );

  if (paths.length === 0) {
    return;
  }

  const urlsByPath = new Map<string, string>();
  await Promise.all(
    paths.map(async (path) => {
      const { data } = await supabase.storage.from("order-files").createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) {
        urlsByPath.set(path, data.signedUrl);
      }
    }),
  );

  orders.forEach((order) => {
    if (order.sourceFilePath) {
      order.sourceFileUrl = urlsByPath.get(order.sourceFilePath);
    }
  });
  importBatches.forEach((batch) => {
    if (batch.fileStoragePath) {
      batch.fileUrl = urlsByPath.get(batch.fileStoragePath);
    }
  });
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

async function attachWholesalerNames(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  destinations: DeliveryDestination[],
) {
  const { data, error } = await supabase
    .from("delivery_destinations")
    .select("client_id, code, wholesaler_name");

  if (error) {
    return;
  }

  const namesByKey = new Map(
    ((data ?? []) as { client_id: string; code: string; wholesaler_name: string | null }[]).map(
      (row) => [`${row.client_id}:${row.code}`, row.wholesaler_name ?? ""],
    ),
  );

  destinations.forEach((destination) => {
    if (!destination.clientId) {
      destination.wholesalerName = inferWholesalerName(destination);
      return;
    }

    destination.wholesalerName =
      namesByKey.get(`${destination.clientId}:${destination.code}`) ||
      destination.wholesalerName ||
      inferWholesalerName(destination);
  });
}

function inferWholesalerName(destination: DeliveryDestination) {
  const text = [destination.code, destination.name, ...destination.aliases].join(" ");

  if (/大山|オオヤマ|ｵｵﾔﾏ/i.test(text)) {
    return "大山";
  }

  return "";
}

function mapImportError(row: ImportErrorRow): ImportError {
  return {
    row: row.row_number ?? 0,
    field: row.field,
    message: row.message,
  };
}
