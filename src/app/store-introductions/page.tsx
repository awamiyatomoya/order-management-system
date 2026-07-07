import { OrderWorkbench } from "@/components/order-workbench";
import { getOrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";
import { readStoreIntroductionData } from "@/lib/supabase/store-introduction-actions";

export const dynamic = "force-dynamic";

export default async function StoreIntroductionsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const initialData = await getOrderWorkbenchInitialData("storeIntroductions");
  const resolvedClientId = clientId ?? initialData.clients[0]?.id ?? "";
  const introductionData = resolvedClientId
    ? await readStoreIntroductionData(resolvedClientId)
    : { imports: [], entries: [] };

  return (
    <OrderWorkbench
      initialData={{
        ...initialData,
        storeIntroductionImports: introductionData.imports,
        storeIntroductionEntries: introductionData.entries,
      }}
      view="storeIntroductions"
      initialClientId={clientId}
      initialStoreIntroductionClientId={resolvedClientId}
    />
  );
}
