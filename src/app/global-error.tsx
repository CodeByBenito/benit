"use client";

import { useEffect } from "react";

/**
 * Last resort: replaces the root layout when it fails, so it cannot use the
 * fonts, Tailwind classes or components of the app. Inline styles, brand palette.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", background: "#101010", color: "#F3F3F0", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <main style={{ maxWidth: 560, padding: "0 24px", margin: "0 auto" }}>
          <p style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#A1A1A1" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 8, background: "#FF6A00" }} />
            Erro
          </p>
          <h1 style={{ margin: "16px 0 0", fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.03em", fontWeight: 800 }}>O BENIT tropeçou.</h1>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.6, color: "#A1A1A1" }}>Não foi você. Tente de novo em instantes.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 32, height: 44, padding: "0 22px", border: 0, borderRadius: 12, background: "#FF6A00", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
          {error.digest ? <p style={{ marginTop: 32, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#6E6E6E" }}>Código para o suporte: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
