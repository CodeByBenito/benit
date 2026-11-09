import "server-only";
import { Resend } from "resend";
import { env, integrations } from "@/lib/env";

let client: Resend | null = null;

/**
 * Fire-and-forget transactional email. Never throws: email is a courtesy,
 * an outage at the provider must not break an order or a signup.
 */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  if (!integrations.resend) return { skipped: true as const };
  try {
    client ??= new Resend(env.RESEND_API_KEY);
    const { error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) console.error("[email] resend error", error.message);
    return { skipped: false as const, ok: !error };
  } catch (error) {
    console.error("[email] send failed", (error as Error).message);
    return { skipped: false as const, ok: false };
  }
}
