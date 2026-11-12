import { expect, test, type Page } from "@playwright/test";

/** A real, decodable PNG produced by the browser itself. */
async function makePng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "#FF6A00");
      gradient.addColorStop(1, "#101010");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height]
  );
  return Buffer.from(base64, "base64");
}

test.describe("settings: store tab (fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/painel/configuracoes?tab=loja");
    await expect(page.getByRole("heading", { name: "Identidade" })).toBeVisible();
  });

  test("logo upload opens the square crop and shows the cropped preview", async ({ page }) => {
    await page.getByLabel("Enviar logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await makePng(page, 900, 600) });
    const dialog = page.getByRole("dialog", { name: "Ajuste o logo" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Aproximar" }).click();
    await dialog.getByRole("img", { name: /Área de recorte/ }).press("ArrowLeft");
    await dialog.getByRole("button", { name: "Usar este recorte" }).click();
    await expect(dialog).toBeHidden();

    const preview = page.getByAltText("Logo atual da loja");
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`)).toBe("512x512");
    await expect(page.getByRole("button", { name: "Remover" })).toBeVisible();
  });

  test("cover upload crops to the menu header proportion", async ({ page }) => {
    await page.getByLabel("Enviar capa").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: await makePng(page, 1000, 1000) });
    await page.getByRole("dialog", { name: "Ajuste a capa" }).getByRole("button", { name: "Usar este recorte" }).click();
    const preview = page.getByAltText("Capa atual do cardápio");
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`)).toBe("1600x600");
  });

  test("rejects files over 2 MB and unsupported formats", async ({ page }) => {
    await page.getByLabel("Enviar logo").setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
    await expect(page.getByText("A imagem precisa ter no máximo 2 MB.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByLabel("Enviar capa").setInputFiles({ name: "anim.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(page.getByText("Envie uma imagem JPG, PNG ou WebP.")).toBeVisible();
  });

  test("warns before a slug change breaks the old link, and has no horizontal overflow", async ({ page }) => {
    await page.getByLabel("Identificador").fill("Smash da Vila 2");
    await expect(page.getByLabel("Identificador")).toHaveValue("smash-da-vila-2");
    await expect(page.getByText(/o link antigo \(\/menu\/smash-da-vila\) para de funcionar/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
