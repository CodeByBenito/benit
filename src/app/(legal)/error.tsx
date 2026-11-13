"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

export default function LegalError(props: BoundaryProps) {
  return <ErrorBoundaryScreen {...props} />;
}
