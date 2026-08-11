import { Suspense } from "react";
import CreateEventClient from "./CreateEventClient";

export default function CreateCommunityEventPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Loading…</div>}>
      <CreateEventClient />
    </Suspense>
  );
}
