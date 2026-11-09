import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toast";
import { fontDisplay, fontMono, fontSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BENIT — Sua operação. Sob controle.",
    template: "%s | BENIT",
  },
  description:
    "Pedidos em tempo real, cardápio digital com pagamento online, entrega por bairro e estoque automático para negócios de alimentação.",
};

export const viewport: Viewport = {
  themeColor: "#101010",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-brand/30 selection:text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
