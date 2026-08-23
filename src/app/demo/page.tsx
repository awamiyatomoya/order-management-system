import { OrderWorkbench } from "@/components/order-workbench";
import { DEMO_BASE_PATH, getDemoOrderWorkbenchInitialData } from "@/lib/demo-data";

export default async function DemoHomePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initialData = getDemoOrderWorkbenchInitialData("orders");

  return (
    <OrderWorkbench
      initialData={initialData}
      view="orders"
      initialClientId={clientId}
      basePath={DEMO_BASE_PATH}
    />
  );
}
