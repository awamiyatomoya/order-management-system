import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";

export const dynamic = "force-dynamic";

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; chain?: string }>;
}) {
  const { clientId, chain } = await searchParams;
  const initialData = await getOrderWorkbenchInitialData("stores");

  return (
    <OrderWorkbench
      initialData={initialData}
      view="stores"
      initialClientId={clientId}
      initialStoreChain={chain}
    />
  );
}
