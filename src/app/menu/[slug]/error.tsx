"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

export default function MenuError(props: BoundaryProps) {
  return (
    <ErrorBoundaryScreen
      {...props}
      title="O cardápio não carregou."
      description="Pode ser a sua conexão. Tente de novo; a sua sacola fica guardada neste aparelho."
      home={null}
      logoHref={null}
    />
  );
}
