import { expect, test } from "./helpers";

test.describe("public menu (fixture store)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/menu");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("required option groups block adding until satisfied", async ({ page }) => {
    await page.getByRole("button", { name: /Smash duplo/ }).first().click();
    await page.getByRole("button", { name: /^Adicionar/ }).click();
    await expect(page.getByText("Faltam escolhas")).toBeVisible();
    await page.getByRole("radio", { name: /Ao ponto/ }).click();
    await page.getByRole("checkbox", { name: /Bacon/ }).click();
    await expect(page.getByRole("button", { name: /Adicionar.*40,90/ })).toBeVisible();
    await page.getByRole("button", { name: /^Adicionar/ }).click();
    await expect(page.getByRole("button", { name: /Ver sacola/ })).toContainText("40,90");
  });

  test("sold-out products cannot be opened", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Veggie de grão-de-bico/ })).toBeDisabled();
  });

  test("bag survives a reload and reaches the checkout form", async ({ page }) => {
    await page.getByRole("button", { name: /Batata rústica/ }).click();
    await page.getByRole("button", { name: /^Adicionar/ }).click();
    await page.reload();
    await page.getByRole("button", { name: /Ver sacola/ }).click();
    await expect(page.getByText("Sua sacola")).toBeVisible();
    await page.getByRole("button", { name: /Continuar/ }).click();
    await expect(page.getByText("Como você quer receber?")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Pix online/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Dinheiro/ })).toBeVisible();
  });
});

test.describe("order tracking (fixture)", () => {
  test("shows the live timeline", async ({ page }) => {
    await page.goto("/dev/pedido/preparing");
    await expect(page.getByRole("heading", { name: "Seu pedido está sendo preparado." })).toBeVisible();
    await expect(page.getByRole("list", { name: "Andamento do pedido" })).toBeVisible();
  });

  test("awaiting payment shows the Pix panel with copy button and countdown", async ({ page }) => {
    await page.goto("/dev/pedido/awaiting_payment");
    await expect(page.getByRole("heading", { name: "Falta só o pagamento." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copiar código Pix/ })).toBeVisible();
    await expect(page.getByText(/expira em \d\d:\d\d/)).toBeVisible();
  });
});

test.describe("dashboard (fixture)", () => {
  test("orders board shows columns, awaiting-payment strip and opens details", async ({ page }) => {
    await page.goto("/dev/painel");
    for (const col of ["Novos", "Confirmados", "Em preparo", "Prontos"]) {
      await expect(page.getByRole("region", { name: col })).toBeVisible();
    }
    await expect(page.getByText("Aguardando pagamento online:")).toBeVisible();
    await page.getByText("Marina Lopes").first().click();
    await expect(page.getByRole("link", { name: /Avisar Marina no WhatsApp/ })).toHaveAttribute("href", /wa\.me\/5511988887777/);
  });
});
