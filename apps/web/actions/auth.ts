"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signUp(formData: FormData) {
  const parsed = SignUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]!.message } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/callback` },
  });

  if (error) {
    return { ok: false as const, error: { code: "SIGN_UP_FAILED", message: error.message } };
  }

  redirect("/");
}

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signIn(formData: FormData) {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]!.message } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false as const, error: { code: "SIGN_IN_FAILED", message: error.message } };
  }

  redirect("/");
}

const ResetSchema = z.object({ email: z.string().email() });

export async function requestPasswordReset(formData: FormData) {
  const parsed = ResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]!.message } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/callback?next=/settings/account`,
  });
  if (error) {
    return { ok: false as const, error: { code: "RESET_FAILED", message: error.message } };
  }

  return { ok: true as const, data: { sent: true } };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/callback`,
    },
  });
  if (error || !data.url) {
    return { ok: false as const, error: { code: "OAUTH_FAILED", message: error?.message ?? "Failed to initiate Google sign-in" } };
  }
  redirect(data.url);
}
