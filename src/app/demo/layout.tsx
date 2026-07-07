export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed top-0 right-0 left-0 z-[60] border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
        <strong>デモモード</strong> — 表示データはすべて架空のサンプルです（クライアント名・店舗名等をマスキング済み）
      </div>
      <div className="pt-10">{children}</div>
    </>
  );
}
