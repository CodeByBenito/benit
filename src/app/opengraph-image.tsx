import { ImageResponse } from "next/og";
import { BRAND, OG_SIZE, Wordmark, brandFonts } from "@/lib/brand/image";

export const runtime = "edge";

export const alt = "BENIT — Sua operação. Sob controle.";
export const size = OG_SIZE;
export const contentType = "image/png";

const STAGES = ["Novos", "Confirmados", "Em preparo", "Prontos"];

/** Share image for the landing (and the default for every page without its own). */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          background: BRAND.bg,
          backgroundImage: "radial-gradient(circle at 0% 100%, rgba(255,106,0,0.22), rgba(255,106,0,0) 55%)",
          color: BRAND.text,
          fontFamily: "Inter",
        }}
      >
        <Wordmark size={64} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 118,
              lineHeight: 0.95,
              letterSpacing: -5,
            }}
          >
            <span>Sua operação.</span>
            <div style={{ display: "flex" }}>
              <span>Sob controle</span>
              <span style={{ color: BRAND.orange }}>.</span>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 30, color: BRAND.muted }}>
            Cardápio digital, pedidos em tempo real, estoque e Pix num só quadro.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {STAGES.map((stage, i) => (
            <div
              key={stage}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 22px",
                borderRadius: 999,
                fontSize: 24,
                border: `1px solid ${i === 0 ? BRAND.orange : BRAND.border}`,
                background: i === 0 ? "rgba(255,106,0,0.14)" : BRAND.surface,
                color: i === 0 ? BRAND.text : BRAND.muted,
              }}
            >
              {i === 0 ? <div style={{ width: 12, height: 12, borderRadius: 12, background: BRAND.orange }} /> : null}
              <span>{stage}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: await brandFonts() }
  );
}
