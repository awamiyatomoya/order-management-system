import { OrderWorkbench } from "@/components/order-workbench";
import { getDemoOrderWorkbenchInitialData } from "@/lib/demo-data";
import type { OrderWorkbenchDataScope } from "@/lib/supabase/read-order-data";

const VIEW_CONFIG: Record<
  string,
  { view: Parameters<typeof OrderWorkbench>[0]["view"]; scope: OrderWorkbenchDataScope }
> = {
  "": { view: "orders", scope: "orders" },
  payouts: { view: "payouts", scope: "payouts" },
  clients: { view: "clients", scope: "clients" },
  products: { view: "products", scope: "products" },
  "delivery-destinations": { view: "deliveryDestinations", scope: "deliveryDestinations" },
  stores: { view: "stores", scope: "stores" },
  "store-introductions": { view: "storeIntroductions", scope: "storeIntroductions" },
  "sell-in": { view: "sellIn", scope: "sellIn" },
  "order-files": { view: "orderFiles", scope: "orderFiles" },
  history: { view: "history", scope: "history" },
};

export default async function DemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ clientId?: string; chain?: string }>;
}) {
  const { segments = [] } = await params;
  const { clientId, chain } = await searchParams;
  const segmentKey = segments.join("/");
  const config = VIEW_CONFIG[segmentKey] ?? VIEW_CONFIG[""];
  const initialData = getDemoOrderWorkbenchInitialData(config.scope);

  return (
    <OrderWorkbench
      initialData={initialData}
      view={config.view}
      initialClientId={clientId}
    />
  );
}
