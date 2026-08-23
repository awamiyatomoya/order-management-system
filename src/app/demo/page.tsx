import { OrderWorkbench } from "@/components/order-workbench";
import { DEMO_BASE_PATH, getDemoOrderWorkbenchInitialData } from "@/lib/demo-data";
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

function resolveDemoView(viewQuery?: string) {
  if (!viewQuery || viewQuery === "/") {
    return VIEW_BY_QUERY.orders;
  }

  return VIEW_BY_QUERY[viewQuery.replace(/^\//, "")] ?? VIEW_BY_QUERY.orders;
}

export default async function DemoHomePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; view?: string }>;
}) {
  const { clientId, view } = await searchParams;
  const config = resolveDemoView(view);
  const initialData = getDemoOrderWorkbenchInitialData(config.scope);

  return (
    <OrderWorkbench
      initialData={initialData}
      view={config.view}
      initialClientId={clientId}
      basePath={DEMO_BASE_PATH}
    />
  );
}
