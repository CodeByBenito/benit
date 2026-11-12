import { StatusScreen } from "@/components/layout/status-screen";

/** A customer followed a menu link that is unpublished, renamed or mistyped. */
export default function MenuNotFound() {
  return (
    <StatusScreen
      code="Cardápio indisponível"
      title="Não encontramos este cardápio."
      description="A loja pode ter mudado o endereço do cardápio ou tirado ele do ar por enquanto. Peça o link atualizado para a loja, pelo WhatsApp ou pelo Instagram dela."
      logoHref={null}
    />
  );
}
