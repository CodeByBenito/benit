import type { NextConfig } from "next";

/**
 * Sent with every response. HSTS is left to the host (Vercel adds it on
 * custom domains). There is no Content-Security-Policy yet: the Mercado Pago
 * Card Payment Brick and Supabase Realtime need an allow-list that has to be
 * validated against the real sandbox first.
 */
const securityHeaders = [
  // Browsers must not guess content types (uploaded files, API answers).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nobody may embed the panel or the checkout in a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these device features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No `images.remotePatterns`: the app does not use next/image, and a wildcard
  // there would turn /_next/image into an open image proxy billed to us.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The address of an order page is a secret token: never send it to
        // another site as a referrer and never let it be indexed.
        source: "/pedido/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
