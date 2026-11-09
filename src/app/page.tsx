import type { Metadata } from "next";
import { salesWhatsAppHref } from "@/components/landing/content";
import { SmoothScroll } from "@/components/landing/motion";
import { ScrollProgress } from "@/components/landing/fx";
import { SceneBand } from "@/components/landing/scene-band";
import { SceneChaos } from "@/components/landing/scene-chaos";
import { SceneClosing } from "@/components/landing/scene-closing";
import { SceneHero } from "@/components/landing/scene-hero";
import { SceneIncluded } from "@/components/landing/scene-included";
import { SceneMoney } from "@/components/landing/scene-money";
import { SceneOrderCrossing } from "@/components/landing/scene-order-crossing";
import { SceneThreeScreens } from "@/components/landing/scene-three-screens";
import { SiteHeader } from "@/components/landing/site-header";

export const metadata: Metadata = {
  title: { absolute: "BENIT — Sua operação. Sob controle." },
  description:
    "Cardápio digital, quadro de pedidos em tempo real, Pix na sua conta, entrega por bairro e estoque automático para restaurantes, hamburguerias e pizzarias.",
};

export default function LandingPage() {
  // Single call to action: talk to the BENIT team on WhatsApp. Falls back to sign-up until the number is set.
  const ctaHref = salesWhatsAppHref(process.env.NEXT_PUBLIC_SALES_WHATSAPP) ?? "/register";

  return (
    <SmoothScroll>
      <ScrollProgress />
      <SiteHeader ctaHref={ctaHref} />
      <main>
        <SceneHero ctaHref={ctaHref} />
        <SceneBand />
        <SceneChaos />
        <SceneOrderCrossing />
        <SceneThreeScreens />
        <SceneMoney />
        <SceneIncluded />
        <SceneClosing ctaHref={ctaHref} />
      </main>
    </SmoothScroll>
  );
}
