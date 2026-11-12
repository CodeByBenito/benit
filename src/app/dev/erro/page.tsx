"use client";

import { ErrorBoundaryScreen } from "@/components/layout/error-boundary-screen";

/** Development-only preview of the full-page error screen (what error.tsx renders). */
export default function DevErro() {
  return <ErrorBoundaryScreen error={Object.assign(new Error("detalhe interno que nunca aparece na tela"), { digest: "1234567890" })} reset={() => {}} />;
}
