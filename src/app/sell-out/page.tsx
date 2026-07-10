import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";
import { readSelloutData } from "@/lib/supabase/sellout-actions";

export const dynamic = "force-dynamic";

export default async function SellOutPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initialData = await getOrderWorkbenchInitialData("sellOut");
  const resolvedClientId = clientId ?? initialData.clients[0]?.id ?? "";
  const selloutData = resolvedClientId
    ? await readSelloutData(resolvedClientId)
    : { imports: [], entries: [] };

  return (
    <OrderWorkbench
      initialData={{
        ...initialData,
        selloutImports: selloutData.imports,
        selloutEntries: selloutData.entries,
      }}
      view="sellOut"
      initialClientId={clientId}
      initialSelloutClientId={resolvedClientId}
    />
  );
}
