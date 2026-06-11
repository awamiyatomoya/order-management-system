import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";

export const dynamic = "force-dynamic";

export default async function OrderFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initialData = await getOrderWorkbenchInitialData("orderFiles");

  return <OrderWorkbench initialData={initialData} view="orderFiles" initialClientId={clientId} />;
}
