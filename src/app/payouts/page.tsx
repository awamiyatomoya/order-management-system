import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";

export const dynamic = "force-dynamic";

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initialData = await getOrderWorkbenchInitialData("payouts");

  return <OrderWorkbench initialData={initialData} view="payouts" initialClientId={clientId} />;
}
