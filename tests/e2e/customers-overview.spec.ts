import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

const names = (page: Page) => page.getByRole("button", { name: /^Ver / }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!.replace("Ver ", "")));

test.describe("customers (fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/painel/clientes");
    await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
  });

  test("lists customers by last order and re-sorts by spending and by orders", async ({ page }) => {
    expect((await names(page)).slice(0, 3)).toEqual(["Marina Lopes", "Rafael Souza", "Júlia Prado"]);
    expect((await names(page)).at(-1)).toBe("Bruno Lima");
    await page.getByRole("radio", { name: "Mais gastou" }).click();
    expect((await names(page)).slice(0, 2)).toEqual(["Júlia Prado", "Marina Lopes"]);
    await page.getByRole("radio", { name: "Mais pedidos" }).click();
    expect((await names(page)).slice(0, 3)).toEqual(["Júlia Prado", "Marina Lopes", "Ana Costa"]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("searches by name without accents and by phone digits", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Buscar cliente" });
    await search.fill("julia");
    expect(await names(page)).toEqual(["Júlia Prado"]);
    await search.fill("95555-4444");
    expect(await names(page)).toEqual(["Pedro Alves"]);
    await search.fill("ninguém");
    await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
  });

  test("detail shows totals, order history and the WhatsApp shortcut", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Chamar Marina Lopes no WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5511988887777\?text=Ol%C3%A1%2C%20Marina/);
    await page.getByRole("button", { name: "Ver Marina Lopes" }).click();
    const sheet = page.getByRole("dialog", { name: "Marina Lopes" });
    await expect(sheet.getByText("(11) 98888-7777")).toBeVisible();
    await expect(sheet.getByText("R$ 43,74")).toBeVisible(); // 612,40 / 14
    const history = sheet.getByRole("list", { name: "Pedidos do cliente" });
    await expect(history.getByRole("listitem")).toHaveCount(4);
    await expect(history.getByText("2× Smash duplo · 1× Batata rústica")).toBeVisible();
    await expect(history.getByText("Cancelado")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me\/5511988887777/);
    await expect(sheet.getByRole("link", { name: "Ligar" })).toHaveAttribute("href", "tel:11988887777");
  });

  test("empty state explains that customers are saved automatically", async ({ page }) => {
    await page.goto("/dev/painel/clientes?vazio=1");
    await expect(page.getByText("Seus clientes aparecem aqui")).toBeVisible();
  });
});

test.describe("overview (fixture)", () => {
  test("shows today's numbers, the 7-day chart, the queue and stock alerts", async ({ page }) => {
    await page.goto("/dev/painel/visao-geral");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Carla.");
    const kpis = page.getByRole("region", { name: "Indicadores de hoje" });
    await expect(kpis.getByText("Faturamento hoje")).toBeVisible();
    await expect(page.getByRole("list", { name: "Faturamento dos últimos 7 dias" }).getByRole("listitem")).toHaveCount(7);
    await expect(page.getByRole("region", { name: "Fila agora" })).toContainText("Novo2");
    await expect(page.getByRole("region", { name: "Estoque em alerta" })).toContainText("Veggie de grão-de-bico");
    await expect(page.getByRole("region", { name: "Estoque em alerta" })).toContainText("esgotado");
    await expect(page.getByRole("alert").filter({ hasText: "pagamento online" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("a new store sees the setup list and honest zeros", async ({ page }) => {
    await page.goto("/dev/painel/visao-geral?estado=novo");
    await expect(page.getByRole("heading", { name: "Deixe sua loja pronta para vender" })).toBeVisible();
    await expect(page.getByText("0/5 concluídos")).toBeVisible();
    await expect(page.getByRole("region", { name: "Indicadores de hoje" })).toContainText("R$ 0,00");
    await expect(page.getByText(/Nenhum pedido nos últimos dias/)).toBeVisible();
    await expect(page.getByText("Tudo abastecido.")).toBeVisible();
  });

  test("warns clearly when the Mercado Pago connection failed", async ({ page }) => {
    await page.goto("/dev/painel/visao-geral?estado=mp");
    const alert = page.getByRole("alert").filter({ hasText: "O pagamento online parou" });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("link", { name: "Reconectar agora" })).toHaveAttribute("href", "/settings?tab=payments");
  });
});

test.describe("payment health banner (fixture)", () => {
  test("every panel screen warns managers when the Mercado Pago token failed", async ({ page }) => {
    await page.goto("/dev/painel?mp=falhou");
    const banner = page.getByRole("alert").filter({ hasText: "Pagamento online parado" });
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("href", "/settings?tab=payments");
    await page.goto("/dev/painel");
    await expect(page.getByRole("alert").filter({ hasText: "Pagamento online parado" })).toHaveCount(0);
  });
});
