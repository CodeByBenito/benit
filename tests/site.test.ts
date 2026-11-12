import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, siteUrl } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

function env(values: Record<string, string>) {
  for (const key of ["NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) vi.stubEnv(key, values[key] ?? "");
}

describe("site origin", () => {
  it("uses the configured public URL, without path or trailing slash", () => {
    env({ NEXT_PUBLIC_APP_URL: "https://app.benit.com.br/qualquer/" });
    expect(siteUrl().origin).toBe("https://app.benit.com.br");
    expect(absoluteUrl("/menu/smash-da-vila")).toBe("https://app.benit.com.br/menu/smash-da-vila");
  });

  it("falls back to the Vercel domain so previews get absolute URLs", () => {
    env({ VERCEL_URL: "benit-git-main.vercel.app" });
    expect(siteUrl().origin).toBe("https://benit-git-main.vercel.app");
    env({ VERCEL_URL: "benit-git-main.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "benit.vercel.app" });
    expect(siteUrl().origin).toBe("https://benit.vercel.app");
  });

  it("ignores malformed values instead of breaking the build", () => {
    env({ NEXT_PUBLIC_APP_URL: "nao-e-url" });
    expect(siteUrl().origin).toBe("http://localhost:3000");
    env({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" });
    expect(siteUrl().origin).toBe("http://localhost:3000");
  });
});
