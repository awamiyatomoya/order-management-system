import { OrderWorkbench } from "@/components/order-workbench";
import { SHARE_BASE_PATH, getDemoOrderWorkbenchInitialData } from "@/lib/demo-data";

/** 提出・共有用のダミーデータ画面（ログイン不要） */
export default async function ShareDemoPage({
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
      basePath={SHARE_BASE_PATH}
    />
  );
}
