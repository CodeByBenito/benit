import { test as base, expect } from "@playwright/test";

/**
 * `test` whose `page.goto` resolves only after React has hydrated the page.
 *
 * The dev server compiles each route on its first hit, so on a busy machine a
 * test could click a server-rendered button before its handler existed and
 * fail for no real reason. Waiting for hydration removes that race instead of
 * hiding it behind retries.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    const hydrated = () =>
      page
        .waitForFunction(
          () => {
            const el = document.querySelector("main button, main a, main input, button, a, input");
            // React tags every hydrated DOM node with __reactFiber$… / __reactProps$… keys.
            return !el || Object.keys(el).some((key) => key.startsWith("__reactFiber") || key.startsWith("__reactProps"));
          },
          undefined,
          { timeout: 30_000 }
        )
        .catch(() => {
          // Not a React page (an image, a redirect): nothing to wait for.
        });
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await hydrated();
      return response;
    };
    page.reload = async (options) => {
      const response = await reload(options);
      await hydrated();
      return response;
    };
    await use(page);
  },
});

export { expect };
