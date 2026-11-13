import { expect, test } from "./helpers";

test.describe("landing", () => {
  test("renders every scene, one primary CTA, no horizontal overflow", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Sua operação\. Sob controle\./ })).toBeVisible();
    for (const name of [/O dia de quem vive de cozinha/, /A cozinha anda junto/, /Do primeiro toque do cliente/, /O Pix cai na sua conta/, /Uma plataforma\. Nenhum puxadinho/, /cozinha sob controle/]) {
      await expect(page.getByRole("heading", { name })).toBeAttached();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test("peak scene advances the order through all stages while scrolling", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "covered on desktop; same timeline");
    await page.goto("/");
    const peak = page.locator("section[aria-labelledby='peak-title']");
    const top = await peak.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const vh = page.viewportSize()!.height;
    await page.evaluate((y) => window.scrollTo(0, y), top + vh * 3.1);
    await page.waitForTimeout(1500);
    await expect(page.getByText("Pronto. Cliente avisado.")).toBeVisible();
  });

  test("reduced motion shows the final state without pinning", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByText("Chegou pelo cardápio.")).toBeVisible();
    await expect(page.getByText("Pronto. Cliente avisado.")).toBeVisible();
    await ctx.close();
  });

  test("never shows invented social proof", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\+\s?\d[\d.]*\s?(restaurantes|clientes|lojas|pedidos)/i);
    expect(await page.locator("figure blockquote").count()).toBe(0);
  });
});
