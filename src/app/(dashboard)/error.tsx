"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

/** Renders inside the panel shell, so the menu stays usable. */
export default function DashboardError(props: BoundaryProps) {
  return (
    <ErrorBoundaryScreen
      {...props}
      embedded
      title="Não deu para carregar esta tela."
      description="Pode ser a conexão. Tente de novo; os pedidos e os dados da loja continuam salvos."
      home={{ href: "/orders", label: "Ir para Pedidos" }}
    />
  );
}
