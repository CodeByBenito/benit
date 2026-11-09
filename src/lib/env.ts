import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Integrations are optional so local dev and
 * the test suite work without credentials; each integration checks
 * `isConfigured` before use and fails closed when it isn't.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  MP_CLIENT_ID: z.string().optional(),
  MP_CLIENT_SECRET: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  MP_API_BASE_URL: z.string().url().default("https://api.mercadopago.com"),
  MP_AUTH_BASE_URL: z.string().url().default("https://auth.mercadopago.com.br"),

  /** 32-byte key, base64. Encrypts per-store Mercado Pago tokens at rest. */
  TOKEN_ENC_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("BENIT <no-reply@benit.app>"),

  CRON_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env = parsed.data;

export const integrations = {
  supabaseAdmin: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  mercadoPago: Boolean(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET && env.TOKEN_ENC_KEY),
  mercadoPagoWebhook: Boolean(env.MP_WEBHOOK_SECRET),
  resend: Boolean(env.RESEND_API_KEY),
  cron: Boolean(env.CRON_SECRET),
};
