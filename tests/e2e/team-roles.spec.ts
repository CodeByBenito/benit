import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

/** The sidebar is a drawer on mobile. */
async function panelNav(page: Page) {
  const opener = page.getByRole("button", { name: "Abrir menu" });
  if (await opener.isVisible()) await opener.click();
  return page.getByRole("navigation", { name: "Painel" }).last();
}

test.describe("roles in the panel (fixture)", () => {
  test("owner sees every area", async ({ page }) => {
    await page.goto("/dev/painel");
    const nav = await panelNav(page);
    for (const label of ["Visão geral", "Pedidos", "Cardápio", "Estoque", "Clientes", "Configurações"]) {
      await expect(nav.getByRole("link", { name: new RegExp(label) })).toBeVisible();
    }
  });

  test("attendant sees only orders and customers", async ({ page }) => {
    await page.goto("/dev/painel?role=ATTENDANT");
    const nav = await panelNav(page);
    await expect(nav.getByRole("link")).toHaveCount(2);
    await expect(nav.getByRole("link", { name: /Pedidos/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Clientes/ })).toBeVisible();
  });

  test("kitchen sees only the board, in kitchen mode, without prices or contacts", async ({ page }) => {
    await page.goto("/dev/painel/cozinha");
    await expect(page.getByRole("heading", { level: 1, name: "Cozinha" })).toBeVisible();
    for (const column of ["A fazer", "Em preparo", "Prontos"]) await expect(page.getByRole("region", { name: column })).toBeVisible();
    await expect(page.getByRole("region", { name: "Novos" })).toHaveCount(0);
    await expect(page.getByText("2 pedidos aguardam confirmação do atendimento.")).toBeVisible();

    const board = page.locator("main");
    await expect(board.getByRole("article", { name: "Pedido 418" })).toContainText("Júlia");
    const text = await board.innerText();
    expect(text).not.toMatch(/R\$/);
    expect(text).not.toContain("Prado"); // first name only
    expect(text).not.toContain("98888");
    await expect(page.getByRole("button", { name: /Pedido no balcão/ })).toHaveCount(0);

    await board.getByRole("article", { name: "Pedido 418" }).getByRole("button", { name: "Iniciar preparo" }).click();
    await expect(page.getByText("#418 → Em preparo")).toBeVisible();

    const nav = await panelNav(page);
    await expect(nav.getByRole("link")).toHaveCount(1);
    await expect(nav.getByRole("link", { name: /Pedidos/ })).toBeVisible();
  });
});

test.describe("settings: team tab (fixture)", () => {
  test("owner invites, changes a role and removes a member", async ({ page }) => {
    await page.goto("/dev/painel/configuracoes?tab=team");
    const list = page.getByRole("list", { name: "Membros da equipe" });
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list.getByText("Convite pendente")).toBeVisible();
    // The owner row has no controls: the role is locked and the owner cannot be removed here.
    await expect(page.getByRole("button", { name: "Remover Carla Mendes" })).toHaveCount(0);

    await page.getByRole("button", { name: "Convidar pessoa" }).click();
    const dialog = page.getByRole("dialog", { name: "Convidar pessoa" });
    await dialog.getByLabel("E-mail").fill("ja@exemplo.com");
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(dialog.getByRole("alert")).toContainText("já faz parte da equipe");

    await dialog.getByLabel("E-mail").fill("Nova.Pessoa@Exemplo.com");
    await dialog.getByLabel("Nome (opcional)").fill("Nova Pessoa");
    await dialog.getByRole("radio", { name: /Cozinha/ }).check();
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(dialog).toBeHidden();
    await expect(list.getByRole("listitem")).toHaveCount(6);
    await expect(list.getByText("nova.pessoa@exemplo.com")).toBeVisible();

    await page.getByRole("combobox", { name: "Papel de Bia Rocha" }).click();
    await page.getByRole("option", { name: "Gerente" }).click();
    await expect(page.getByText("Bia Rocha agora é Gerente.")).toBeVisible();

    await page.getByRole("button", { name: "Remover Diego Ramos" }).click();
    await page.getByRole("dialog", { name: /Remover Diego Ramos/ }).getByRole("button", { name: "Remover da equipe" }).click();
    await expect(list.getByText("Diego Ramos")).toHaveCount(0);
    await expect(list.getByRole("listitem")).toHaveCount(5);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("manager gets a read-only list", async ({ page }) => {
    await page.goto("/dev/painel/configuracoes?tab=team&as=manager");
    await expect(page.getByRole("list", { name: "Membros da equipe" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Convidar pessoa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remover / })).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
  });
});
