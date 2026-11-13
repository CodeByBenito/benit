"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

export default function RootError(props: BoundaryProps) {
  return <ErrorBoundaryScreen {...props} />;
}
