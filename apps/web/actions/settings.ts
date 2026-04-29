"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Result = <T>(d: T) => ({ ok: true as const, data: d });
const Err = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

const ProfileSchema = z.object({
  display_name: z.string().max(80).optional(),
  timezone: z.string().min(1).optional(),
  avatar_path: z.string().optional(),
});
export async function updateProfile(input: z.infer<typeof ProfileSchema>) {
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0]!.message);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");
  const { error } = await supabase.from("profiles").update(parsed.data).eq("user_id", user.id);
  if (error) return Err("UPDATE_FAILED", error.message);
  revalidatePath("/settings");
  return Result({});
}

const AppearanceSchema = z.object({
  theme_mode: z.enum(["light","dark","system"]).optional(),
  theme_accent: z.enum(["default","blue","emerald","rose","amber","violet"]).optional(),
});
export async function updateAppearance(input: z.infer<typeof AppearanceSchema>) {
  const parsed = AppearanceSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0]!.message);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");
  const { error } = await supabase.from("profiles").update(parsed.data).eq("user_id", user.id);
  if (error) return Err("UPDATE_FAILED", error.message);
  revalidatePath("/", "layout");
  return Result({});
}

const PasswordSchema = z.object({ password: z.string().min(8) });
export async function updatePassword(input: z.infer<typeof PasswordSchema>) {
  const parsed = PasswordSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0]!.message);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return Err("PASSWORD_UPDATE_FAILED", error.message);
  return Result({});
}
