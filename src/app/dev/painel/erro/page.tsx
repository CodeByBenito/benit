"use client";

import { ErrorBoundaryScreen } from "@/components/layout/error-boundary-screen";

/** Development-only preview of the error state inside the panel. */
export default function DevPainelErro() {
  return (
    <div className="p-6 sm:p-10">
      <ErrorBoundaryScreen
        error={Object.assign(new Error("detalhe interno"), { digest: "1234567890" })}
        reset={() => {}}
        embedded
        title="Não deu para carregar esta tela."
        description="Pode ser a conexão. Tente de novo; os pedidos e os dados da loja continuam salvos."
        home={{ href: "/orders", label: "Ir para Pedidos" }}
      />
    </div>
  );
}
