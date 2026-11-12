import type { Db } from "./harness";

/**
 * A small stand-in for supabase-js backed by the PGlite test database, so the
 * app's real server code (route handlers, server actions, lib/mercadopago)
 * runs against real Postgres with real roles and RLS.
 *
 * It covers what that code uses: select / insert / upsert / update / delete
 * with eq, neq, lt, lte, gt, gte, in, is, order, limit, single, maybeSingle,
 * `{ count: "exact", head: true }`, rpc() and auth.getUser(). Embedded
 * relations in a select ("items:order_items(...)") are ignored.
 */

type Role = "anon" | "authenticated" | "service_role";
export interface ShimContext {
  role: Role;
  userId: string | null;
  email?: string;
}

interface ShimError {
  message: string;
  code?: string;
  status?: number;
}
type Result<T> = { data: T | null; error: ShimError | null; count?: number | null };

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`shim: invalid identifier "${name}"`);
  return `"${name}"`;
};

/** Top-level column list of a PostgREST select string, without embedded relations. */
function parseColumns(columns: string | undefined): string {
  if (!columns || columns.trim() === "*") return "*";
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  const plain = parts.map((p) => p.trim()).filter((p) => p && !p.includes("("));
  if (plain.includes("*") || plain.length === 0) return "*";
  return plain.map(ident).join(", ");
}

const toParam = (value: unknown) => (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) ? JSON.stringify(value) : value);

async function run<T>(db: Db, ctx: ShimContext, fn: (tx: Pick<Db, "query" | "exec">) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ctx.userId ?? ""]);
    await tx.exec(`SET LOCAL ROLE ${ctx.role}`);
    return fn(tx);
  });
}

const asError = (error: unknown): ShimError => {
  const e = error as { message?: string; code?: string };
  return { message: e?.message ?? String(error), code: e?.code };
};

