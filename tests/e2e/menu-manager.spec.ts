import { expect, test, type Locator } from "@playwright/test";

const productNames = (section: Locator) => section.getByRole("button", { name: /^Editar (?!categoria)/ }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!.replace("Editar ", "")));

test.describe("menu manager (fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/painel/cardapio");
    await expect(page.getByRole("heading", { level: 1, name: "Cardápio" })).toBeVisible();
  });

  test("lists products by category, including hidden and uncategorized ones", async ({ page }) => {
    for (const name of ["Burgers", "Porções", "Bebidas", "Sobremesas", "Sem categoria"]) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
    expect(await productNames(page.getByRole("region", { name: "Burgers" }))).toEqual(["Smash duplo", "Smash simples", "Veggie de grão-de-bico"]);
    await expect(page.getByRole("region", { name: "Sobremesas" }).getByText("Oculta")).toBeVisible();
    await expect(page.getByRole("region", { name: "Burgers" }).getByText("esgotado")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("availability switch answers at once", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Smash simples disponível" });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText("Smash simples pausado.")).toBeVisible();
    await expect(page.getByText(/2 pausados/)).toBeVisible();
  });

  test("reorders products with the keyboard", async ({ page }) => {
    const burgers = page.getByRole("region", { name: "Burgers" });
    const handle = burgers.getByRole("button", { name: "Reordenar Smash duplo" });
    await handle.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect.poll(() => productNames(burgers)).toEqual(["Smash simples", "Smash duplo", "Veggie de grão-de-bico"]);
  });

  test("reorders categories with the keyboard", async ({ page }) => {
    const handle = page.getByRole("button", { name: "Reordenar categoria Burgers" });
    await handle.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect
      .poll(() => page.getByRole("region").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).filter((n) => ["Burgers", "Porções"].includes(n ?? ""))))
      .toEqual(["Porções", "Burgers"]);
  });

  test("search filters the list and turns dragging off", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Buscar produto" }).fill("smash");
    await expect(page.getByRole("region", { name: "Burgers" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Bebidas" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Reordenar/ })).toHaveCount(0);
    await expect(page.getByText("Para arrastar e reordenar, limpe a busca e o filtro.")).toBeVisible();

    await page.getByRole("searchbox", { name: "Buscar produto" }).fill("");
    await page.getByRole("radio", { name: "Pausados" }).click();
    await expect(page.getByRole("button", { name: "Editar Onion rings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar Smash duplo" })).toHaveCount(0);
  });

  test("edits a product and its add-on groups inline", async ({ page }) => {
    await page.getByRole("button", { name: "Editar Smash duplo" }).click();
    const sheet = page.getByRole("dialog", { name: "Editar produto" });
    await expect(sheet.getByLabel("Nome", { exact: true })).toHaveValue("Smash duplo");
    await expect(sheet.getByLabel("Preço", { exact: true })).toHaveValue("34,90");
    await expect(sheet.getByLabel("Nome do grupo").first()).toHaveValue("Ponto da carne");
    await expect(sheet.getByText("42 un")).toBeVisible();

    // A group whose maximum exceeds its options is refused before saving.
    await sheet.getByRole("button", { name: "Novo grupo" }).click();
    await sheet.getByLabel("Nome do grupo").last().fill("Molhos");
    await sheet.getByLabel("Máximo de escolhas em Molhos").fill("3");
    await sheet.getByLabel("Nome da opção 1 de Molhos").fill("Barbecue");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByRole("alert")).toContainText("o máximo (3) é maior que o número de opções (1)");

    await sheet.getByLabel("Máximo de escolhas em Molhos").fill("1");
    await sheet.getByLabel("Preço da opção Barbecue").fill("2,5");
    await sheet.getByLabel("Preço", { exact: true }).fill("36,90");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Produto salvo.")).toBeVisible();
    const row = page.getByRole("button", { name: "Editar Smash duplo" });
    await expect(row).toContainText("36,90");
    await expect(row).toContainText("3 grupos de adicionais");
  });

  test("creates a product inside a category and a new category", async ({ page }) => {
    await page.getByRole("button", { name: "Adicionar produto em Bebidas" }).click();
    const sheet = page.getByRole("dialog", { name: "Novo produto" });
    await sheet.getByRole("button", { name: "Criar produto" }).click();
    await expect(sheet.getByRole("alert")).toContainText("Dê um nome ao produto.");
    await sheet.getByLabel("Nome", { exact: true }).fill("Chá gelado");
    await sheet.getByLabel("Preço", { exact: true }).fill("8,50");
    await sheet.getByRole("button", { name: "Criar produto" }).click();
    await expect(sheet).toBeHidden();
    expect(await productNames(page.getByRole("region", { name: "Bebidas" }))).toEqual(["Limonada da casa", "Refrigerante lata", "Chá gelado"]);

    await page.getByRole("button", { name: "Nova categoria" }).click();
    const dialog = page.getByRole("dialog", { name: "Nova categoria" });
    await dialog.getByLabel("Nome").fill("Combos");
    await dialog.getByRole("button", { name: "Criar categoria" }).click();
    await expect(page.getByRole("region", { name: "Combos" })).toBeVisible();
  });

  test("deleting a category keeps its products", async ({ page }) => {
    await page.getByRole("button", { name: "Excluir categoria Porções" }).click();
    await page.getByRole("dialog", { name: /Excluir a categoria Porções/ }).getByRole("button", { name: "Excluir categoria" }).click();
    await expect(page.getByRole("region", { name: "Porções" })).toHaveCount(0);
    expect(await productNames(page.getByRole("region", { name: "Sem categoria" }))).toEqual(expect.arrayContaining(["Batata rústica", "Onion rings", "Molho da casa (pote)"]));
  });

  test("empty store gets a first step", async ({ page }) => {
    await page.goto("/dev/painel/cardapio?vazio=1");
    await expect(page.getByText("Seu cardápio começa aqui")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar primeira categoria" })).toBeVisible();
  });
});
