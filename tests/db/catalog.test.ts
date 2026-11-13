import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, rpc, seed, type Db, type Fixture } from "./harness";

let db: Db;
let fx: Fixture;

async function commit<T>(userId: string, fn: string, args: Record<string, unknown>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec(`SET LOCAL ROLE authenticated`);
    const keys = Object.keys(args);
    // uuid[] must be passed as an array literal, not JSON.
    const params = keys.map((k, i) => (Array.isArray(args[k]) ? `${k} => $${i + 1}::uuid[]` : `${k} => $${i + 1}`)).join(", ");
    const values = keys.map((k) => (Array.isArray(args[k]) ? `{${(args[k] as string[]).join(",")}}` : args[k]));
    const res = await tx.query<{ r: T }>(`SELECT public.${fn}(${params}) AS r`, values);
    return res.rows[0].r;
  });
}

const productOrder = async () =>
  (await db.query<{ id: string }>(`SELECT id FROM public.products WHERE store_id = $1 ORDER BY sort_order, name`, [fx.storeId])).rows.map((r) => r.id);

beforeAll(async () => {
  db = await createTestDb();
  fx = await seed(db);
}, 120_000);

describe("catalog: drag-and-drop order", () => {
  it("saves the new order of products in one call", async () => {
    const wanted = [fx.sodaId, fx.burgerId, fx.friesId];
    const updated = await commit<number>(fx.ownerId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "product", p_ids: wanted });
    expect(updated).toBe(3);
    expect(await productOrder()).toEqual(wanted);
    const { rows } = await db.query<{ sort_order: number }>(`SELECT sort_order FROM public.products WHERE store_id = $1 ORDER BY sort_order`, [fx.storeId]);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 10, 20]);
  });

  it("the public menu follows the saved order", async () => {
    const menu = await as(db, "anon", null, (tx) => rpc<{ products: { id: string }[] }>(tx, "get_public_menu_by_slug", { p_slug: fx.storeSlug }));
    expect(menu.products.map((p) => p.id)).toEqual([fx.sodaId, fx.burgerId, fx.friesId]);
  });

  it("reorders categories too", async () => {
    const [{ id: drinks }] = (await db.query<{ id: string }>(`INSERT INTO public.categories (store_id, name, sort_order) VALUES ($1, 'Bebidas', 99) RETURNING id`, [fx.storeId])).rows;
    const [{ id: burgers }] = (await db.query<{ id: string }>(`SELECT id FROM public.categories WHERE store_id = $1 AND name = 'Burgers'`, [fx.storeId])).rows;
    await commit(fx.ownerId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "category", p_ids: [drinks, burgers] });
    const { rows } = await db.query<{ name: string }>(`SELECT name FROM public.categories WHERE store_id = $1 ORDER BY sort_order`, [fx.storeId]);
    expect(rows.map((r) => r.name)).toEqual(["Bebidas", "Burgers"]);
  });

  it("ignores ids of another store and rejects other tenants, bad kinds and anonymous callers", async () => {
    const [{ id: foreign }] = (await db.query<{ id: string }>(`INSERT INTO public.products (store_id, name, price_cents, sort_order) VALUES ($1, 'Alheio', 100, 7) RETURNING id`, [fx.otherStoreId])).rows;
    const updated = await commit<number>(fx.ownerId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "product", p_ids: [foreign, fx.burgerId] });
    expect(updated).toBe(1);
    const { rows } = await db.query<{ sort_order: number }>(`SELECT sort_order FROM public.products WHERE id = $1`, [foreign]);
    expect(rows[0].sort_order).toBe(7);

    await expect(commit(fx.outsiderId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "product", p_ids: [fx.burgerId] })).rejects.toThrow(/FORBIDDEN/);
    await expect(commit(fx.ownerId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "orders", p_ids: [fx.burgerId] })).rejects.toThrow(/INVALID_KIND/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE anon`);
        return tx.query(`SELECT public.reorder_catalog($1, 'product', $2::uuid[])`, [fx.storeId, `{${fx.burgerId}}`]);
      })
    ).rejects.toThrow(/permission denied/);
  });

  it("an empty list is a no-op and oversized lists are refused", async () => {
    expect(await commit<number>(fx.ownerId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "product", p_ids: [] })).toBe(0);
    const many = Array.from({ length: 501 }, () => fx.burgerId);
    await expect(commit(fx.ownerId, "reorder_catalog", { p_store_id: fx.storeId, p_kind: "product", p_ids: many })).rejects.toThrow(/TOO_MANY_ITEMS/);
  });
});

describe("storage: benit-assets bucket", () => {
  it("only takes images, up to 5 MB", async () => {
    const { rows } = await db.query<{ file_size_limit: string; allowed_mime_types: string[] }>(`SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'benit-assets'`);
    expect(Number(rows[0].file_size_limit)).toBe(5 * 1024 * 1024);
    expect(rows[0].allowed_mime_types).toEqual(["image/webp", "image/jpeg", "image/png"]);
  });
});
