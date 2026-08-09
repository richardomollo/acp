import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function PesapalCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}
