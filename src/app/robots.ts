import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** Private and transactional areas stay out of search engines. */
export const PRIVATE_PATHS = [
  "/dashboard",
  "/orders",
  "/menu-manager",
  "/inventory",
  "/customers",
  "/settings",
  "/onboarding",
  "/pedido",
  "/dev",
  "/api",
  "/auth",
  "/reset-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS.map((p) => `${p}/`).concat(PRIVATE_PATHS) }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
