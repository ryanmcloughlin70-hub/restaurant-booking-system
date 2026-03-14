import { Suspense } from "react";
import PrintPageClient from "./PrintPageClient";

export default function PrintPage() {
  return (
    <Suspense fallback={<div>Loading print page...</div>}>
      <PrintPageClient />
    </Suspense>
  );
}