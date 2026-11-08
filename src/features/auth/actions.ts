"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  forgotPasswordSchema,
  loginSchema,
  onboardingSchema,
  registerSchema,
} from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { ACTIVE_STORE_COOKIE } from "@/lib/permissions/tenant";

export type ActionResult<T = unknown> = {
  success: boolean;
  error?: string;
  data?: T;
};

export async function loginAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        "Supabase ainda não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local.",
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      success: false,
      error:
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function registerAction(
  formData: FormData
): Promise<ActionResult<{ requiresEmailConfirmation?: boolean }>> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        "Supabase ainda não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local.",
    };
  }

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
      },
    },
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  // If session is immediately established, go straight to onboarding
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  return {
    success: true,
    data: { requiresEmailConfirmation: true },
  };
}

export async function forgotPasswordAction(
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        "Supabase ainda não está configurado. Configure as variáveis de ambiente primeiro.",
    };
  }

  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Informe um e-mail válido.",
    };
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${appUrl}/login`,
    }
  );

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
  };
}

export async function logoutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_STORE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function completeOnboardingAction(
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: "Supabase não configurado.",
    };
  }

  const rawStoreName = String(formData.get("storeName") ?? "");
  const rawSlug =
    String(formData.get("storeSlug") ?? "").trim() || slugify(rawStoreName);

  const parsed = onboardingSchema.safeParse({
    organizationName:
      String(formData.get("organizationName") ?? "").trim() || rawStoreName,
    storeName: rawStoreName,
    storeSlug: slugify(rawSlug),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp") || formData.get("phone"),
    description: formData.get("description") || undefined,
    address: formData.get("address") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Verifique os campos obrigatórios do cadastro.",
    };
  }

  const supabase = await createClient();
  const orgSlug = `${slugify(parsed.data.organizationName)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const { data, error } = await supabase.rpc(
    "onboard_organization_and_store",
    {
      p_org_name: parsed.data.organizationName,
      p_org_slug: orgSlug,
      p_store_name: parsed.data.storeName,
      p_store_slug: parsed.data.storeSlug,
      p_phone: parsed.data.phone,
      p_whatsapp: parsed.data.whatsapp ?? parsed.data.phone,
      p_description: parsed.data.description ?? null,
      p_address: parsed.data.address ?? null,
    }
  );

  if (error) {
    if (error.message.includes("stores_slug_key")) {
      return {
        success: false,
        error:
          "Este endereço de cardápio (slug) já está em uso por outra loja. Escolha outro identificador.",
      };
    }
    return {
      success: false,
      error: error.message,
    };
  }

  if (data && typeof data === "object" && "store_id" in data) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_STORE_COOKIE, String(data.store_id), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

