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

describe("store images fetched by the server", () => {
  it("only accepts public objects of this project's benit-assets bucket", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const { isOwnStorageUrl } = await import("@/lib/supabase/public");
    expect(isOwnStorageUrl("https://abc.supabase.co/storage/v1/object/public/benit-assets/s/logo-1.webp")).toBe(true);
    for (const hostile of [
      "http://abc.supabase.co/storage/v1/object/public/benit-assets/s/logo.webp",
      "https://evil.example/storage/v1/object/public/benit-assets/s/logo.webp",
      "https://abc.supabase.co.evil.example/storage/v1/object/public/benit-assets/x",
      "https://abc.supabase.co/storage/v1/object/public/other-bucket/x",
      "http://169.254.169.254/latest/meta-data",
      "not a url",
      "",
      null,
    ]) {
      expect(isOwnStorageUrl(hostile)).toBe(false);
    }
  });
});
