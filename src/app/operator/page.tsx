import { Suspense } from "react";
import { OperatorSelectionScreen } from "@/components/operator-selection-screen";

export default function OperatorPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <OperatorSelectionScreen />
    </Suspense>
  );
}
