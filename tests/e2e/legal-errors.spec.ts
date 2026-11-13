import { expect, test } from "./helpers";

test.describe("legal pages", () => {
  test("privacy policy says what is collected, why, for how long and who to contact", async ({ page }) => {
    await page.goto("/privacidade");
    await expect(page.getByRole("heading", { level: 1, name: "Política de privacidade" })).toBeVisible();
    for (const section of ["Quem trata os seus dados", "Quais dados coletamos e para quê", "Por quanto tempo guardamos", "Seus direitos", "Encarregado e contato"]) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(section) })).toBeVisible();
    }
    await expect(page.getByRole("table", { name: "Dados de quem faz um pedido" })).toContainText("Endereço de entrega");
    await expect(page.getByRole("table", { name: "Prazos de retenção" })).toContainText("Marco Civil da Internet");
    await expect(page.getByText("Os dados do seu cartão nunca passam pelos servidores do BENIT.")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("templates are flagged for legal review and never invent company data", async ({ page }) => {
    for (const path of ["/privacidade", "/termos"]) {
      await page.goto(path);
      await expect(page.getByRole("note", { name: "Texto em revisão" })).toContainText("ainda sem revisão jurídica");
      const text = await page.locator("main").innerText();
      // No CNPJ-shaped number and no made-up e-mail while the fields are empty.
      expect(text, path).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
      expect(text, path).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text, path).toContain("CNPJ: a preencher");
    }
  });

  test("terms state that BENIT is a tool and never holds order money", async ({ page }) => {
    await page.goto("/termos");
    await expect(page.getByRole("heading", { level: 1, name: "Termos de uso" })).toBeVisible();
    await expect(page.getByText("O BENIT é uma ferramenta, não o vendedor.")).toBeVisible();
    await expect(page.getByText("o BENIT não recebe, não guarda e não repassa valores dos pedidos.")).toBeVisible();
    await page.locator("main").getByRole("link", { name: "Política de privacidade" }).click();
    await expect(page).toHaveURL(/\/privacidade$/);
  });

  test("landing footer and sign-up link to both documents", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Rodapé" });
    await expect(footer.getByRole("link", { name: "Termos" })).toHaveAttribute("href", "/termos");
    await expect(footer.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");

    await page.goto("/register");
    await expect(page.getByRole("link", { name: "Termos de uso" })).toHaveAttribute("href", "/termos");
    await expect(page.getByRole("link", { name: "Política de privacidade" })).toHaveAttribute("href", "/privacidade");
  });

  test("the public menu and the checkout point customers to the privacy policy", async ({ page }) => {
    await page.goto("/dev/menu");
    await expect(page.locator("main").getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
  });
});

test.describe("not found and error screens", () => {
  test("unknown address gets the branded 404 with a way out", async ({ page }) => {
    const response = await page.goto("/pagina-que-nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Esta página não existe." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir para o início" })).toHaveAttribute("href", "/");
  });

  test("an unknown menu explains it to the customer without panel links", async ({ page }) => {
    const response = await page.goto("/menu/loja-que-nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Não encontramos este cardápio." })).toBeVisible();
    await expect(page.getByRole("link", { name: /painel/i })).toHaveCount(0);
  });

  test("an invalid tracking link gets its own message", async ({ page }) => {
    const response = await page.goto("/pedido/nao-e-um-token");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Este link de pedido não vale." })).toBeVisible();
  });

  test("error screens offer a retry and never print the internal message", async ({ page }) => {
    await page.goto("/dev/erro");
    await expect(page.getByRole("heading", { level: 1, name: "Algo deu errado por aqui." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await expect(page.getByText("Código para o suporte: 1234567890")).toBeVisible();
    await expect(page.getByText("detalhe interno")).toHaveCount(0);

    await page.goto("/dev/painel/erro");
    await expect(page.getByRole("heading", { level: 1, name: "Não deu para carregar esta tela." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir para Pedidos" })).toHaveAttribute("href", "/orders");
  });
});

test.describe("kitchen ticket", () => {
  test("printing an order shows only the 80 mm ticket, without prices or contact data", async ({ page }) => {
    await page.goto("/dev/painel");
    await page.getByText("Marina Lopes").first().click();
    await expect(page.getByRole("button", { name: "Imprimir comanda" })).toBeVisible();

    await page.emulateMedia({ media: "print" });
    const visible = await page.evaluate(() => [...document.body.children].filter((el) => getComputedStyle(el).display !== "none").map((el) => el.className));
    expect(visible).toEqual(["print-ticket"]);
    const ticket = page.locator(".print-ticket");
    await expect(ticket).toContainText("#420");
    await expect(ticket).toContainText("2× Smash duplo");
    const text = await ticket.innerText();
    expect(text).not.toMatch(/R\$/);
    expect(text).not.toContain("Lopes");
    expect(text).not.toContain("98888");
    const width = await ticket.evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(width / 3.7795)).toBe(72); // 72 mm of content on 80 mm paper
  });
});