class Query implements PromiseLike<Result<unknown>> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private rows: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};
  private filters: { sql: string; values: unknown[] }[] = [];
  private orders: string[] = [];
  private max: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private head = false;
  private counting = false;

  constructor(private readonly db: Db, private readonly ctx: () => ShimContext, private readonly table: string) {}

  select(columns?: string, options?: { count?: "exact"; head?: boolean }) {
    if (this.op === "select") {
      this.columns = parseColumns(columns);
      this.head = Boolean(options?.head);
      this.counting = options?.count === "exact";
    } else this.returning = parseColumns(columns);
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "upsert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.patch = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private where(column: string, operator: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} ${operator} ?`, values: [value] });
    return this;
  }
  eq(column: string, value: unknown) {
    return this.where(column, "=", value);
  }
  neq(column: string, value: unknown) {
    return this.where(column, "<>", value);
  }
  lt(column: string, value: unknown) {
    return this.where(column, "<", value);
  }
  lte(column: string, value: unknown) {
    return this.where(column, "<=", value);
  }
  gt(column: string, value: unknown) {
    return this.where(column, ">", value);
  }
  gte(column: string, value: unknown) {
    return this.where(column, ">=", value);
  }
  in(column: string, values: unknown[]) {
    if (values.length === 0) this.filters.push({ sql: "false", values: [] });
    else this.filters.push({ sql: `${ident(column)} IN (${values.map(() => "?").join(", ")})`, values });
    return this;
  }
  is(column: string, value: null | boolean) {
    this.filters.push({ sql: `${ident(column)} IS ${value === null ? "NULL" : value ? "TRUE" : "FALSE"}`, values: [] });
    return this;
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push(`${ident(column)} ${options?.ascending === false ? "DESC" : "ASC"}${options?.nullsFirst === false ? " NULLS LAST" : ""}`);
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  single<T = unknown>() {
    this.mode = "single";
    return this as unknown as PromiseLike<Result<T>>;
  }
  maybeSingle<T = unknown>() {
    this.mode = "maybeSingle";
    return this as unknown as PromiseLike<Result<T>>;
  }
  returns<T = unknown>() {
    return this as unknown as PromiseLike<Result<T>>;
  }

  private build(primaryKey: string[]): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(toParam(value));
      return `$${params.length}`;
    };
    const whereSql = () => {
      if (!this.filters.length) return "";
      const clauses = this.filters.map((f) => {
        let i = 0;
        return f.sql.replace(/\?/g, () => bind(f.values[i++]));
      });
      return ` WHERE ${clauses.join(" AND ")}`;
    };
    const table = `public.${ident(this.table)}`;
    const returning = this.returning ? ` RETURNING ${this.returning}` : "";

    if (this.op === "select") {
      const what = this.head ? "count(*)::int AS count" : this.columns;
      const tail = this.head ? "" : `${this.orders.length ? ` ORDER BY ${this.orders.join(", ")}` : ""}${this.max !== null ? ` LIMIT ${Number(this.max)}` : ""}`;
      return { sql: `SELECT ${what} FROM ${table}${whereSql()}${tail}`, params };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const keys = [...new Set(this.rows.flatMap((row) => Object.keys(row).filter((k) => row[k] !== undefined)))];
      const tuples = this.rows.map((row) => `(${keys.map((k) => (row[k] === undefined ? "DEFAULT" : bind(row[k]))).join(", ")})`);
      let sql = `INSERT INTO ${table} (${keys.map(ident).join(", ")}) VALUES ${tuples.join(", ")}`;
      if (this.op === "upsert") {
        const updates = keys.filter((k) => !primaryKey.includes(k)).map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`);
        sql += ` ON CONFLICT (${primaryKey.map(ident).join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
      }
      return { sql: sql + returning, params };
    }
    if (this.op === "update") {
      const sets = Object.keys(this.patch)
        .filter((k) => this.patch[k] !== undefined)
        .map((k) => `${ident(k)} = ${bind(this.patch[k])}`);
      return { sql: `UPDATE ${table} SET ${sets.join(", ")}${whereSql()}${returning}`, params };
    }
    return { sql: `DELETE FROM ${table}${whereSql()}${returning}`, params };
  }

  private async execute(): Promise<Result<unknown>> {
    try {
      const rows = await run(this.db, this.ctx(), async (tx) => {
        let primaryKey: string[] = [];
        if (this.op === "upsert") {
          const pk = await tx.query<{ attname: string }>(
            `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
             WHERE i.indrelid = $1::regclass AND i.indisprimary`,
            [`public.${this.table}`]
          );
          primaryKey = pk.rows.map((r) => r.attname);
        }
        const { sql, params } = this.build(primaryKey);
        return (await tx.query<Record<string, unknown>>(sql, params)).rows;
      });

      if (this.op === "select" && this.head) return { data: null, error: null, count: Number(rows[0]?.count ?? 0) };
      const count = this.counting ? rows.length : null;
      if (this.op !== "select" && !this.returning) return { data: null, error: null, count };
      if (this.mode === "many") return { data: rows, error: null, count };
      if (rows.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      if (rows.length === 0) {
        return this.mode === "single" ? { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } } : { data: null, error: null };
      }
      return { data: rows[0], error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  }

  then<A = Result<unknown>, B = never>(onFulfilled?: ((value: Result<unknown>) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.execute().then(onFulfilled, onRejected);
  }
}

export function createShimClient(db: Db, ctx: () => ShimContext) {
  return {
    from: (table: string) => new Query(db, ctx, table),
    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result<unknown>> {
      try {
        const keys = Object.keys(args).filter((k) => args[k] !== undefined);
        const sql = `SELECT public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")}) AS r`;
        const values = keys.map((k) => {
          const v = args[k];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        const data = await run(db, ctx(), async (tx) => (await tx.query<{ r: unknown }>(sql, values)).rows[0]?.r ?? null);
        return { data, error: null };
      } catch (error) {
        return { data: null, error: asError(error) };
      }
    },
    auth: {
      async getUser() {
        const { userId, email } = ctx();
        return { data: { user: userId ? { id: userId, email: email ?? null, user_metadata: {} } : null }, error: null };
      },
    },
  };
}
