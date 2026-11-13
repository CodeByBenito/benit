"use client";

import { ErrorBoundaryScreen, type BoundaryProps } from "@/components/layout/error-boundary-screen";

export default function AuthError(props: BoundaryProps) {
  return <ErrorBoundaryScreen {...props} title="Não deu para abrir esta tela." home={{ href: "/login", label: "Ir para o login" }} />;
}
