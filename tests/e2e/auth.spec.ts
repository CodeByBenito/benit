import { expect, test } from "@playwright/test";

/**
 * Auth screens. The E2E server runs without Supabase credentials, so these
 * cover rendering, navigation and client-side validation; the redirect and
 * password rules are unit-tested in tests/auth.test.ts.
 */
test.describe("auth screens", () => {
  test("login links to sign-up and recovery", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Bem-vindo de volta." })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await page.getByRole("link", { name: "Esqueci a senha" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { level: 1, name: "Recuperar acesso." })).toBeVisible();
  });

  test("login explains an expired e-mail link", async ({ page }) => {
    await page.goto("/login?error=link");
    await expect(page.locator("main p[role=alert]")).toContainText("Este link expirou ou já foi usado");
  });

  test("sign-up asks for an 8-character password", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("Mínimo de 8 caracteres.")).toBeVisible();
    await expect(page.getByLabel("Senha")).toHaveAttribute("minlength", "8");
  });

  test("callback without a valid link goes back to login with an explanation", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.locator("main p[role=alert]")).toBeVisible();
  });

  test("callback never redirects off-site", async ({ page }) => {
    await page.goto("/auth/callback?next=https://example.com");
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/login/);
  });

  test("reset-password without a recovery session offers a new link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: "Este link não vale mais." })).toBeVisible();
    await page.getByRole("link", { name: "Pedir novo link" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("new-password form validates length and confirmation before submitting", async ({ page }) => {
    await page.goto("/dev/auth/nova-senha");
    const password = page.getByLabel("Nova senha", { exact: true });
    const confirm = page.getByLabel("Repita a nova senha");
    const submit = page.getByRole("button", { name: "Salvar nova senha" });

    await password.fill("1234567");
    await confirm.fill("1234567");
    await submit.click();
    await expect(page.locator("main p[role=alert]")).toHaveText("A senha deve ter pelo menos 8 caracteres.");

    await password.fill("cozinha-2026");
    await confirm.fill("cozinha-2027");
    await submit.click();
    await expect(page.locator("main p[role=alert]")).toHaveText("As senhas não conferem.");

    await confirm.fill("cozinha-2026");
    await submit.click();
    await expect(page.locator("main p[role=alert]")).toHaveText("Prévia: a senha passou na validação e seria salva.");

    await page.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(password).toHaveAttribute("type", "text");
  });

  test("auth screens have no horizontal overflow", async ({ page }) => {
    for (const path of ["/login", "/register", "/forgot-password", "/reset-password", "/dev/auth/nova-senha"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, path).toBe(false);
    }
  });
});
