"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

export default function TrackingError(props: BoundaryProps) {
  return (
    <ErrorBoundaryScreen
      {...props}
      title="Não deu para mostrar o seu pedido."
      description="O pedido continua valendo. Tente de novo em instantes ou fale com a loja."
      home={null}
      logoHref={null}
    />
  );
}
