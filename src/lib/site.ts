/**
 * Canonical site origin, used by metadata (metadataBase, Open Graph),
 * robots.txt and the sitemap.
 *
 * Order: the configured public URL, then the domain Vercel assigns to the
 * deployment (so previews produce working absolute URLs), then localhost.
 */
export function siteUrl(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return new URL(url.origin);
    } catch {
      // Malformed value: try the next candidate.
    }
  }
  return new URL("http://localhost:3000");
}

/** Absolute URL for a path on this site. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl()).toString();
}

/** Where every e-mail link lands, carrying the destination after sign-in. */
export function authCallbackUrl(next: string): string {
  return absoluteUrl(`/auth/callback?next=${encodeURIComponent(next)}`);
}

export const SITE_NAME = "BENIT";
export const SITE_TAGLINE = "Sua operação. Sob controle.";
export const SITE_DESCRIPTION =
  "Pedidos em tempo real, cardápio digital com pagamento online, entrega por bairro e estoque automático para negócios de alimentação.";
