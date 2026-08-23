import { OrderWorkbench } from "@/components/order-workbench";
import { SHARE_BASE_PATH, getDemoOrderWorkbenchInitialData } from "@/lib/demo-data";
import type { OrderWorkbenchDataScope } from "@/lib/supabase/read-order-data";

const VIEW_BY_QUERY: Record<
  string,
  { view: Parameters<typeof OrderWorkbench>[0]["view"]; scope: OrderWorkbenchDataScope }
> = {
  orders: { view: "orders", scope: "orders" },
  payouts: { view: "payouts", scope: "payouts" },
  clients: { view: "clients", scope: "clients" },
  products: { view: "products", scope: "products" },
  "delivery-destinations": { view: "deliveryDestinations", scope: "deliveryDestinations" },
  stores: { view: "stores", scope: "stores" },
  "store-introductions": { view: "storeIntroductions", scope: "storeIntroductions" },
  "sell-in": { view: "sellIn", scope: "sellIn" },
  "sell-out": { view: "sellOut", scope: "sellOut" },
  "sell-out/files": { view: "sellOutFiles", scope: "sellOutFiles" },
  "order-files": { view: "orderFiles", scope: "orderFiles" },
  history: { view: "history", scope: "history" },
};

function resolveShareView(viewQuery?: string) {
  if (!viewQuery || viewQuery === "/") {
    return VIEW_BY_QUERY.orders;
  }

  return VIEW_BY_QUERY[viewQuery.replace(/^\//, "")] ?? VIEW_BY_QUERY.orders;
}

/** 提出・共有用のダミーデータ画面（ログイン不要） */
export default async function ShareDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; view?: string }>;
}) {
  const { clientId, view } = await searchParams;
  const config = resolveShareView(view);
  const initialData = getDemoOrderWorkbenchInitialData(config.scope);

  return (
    <OrderWorkbench
      initialData={initialData}
      view={config.view}
      initialClientId={clientId}
      basePath={SHARE_BASE_PATH}
    />
  );
}
