import { describe, expect, it } from "vitest";
import { routeKind } from "@/lib/supabase/middleware";
import { safeNextPath } from "@/lib/utils";
import { forgotPasswordSchema, registerSchema, resetPasswordSchema } from "@/lib/validations";

describe("auth: password rules", () => {
  it("accepts a new password with 8+ characters that matches the confirmation", () => {
    const ok = resetPasswordSchema.safeParse({ password: "cozinha-2026", confirmPassword: "cozinha-2026" });
    expect(ok.success).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    const bad = resetPasswordSchema.safeParse({ password: "1234567", confirmPassword: "1234567" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("A senha deve ter pelo menos 8 caracteres.");
  });

  it("rejects a confirmation that does not match", () => {
    const bad = resetPasswordSchema.safeParse({ password: "cozinha-2026", confirmPassword: "cozinha-2027" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].path).toEqual(["confirmPassword"]);
      expect(bad.error.issues[0].message).toBe("As senhas não conferem.");
    }
  });

  it("rejects passwords longer than bcrypt can hash (72)", () => {
    const long = "a".repeat(73);
    expect(resetPasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(false);
  });

  it("applies the same 8-character minimum on sign-up", () => {
    const base = { fullName: "Carla Mendes", email: "carla@exemplo.com.br" };
    expect(registerSchema.safeParse({ ...base, password: "1234567" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "12345678" }).success).toBe(true);
  });

  it("validates the recovery e-mail", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nao-e-email" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "  dona@loja.com.br " }).success).toBe(true);
  });
});

describe("auth: redirect target after an e-mail link", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/settings?tab=team")).toBe("/settings?tab=team");
  });

  it("falls back to the dashboard for anything that could leave the site", () => {
    for (const hostile of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "dashboard", "", null, undefined]) {
      expect(safeNextPath(hostile)).toBe("/dashboard");
    }
  });

  it("accepts a custom fallback", () => {
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
  });
});

describe("auth: middleware route classes", () => {
  it("keeps e-mail landings open, signed in or not", () => {
    expect(routeKind("/auth/callback")).toBe("open");
    expect(routeKind("/reset-password")).toBe("open");
  });

  it("protects the dashboard areas", () => {
    for (const p of ["/dashboard", "/orders", "/menu-manager", "/inventory", "/customers", "/settings", "/onboarding", "/settings/anything"]) {
      expect(routeKind(p)).toBe("protected");
    }
  });

  it("sends signed-in users away from guest-only screens", () => {
    for (const p of ["/login", "/register", "/forgot-password"]) expect(routeKind(p)).toBe("guest-only");
  });

  it("leaves public surfaces alone", () => {
    for (const p of ["/", "/menu/smash-da-vila", "/pedido/abc", "/termos", "/authors"]) expect(routeKind(p)).toBe("open");
  });
});
