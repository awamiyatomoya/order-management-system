import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";

export const dynamic = "force-dynamic";

export default async function DeliveryDestinationsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initialData = await getOrderWorkbenchInitialData("deliveryDestinations");

  return (
    <OrderWorkbench
      initialData={initialData}
      view="deliveryDestinations"
      initialClientId={clientId}
    />
  );
}
