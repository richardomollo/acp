export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AppRedirectClient from "./AppRedirectClient";

export default function AppRedirectPage() {
  return (
    <Suspense>
      <AppRedirectClient />
    </Suspense>
  );
}
