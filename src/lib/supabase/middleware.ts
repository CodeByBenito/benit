import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./client";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/orders",
  "/menu-manager",
  "/inventory",
  "/customers",
  "/settings",
  "/onboarding",
];

const GUEST_ONLY_PREFIXES = ["/login", "/register", "/forgot-password"];

/**
 * E-mail link landings. Always reachable, signed in or not: /auth/callback
 * creates the session and /reset-password runs with the recovery session, so
 * neither may be treated as a guest-only or a protected route.
 */
const OPEN_AUTH_PREFIXES = ["/auth", "/reset-password"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export type RouteKind = "protected" | "guest-only" | "open";

/** Pure route classification, unit-tested in tests/auth.test.ts. */
export function routeKind(pathname: string): RouteKind {
  if (matches(pathname, OPEN_AUTH_PREFIXES)) return "open";
  if (matches(pathname, PROTECTED_PREFIXES)) return "protected";
  if (matches(pathname, GUEST_ONLY_PREFIXES)) return "guest-only";
  return "open";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const kind = routeKind(pathname);

  if (!user && kind === "protected") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && kind === "guest-only") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
