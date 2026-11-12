"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

export default function OnboardingError(props: BoundaryProps) {
  return (
    <ErrorBoundaryScreen
      {...props}
      title="Não deu para continuar a configuração."
      description="Nada foi perdido. Tente de novo em instantes."
      home={{ href: "/login", label: "Ir para o login" }}
    />
  );
}
