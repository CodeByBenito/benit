import { expect, test } from "./helpers";

test.describe("identity and SEO", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name === "mobile", "HTTP-level checks; one project is enough");
  });

  test("robots.txt keeps private areas out and points at the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBe(true);
    const body = await res.text();
    for (const path of ["/dashboard", "/pedido", "/dev", "/settings", "/api"]) expect(body).toContain(`Disallow: ${path}`);
    expect(body).toMatch(/Allow: \/\n/);
    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("sitemap lists the landing and never a private route", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
    for (const path of ["/dashboard", "/pedido", "/dev", "/orders", "/settings"]) expect(body).not.toContain(`${path}<`);
    expect(body).not.toMatch(/\/(dashboard|pedido|dev)\//);
  });

  test("brand icons and share images render as PNG", async ({ request }) => {
    for (const path of ["/icon/32", "/icon/192", "/icon/512", "/apple-icon", "/opengraph-image", "/dev/og/loja"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toContain("image/png");
      const bytes = await res.body();
      expect(bytes.subarray(1, 4).toString(), path).toBe("PNG");
    }
  });

  test("landing exposes icons, manifest and Open Graph tags", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute("href", /\/icon\/32/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/apple-icon/);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "pt_BR");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  });
});

test.describe("response headers", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name === "mobile", "HTTP-level checks; one project is enough");
  });

  test("every page carries the security headers and hides the framework", async ({ request }) => {
    for (const path of ["/", "/login", "/dev/menu", "/termos"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"], path).toContain("geolocation=()");
      expect(headers["x-powered-by"], path).toBeUndefined();
    }
  });

  test("order pages never leak their secret address as a referrer", async ({ request }) => {
    const headers = (await request.get("/pedido/qualquer-token")).headers();
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("the image optimizer is not an open proxy", async ({ request }) => {
    const res = await request.get("/_next/image?url=" + encodeURIComponent("https://example.com/a.png") + "&w=640&q=75");
    expect(res.status()).toBe(400);
  });
});
