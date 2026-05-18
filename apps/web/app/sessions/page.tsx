import { Suspense } from "react";
import SessionsClient from "./SessionsClient";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading sessions…</div>}>
      <SessionsClient />
    </Suspense>
  );
}
