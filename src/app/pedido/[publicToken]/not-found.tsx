import { StatusScreen } from "@/components/layout/status-screen";

export default function TrackingNotFound() {
  return (
    <StatusScreen
      code="Pedido não encontrado"
      title="Este link de pedido não vale."
      description="Confira se o link está completo, do jeito que você recebeu. Se o problema continuar, fale com a loja em que você pediu."
      logoHref={null}
    />
  );
}
