import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await getOrderWorkbenchInitialData();

  return <OrderWorkbench initialData={initialData} />;
}
