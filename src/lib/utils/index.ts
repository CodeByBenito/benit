import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer cents (e.g. 2590) into BRL currency string (R$ 25,90)
 */
export function formatCurrencyCents(cents: number, currency = "BRL"): string {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

/**
 * Parses a human-entered BRL price string (e.g. "25,90" or "25.90") into integer cents (2590)
 */
export function parsePriceToCents(input: string | number): number {
  if (typeof input === "number") {
    return input < 0 ? 0 : Math.round(input * 100);
  }
  const raw = input.replace(/[R$\s]/g, "").trim();
  if (!raw) return 0;

  let normalized = raw;
  if (raw.includes(",")) {
    // Brazilian format: dots are thousands separators, comma is decimal separator
    normalized = raw.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

/**
 * Generates a URL-safe slug from any text
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalizes phone numbers to digits only
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Formats phone digits into Brazilian standard (11) 99999-9999
 */
export function formatPhoneBR(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Builds a quick WhatsApp click-to-chat URL
 */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const digits = normalizePhone(phone);
  const fullPhone = digits.startsWith("55") ? digits : `55${digits}`;
  const baseUrl = `https://wa.me/${fullPhone}`;
  if (!message) return baseUrl;
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

/**
 * Formats relative or short operational time (pt-BR)
 */
export function formatElapsedMinutes(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}


/**
 * Sanitizes a post-login redirect target. Only same-origin relative paths are
 * allowed ("/dashboard"); anything else (absolute URLs, "//host", backslashes)
 * falls back, so an auth link can never bounce the user to another site.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
