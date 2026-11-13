import { expect, test } from "./helpers";

test.describe("inventory (fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/painel/estoque");
    await expect(page.getByRole("heading", { level: 1, name: "Estoque" })).toBeVisible();
  });

  const names = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: /^Ver histórico de / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!.replace("Ver histórico de ", "")));

  test("shows what needs buying first, with a level meter per product", async ({ page }) => {
    expect((await names(page)).slice(0, 3)).toEqual(["Veggie de grão-de-bico", "Refrigerante lata", "Batata rústica"]);
    const meter = page.getByRole("meter", { name: "Nível de Refrigerante lata" });
    await expect(meter).toHaveAttribute("aria-valuenow", "3");
    await expect(meter).toHaveAttribute("aria-valuetext", "3 em estoque, mínimo 12: Abaixo do mínimo");
    await expect(page.getByRole("region", { name: "Resumo do estoque" })).toContainText("Abaixo do mínimo3");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("filters below minimum and sold out", async ({ page }) => {
    await page.getByRole("radio", { name: "Abaixo do mínimo" }).click();
    expect(await names(page)).toEqual(["Veggie de grão-de-bico", "Refrigerante lata", "Batata rústica"]);
    await page.getByRole("radio", { name: "Esgotados" }).click();
    expect(await names(page)).toEqual(["Veggie de grão-de-bico"]);
    await page.getByRole("radio", { name: "Todos" }).click();
    await page.getByRole("searchbox", { name: "Buscar produto no estoque" }).fill("sv-005");
    expect(await names(page)).toEqual(["Onion rings"]);
  });

  test("quick entry updates the quantity", async ({ page }) => {
    await page.getByRole("button", { name: "Entrada de Refrigerante lata" }).click();
    const dialog = page.getByRole("dialog", { name: "Refrigerante lata" });
    await expect(dialog.getByText("Em estoque agora: 3 un.")).toBeVisible();
    await dialog.getByRole("button", { name: "+10" }).click();
    await dialog.getByRole("button", { name: "+10" }).click();
    await expect(dialog.getByLabel("Quantidade que entrou")).toHaveValue("21");
    await expect(dialog.getByText("Vai ficar com 24 un")).toBeVisible();
    await dialog.getByRole("button", { name: "Compra", exact: true }).click();
    await dialog.getByRole("button", { name: "Lançar entrada" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Refrigerante lata: 3 → 24 un")).toBeVisible();
    await expect(page.getByRole("meter", { name: "Nível de Refrigerante lata" })).toHaveAttribute("aria-valuenow", "24");
    await expect(page.getByRole("region", { name: "Resumo do estoque" })).toContainText("Abaixo do mínimo2");
  });

  test("an exit cannot exceed what is in stock and server errors are shown", async ({ page }) => {
    await page.getByRole("button", { name: "Saída de Batata rústica" }).click();
    const dialog = page.getByRole("dialog", { name: "Batata rústica" });
    await dialog.getByLabel("Quantidade que saiu").fill("9");
    await expect(dialog.getByText("Só há 6 em estoque.")).toBeVisible();
    await dialog.getByRole("button", { name: "Lançar saída" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Só há 6 em estoque.");

    await dialog.getByLabel("Quantidade que saiu").fill("2");
    await dialog.getByLabel("Motivo (opcional)").fill("falha");
    await dialog.getByRole("button", { name: "Lançar saída" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Prévia: erro simulado ao lançar.");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("meter", { name: "Nível de Batata rústica" })).toHaveAttribute("aria-valuenow", "6");
  });

  test("sold-out products have no exit; untracked ones start with a count", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Saída de Veggie de grão-de-bico" })).toBeDisabled();
    await page.getByRole("button", { name: "Começar a controlar Limonada da casa" }).click();
    const dialog = page.getByRole("dialog", { name: "Limonada da casa" });
    await expect(dialog.getByRole("radio", { name: "Entrada" })).toBeDisabled();
    await dialog.getByLabel("Quantidade contada").fill("30");
    await dialog.getByRole("button", { name: "Salvar contagem" }).click();
    await expect(page.getByRole("meter", { name: "Nível de Limonada da casa" })).toHaveAttribute("aria-valuenow", "30");
  });

  test("opens the movement history of one product", async ({ page }) => {
    await page.getByRole("button", { name: "Ver histórico de Smash duplo" }).click();
    const sheet = page.getByRole("dialog", { name: "Smash duplo" });
    await expect(sheet.getByText("un · mínimo 10")).toBeVisible();
    await expect(sheet.getByRole("listitem")).toHaveCount(3);
    await expect(sheet.getByText("Compra da semana")).toBeVisible();
    await expect(sheet.getByText("Estoque inicial no cadastro do produto")).toBeVisible();
    await expect(sheet.getByText("Batata rústica")).toHaveCount(0);

    await sheet.getByRole("button", { name: "Corrigir pela contagem" }).click();
    await expect(page.getByRole("dialog", { name: "Smash duplo" }).getByLabel("Quantidade contada")).toHaveValue("42");
  });
});
