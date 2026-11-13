import Link from "next/link";
import { StatusScreen } from "@/components/layout/status-screen";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <StatusScreen
      embedded
      code="404"
      title="Esta tela não existe no painel."
      description="O endereço pode estar errado ou o item foi removido."
      actions={
        <Button asChild>
          <Link href="/orders">Ir para Pedidos</Link>
        </Button>
      }
    />
  );
}
