# Backdesk Plan 5: Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring v1 to a launchable polish bar. Cmd+K command palette, full Settings UI (account/profile/appearance), theming (light/dark + accent colors), page emoji picker, accessibility pass, observability (Sentry + Vercel Analytics), Lighthouse CI gate. After this plan, Backdesk *feels* like a tool you'd live in.

**Architecture:** Cmd+K via shadcn `Command` in a `Dialog`. Theming via `next-themes` for mode + CSS variable swaps via `[data-accent="..."]` for accent. Emoji picker via `emoji-mart`. Sentry SDK with separate client/server configs. Vercel Analytics via `@vercel/analytics`. Lighthouse CI via GitHub Action.

**Tech Stack:** `next-themes`, `emoji-mart`, `@sentry/nextjs`, `@vercel/analytics`, `@lhci/cli`, `axe-core` for accessibility tests.

**Pre-execution refinement:** Before starting, re-read spec [Sections 10 (Sidebar/Cmd+K), 11 (Settings), 13 (Performance), 18 (Accessibility)](../specs/2026-04-28-backdesk-v1-design.md). Quick smoke test: open the app, walk through every flow you've built so far, list rough edges. Polish tasks below cover the major ones; if you find more, add them as additional tasks before pushing.

---

## File structure created in this plan

```
apps/web/
├── app/(app)/settings/
│   ├── account/page.tsx
│   ├── profile/page.tsx
│   └── appearance/page.tsx
├── actions/
│   ├── settings.ts                       -- updateProfile, updatePassword, deleteAccount
│   └── (existing files unchanged)
├── components/
│   ├── command-palette/
│   │   ├── CommandPalette.tsx
│   │   └── useCommands.ts
│   ├── settings/
│   │   ├── AccountForm.tsx
│   │   ├── ProfileForm.tsx
│   │   ├── AppearanceForm.tsx
│   │   ├── DeleteAccountDialog.tsx
│   │   └── AvatarUpload.tsx
│   ├── pages/
│   │   └── PageEmojiPicker.tsx           -- (replaces placeholder from Plan 2)
│   └── theme/
│       └── ThemeProvider.tsx
├── lib/
│   └── sentry.ts
└── app/globals.css                       -- (modified) accent color CSS vars

sentry.client.config.ts
sentry.server.config.ts
sentry.edge.config.ts

.lighthouserc.json
.github/workflows/ci.yml                  -- (modified) add Lighthouse step
```

---

### Task 1: Install all new dependencies

- [ ] **Step 1: Install**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm --filter web add next-themes emoji-mart @emoji-mart/data @emoji-mart/react @sentry/nextjs @vercel/analytics
pnpm --filter web add -D @lhci/cli axe-core @axe-core/react
```

- [ ] **Step 2: Add Cmd+K shadcn `Command` (already added in Plan 2 but confirm)**

```bash
pnpm dlx shadcn@latest add command --yes
```

- [ ] **Step 3: Add `Dialog`, `Avatar`, `RadioGroup`, `ToggleGroup` if not present**

```bash
pnpm dlx shadcn@latest add dialog avatar radio-group toggle-group --yes
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui apps/web pnpm-lock.yaml
git commit -m "chore: install polish dependencies (next-themes, emoji-mart, sentry, vercel-analytics, axe)"
```

---

### Task 2: Theme provider + accent color CSS variables

**Files:**
- Create: `apps/web/components/theme/ThemeProvider.tsx`
- Modify: `apps/web/app/layout.tsx` (wrap children)
- Modify: `apps/web/app/globals.css` (define accent CSS vars)

- [ ] **Step 1: Write ThemeProvider**

```tsx
// apps/web/components/theme/ThemeProvider.tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Wrap root layout**

In `apps/web/app/layout.tsx`:
```tsx
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@workspace/ui/components/sonner";

// inside <body>:
<ThemeProvider>
  {children}
  <Toaster />
</ThemeProvider>
```

Also add `suppressHydrationWarning` on the `<html>` element (next-themes requirement).

- [ ] **Step 3: Define accent color CSS variables**

Add to `apps/web/app/globals.css`:

```css
/* Accent overrides — applied via <html data-accent="..."> from ProfileForm */
:root[data-accent="blue"] {
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --ring: 217.2 91.2% 59.8%;
}
:root[data-accent="emerald"] {
  --primary: 158.1 64.4% 51.6%;
  --primary-foreground: 158.1 64.4% 11.6%;
  --ring: 158.1 64.4% 51.6%;
}
:root[data-accent="rose"] {
  --primary: 346.8 77.2% 49.8%;
  --primary-foreground: 0 0% 100%;
  --ring: 346.8 77.2% 49.8%;
}
:root[data-accent="amber"] {
  --primary: 32.1 94.6% 43.7%;
  --primary-foreground: 0 0% 100%;
  --ring: 32.1 94.6% 43.7%;
}
:root[data-accent="violet"] {
  --primary: 262.1 83.3% 57.8%;
  --primary-foreground: 0 0% 100%;
  --ring: 262.1 83.3% 57.8%;
}
/* "default" accent uses the existing :root values from the preset, no override */
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/theme apps/web/app/layout.tsx apps/web/app/globals.css
git commit -m "feat(theme): ThemeProvider + accent color CSS variables"
```

---

### Task 3: Settings actions

**Files:** `apps/web/actions/settings.ts`

- [ ] **Step 1: Write**

```ts
// apps/web/actions/settings.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Result = <T>(d: T) => ({ ok: true as const, data: d });
const Err = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

const ProfileSchema = z.object({
  display_name: z.string().max(80).optional(),
  timezone: z.string().min(1).optional(),
  avatar_path: z.string().optional(),
});
export async function updateProfile(input: z.infer<typeof ProfileSchema>) {
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
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
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");
  const { error } = await supabase.from("profiles").update(parsed.data).eq("user_id", user.id);
  if (error) return Err("UPDATE_FAILED", error.message);
  return Result({});
}

const PasswordSchema = z.object({ password: z.string().min(8) });
export async function updatePassword(input: z.infer<typeof PasswordSchema>) {
  const parsed = PasswordSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return Err("PASSWORD_UPDATE_FAILED", error.message);
  return Result({});
}

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");
  // Use admin client to delete (cascades user data via FKs ON DELETE CASCADE)
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return Err("DELETE_FAILED", error.message);
  return Result({});
}
```

- [ ] **Step 2: Add `actions/admin/` allowance for `deleteAccount` (already-allowed via the eslint override in Plan 1). Move `deleteAccount` into `apps/web/actions/admin/delete-account.ts` if linter complains about admin-client import:**

```ts
// apps/web/actions/admin/delete-account.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in." } };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false as const, error: { code: "DELETE_FAILED", message: error.message } };
  return { ok: true as const, data: {} };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/actions
git commit -m "feat(actions): settings (profile, appearance, password, delete account)"
```

---

### Task 4: Settings → Appearance page + form

**Files:** `apps/web/app/(app)/settings/appearance/page.tsx`, `apps/web/components/settings/AppearanceForm.tsx`

- [ ] **Step 1: Write the form**

```tsx
// apps/web/components/settings/AppearanceForm.tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@workspace/ui/components/field";
import { toast } from "sonner";
import { updateAppearance } from "@/actions/settings";

const ACCENTS = ["default", "blue", "emerald", "rose", "amber", "violet"] as const;
type Accent = typeof ACCENTS[number];

export function AppearanceForm({
  initialMode, initialAccent,
}: {
  initialMode: "light"|"dark"|"system";
  initialAccent: Accent;
}) {
  const { setTheme, theme } = useTheme();
  const [accent, setAccent] = useState<Accent>(initialAccent);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (theme && theme !== initialMode) {
      // sync next-themes state with the persisted value when the page first loads
      setTheme(initialMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply data-accent on the html element whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  function commit(mode: typeof initialMode, acc: Accent) {
    startTransition(async () => {
      const result = await updateAppearance({ theme_mode: mode, theme_accent: acc });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Theme mode</FieldLabel>
        <ToggleGroup
          type="single"
          value={theme ?? "system"}
          onValueChange={(v) => {
            if (!v) return;
            setTheme(v);
            commit(v as any, accent);
          }}
        >
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          <ToggleGroupItem value="system">System</ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <Field>
        <FieldLabel>Accent color</FieldLabel>
        <FieldDescription>Affects buttons, links, focus rings, and chart colors.</FieldDescription>
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => { setAccent(a); commit(theme as any, a); }}
              className={`size-8 rounded-full border-2 transition ${accent === a ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: SWATCHES[a] }}
              aria-label={a}
            />
          ))}
        </div>
      </Field>
    </FieldGroup>
  );
}

const SWATCHES: Record<Accent, string> = {
  default: "var(--primary)",
  blue: "hsl(217.2 91.2% 59.8%)",
  emerald: "hsl(158.1 64.4% 51.6%)",
  rose: "hsl(346.8 77.2% 49.8%)",
  amber: "hsl(32.1 94.6% 43.7%)",
  violet: "hsl(262.1 83.3% 57.8%)",
};
```

- [ ] **Step 2: Write the page**

```tsx
// apps/web/app/(app)/settings/appearance/page.tsx
import { createClient } from "@/lib/supabase/server";
import { AppearanceForm } from "@/components/settings/AppearanceForm";

export default async function AppearancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("theme_mode, theme_accent")
    .eq("user_id", user!.id).single();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Appearance</h1>
      <AppearanceForm
        initialMode={(profile?.theme_mode as any) ?? "system"}
        initialAccent={(profile?.theme_accent as any) ?? "default"}
      />
    </div>
  );
}
```

- [ ] **Step 3: Persist accent on page-load (so it survives reloads everywhere)**

Add to root layout — fetch the profile and set `data-accent` server-side via the `<html>` tag attribute. Since `<html>` is in `app/layout.tsx`, do:

```tsx
// apps/web/app/layout.tsx (add to the body or html)
import { createClient } from "@/lib/supabase/server";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let accent = "default";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("theme_accent").eq("user_id", user.id).maybeSingle();
    accent = profile?.theme_accent ?? "default";
  }

  return (
    <html lang="en" suppressHydrationWarning data-accent={accent}>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(settings): Appearance page with theme mode and accent color"
```

---

### Task 5: Settings → Profile page

**Files:** `apps/web/app/(app)/settings/profile/page.tsx`, `apps/web/components/settings/ProfileForm.tsx`, `apps/web/components/settings/AvatarUpload.tsx`

- [ ] **Step 1: Avatar upload**

```tsx
// apps/web/components/settings/AvatarUpload.tsx
"use client";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { createClient } from "@/lib/supabase/browser";
import { updateProfile } from "@/actions/settings";
import { toast } from "sonner";

export function AvatarUpload({ initialUrl, initialPath, displayName }: { initialUrl: string | null; initialPath: string | null; displayName: string }) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    setUrl(signed?.signedUrl ?? null);
    await updateProfile({ avatar_path: path });
    setUploading(false);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {url && <AvatarImage src={url} alt="" />}
        <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <label className="cursor-pointer">
        <Button asChild variant="outline" size="sm" disabled={uploading}>
          <span>{uploading ? "Uploading…" : "Change avatar"}</span>
        </Button>
        <input type="file" accept="image/*" className="hidden" onChange={onPick} />
      </label>
    </div>
  );
}
```

> **Note:** create the `avatars` bucket via a migration similar to `attachments` in Plan 3 — public bucket OR private with signed URLs. Pattern same as `attachments`.

- [ ] **Step 2: ProfileForm**

```tsx
// apps/web/components/settings/ProfileForm.tsx
"use client";
import { useState, useTransition } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@workspace/ui/components/field";
import { Combobox } from "@workspace/ui/components/combobox";
import { toast } from "sonner";
import { updateProfile } from "@/actions/settings";
import { AvatarUpload } from "./AvatarUpload";

const TIMEZONES = Intl.supportedValuesOf?.("timeZone") ?? ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"];

export function ProfileForm({
  initialName, initialTimezone, avatarUrl, avatarPath,
}: {
  initialName: string;
  initialTimezone: string;
  avatarUrl: string | null;
  avatarPath: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [tz, setTz] = useState(initialTimezone);
  const [, startTransition] = useTransition();

  function commit() {
    startTransition(async () => {
      const result = await updateProfile({ display_name: name, timezone: tz });
      if (!result.ok) toast.error(result.error.message); else toast.success("Saved.");
    });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Avatar</FieldLabel>
        <AvatarUpload initialUrl={avatarUrl} initialPath={avatarPath} displayName={name || "?"} />
      </Field>
      <Field>
        <FieldLabel htmlFor="display-name">Display name</FieldLabel>
        <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
      </Field>
      <Field>
        <FieldLabel>Timezone</FieldLabel>
        <FieldDescription>Affects how datetime fields and time-window aggregations are rendered.</FieldDescription>
        {/* Use shadcn's Combobox for searchable timezone picker */}
        <select
          className="w-full border rounded p-2"
          value={tz}
          onChange={(e) => { setTz(e.target.value); }}
          onBlur={commit}
        >
          {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <div><Button onClick={commit}>Save</Button></div>
    </FieldGroup>
  );
}
```

- [ ] **Step 3: Page**

```tsx
// apps/web/app/(app)/settings/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/settings/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("display_name, timezone, avatar_path")
    .eq("user_id", user!.id).single();

  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 60 * 60 * 24 * 7);
    avatarUrl = signed?.signedUrl ?? null;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <ProfileForm
        initialName={profile?.display_name ?? ""}
        initialTimezone={profile?.timezone ?? "UTC"}
        avatarUrl={avatarUrl}
        avatarPath={profile?.avatar_path ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add avatars bucket migration**

```bash
supabase migration new avatars_bucket
```

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY avatars_select ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

```bash
supabase db reset && pnpm db:types
```

- [ ] **Step 5: Commit**

```bash
git add apps/web supabase/migrations
git commit -m "feat(settings): Profile page with avatar upload + timezone picker"
```

---

### Task 6: Settings → Account page

**Files:** `apps/web/app/(app)/settings/account/page.tsx`, `apps/web/components/settings/AccountForm.tsx`, `apps/web/components/settings/DeleteAccountDialog.tsx`

- [ ] **Step 1: AccountForm**

```tsx
// apps/web/components/settings/AccountForm.tsx
"use client";
import { useState, useTransition } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@workspace/ui/components/field";
import { Separator } from "@workspace/ui/components/separator";
import { toast } from "sonner";
import { updatePassword } from "@/actions/settings";
import { signOut } from "@/actions/auth";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function AccountForm({ email }: { email: string }) {
  const [pwd, setPwd] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <FieldDescription>{email}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="new-pwd">Change password</FieldLabel>
          <Input id="new-pwd" type="password" minLength={8} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New password (min 8)" />
          <Button
            disabled={pwd.length < 8}
            onClick={() => startTransition(async () => {
              const result = await updatePassword({ password: pwd });
              if (!result.ok) toast.error(result.error.message); else { toast.success("Password updated."); setPwd(""); }
            })}
          >
            Update password
          </Button>
        </Field>
      </FieldGroup>

      <Separator />

      <form action={signOut}>
        <Button type="submit" variant="outline">Sign out</Button>
      </form>

      <Separator />

      <div>
        <h2 className="text-base font-semibold text-destructive mb-2">Danger zone</h2>
        <DeleteAccountDialog />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: DeleteAccountDialog**

```tsx
// apps/web/components/settings/DeleteAccountDialog.tsx
"use client";
import { useState, useTransition } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { toast } from "sonner";
import { deleteAccount } from "@/actions/admin/delete-account";

export function DeleteAccountDialog() {
  const [confirm, setConfirm] = useState("");
  const [, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your workspace, pages, collections, fills, trades, and uploaded files.
            This cannot be undone. Type <strong>delete</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="delete" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirm !== "delete"}
            onClick={() => startTransition(async () => {
              const result = await deleteAccount();
              if (!result.ok) toast.error(result.error.message);
              else window.location.href = "/sign-in";
            })}
          >
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Page**

```tsx
// apps/web/app/(app)/settings/account/page.tsx
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "@/components/settings/AccountForm";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Account</h1>
      <AccountForm email={user!.email!} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(settings): Account page with password change and account deletion"
```

---

### Task 7: Cmd+K Command Palette

**Files:**
- Create: `apps/web/components/command-palette/CommandPalette.tsx`
- Create: `apps/web/components/command-palette/useCommands.ts`
- Modify: `apps/web/components/shells/AppShell.tsx`

- [ ] **Step 1: useCommands hook**

```ts
// apps/web/components/command-palette/useCommands.ts
"use client";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "@/actions/auth";
import { createPage } from "@/actions/pages";
import { applyTemplate } from "@/actions/templates";
import { templates } from "@/lib/templates";
import { connections } from "@/lib/connections";

export type Command = {
  id: string;
  group: "Navigation" | "Create" | "Settings" | "Account";
  label: string;
  keywords?: string[];
  run: () => void | Promise<void>;
};

export function useCommands(pages: Array<{ id: string; title: string; page_type: "dashboard"|"collection" }>): Command[] {
  const router = useRouter();
  const { setTheme } = useTheme();

  const commands: Command[] = [
    // Navigation: jump to any page
    ...pages.map((p): Command => ({
      id: `goto-${p.id}`,
      group: "Navigation",
      label: `Go to ${p.title}`,
      run: () => router.push(p.page_type === "dashboard" ? `/p/${p.id}` : `/c/${p.id}`),
    })),
    {
      id: "goto-home", group: "Navigation", label: "Go to Home", run: () => router.push("/"),
    },

    // Create
    {
      id: "create-dashboard", group: "Create", label: "New blank dashboard", keywords: ["new", "dashboard"],
      run: async () => { const r = await createPage({ pageType: "dashboard", title: "Untitled" }); if (r.ok) router.push(`/p/${r.data.id}`); },
    },
    {
      id: "create-collection", group: "Create", label: "New blank collection", keywords: ["new", "collection"],
      run: async () => { const r = await createPage({ pageType: "collection", title: "Untitled" }); if (r.ok) router.push(`/c/${r.data.id}`); },
    },
    ...templates.map((t): Command => ({
      id: `template-${t.id}`, group: "Create", label: `Apply template: ${t.name}`,
      keywords: ["template", t.name.toLowerCase()],
      run: async () => { const r = await applyTemplate({ templateId: t.id }); if (r.ok) router.push(`/p/${r.data.id}`); },
    })),

    // Settings
    { id: "settings-account", group: "Settings", label: "Open Account settings", run: () => router.push("/settings/account") },
    { id: "settings-profile", group: "Settings", label: "Open Profile settings", run: () => router.push("/settings/profile") },
    { id: "settings-appearance", group: "Settings", label: "Open Appearance settings", run: () => router.push("/settings/appearance") },
    { id: "settings-connections", group: "Settings", label: "Open Connections settings", run: () => router.push("/settings/connections") },
    { id: "theme-light", group: "Settings", label: "Theme: Light", run: () => setTheme("light") },
    { id: "theme-dark", group: "Settings", label: "Theme: Dark", run: () => setTheme("dark") },
    { id: "theme-system", group: "Settings", label: "Theme: System", run: () => setTheme("system") },

    // Account
    { id: "sign-out", group: "Account", label: "Sign out", run: () => signOut() },
  ];
  return commands;
}
```

- [ ] **Step 2: CommandPalette component**

```tsx
// apps/web/components/command-palette/CommandPalette.tsx
"use client";
import { useEffect, useState } from "react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@workspace/ui/components/command";
import { useCommands, type Command } from "./useCommands";

export function CommandPalette({ pages }: { pages: any[] }) {
  const [open, setOpen] = useState(false);
  const commands = useCommands(pages);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const groups: Record<Command["group"], Command[]> = {
    Navigation: [], Create: [], Settings: [], Account: [],
  };
  for (const c of commands) groups[c.group].push(c);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {(Object.keys(groups) as Command["group"][]).map((g, i) => (
          <div key={g}>
            {i > 0 && groups[g].length > 0 && <CommandSeparator />}
            {groups[g].length > 0 && (
              <CommandGroup heading={g}>
                {groups[g].map((cmd) => (
                  <CommandItem key={cmd.id} value={cmd.label + " " + (cmd.keywords ?? []).join(" ")}
                               onSelect={() => { cmd.run(); setOpen(false); }}>
                    {cmd.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 3: Wire into AppShell**

```tsx
// apps/web/components/shells/AppShell.tsx
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { listPages } from "@/actions/pages";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const pagesResult = await listPages();
  const pages = pagesResult.ok ? pagesResult.data : [];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 h-12">
          <SidebarTrigger />
          <CommandPalette pages={pages as any} />
          <span className="ml-auto text-xs text-muted-foreground">Press ⌘K</span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components
git commit -m "feat(palette): Cmd+K command palette with navigation, create, settings, account groups"
```

---

### Task 8: Page emoji picker

**Files:** `apps/web/components/pages/PageEmojiPicker.tsx`, modify `PageHeader.tsx`

- [ ] **Step 1: Picker component**

```tsx
// apps/web/components/pages/PageEmojiPicker.tsx
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { changePageEmoji } from "@/actions/pages";

const Picker = dynamic(() => import("@emoji-mart/react").then((m) => m.default), { ssr: false });
import data from "@emoji-mart/data";

export function PageEmojiPicker({ pageId, current }: { pageId: string; current: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="text-3xl hover:bg-muted rounded p-1">
        {current ?? "📄"}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto">
        <Picker
          data={data}
          onEmojiSelect={(e: any) => {
            void changePageEmoji({ pageId, emoji: e.native });
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Use in PageHeader**

In `PageHeader.tsx`, replace `{emoji && <span className="text-3xl">{emoji}</span>}` with:

```tsx
import { PageEmojiPicker } from "./PageEmojiPicker";

<PageEmojiPicker pageId={pageId} current={emoji} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/pages
git commit -m "feat(pages): emoji picker on page headers"
```

---

### Task 9: Sentry integration

**Files:** `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, modify `next.config.ts`

- [ ] **Step 1: Run the Sentry wizard (manual, but documented)**

```bash
cd apps/web
pnpm dlx @sentry/wizard@latest -i nextjs
```

This creates `sentry.{client,server,edge}.config.ts` and modifies `next.config.ts`.

- [ ] **Step 2: Set env vars**

Add to `.env.example` and `.env.local`:
```
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

- [ ] **Step 3: Commit (after the wizard run)**

```bash
git add apps/web sentry.* next.config.ts .env.example
git commit -m "chore: Sentry integration"
```

---

### Task 10: Vercel Analytics

**Files:** modify `apps/web/app/layout.tsx`

- [ ] **Step 1: Add the component**

```tsx
// in apps/web/app/layout.tsx, inside <body>:
import { Analytics } from "@vercel/analytics/react";

<ThemeProvider>
  {children}
  <Toaster />
  <Analytics />
</ThemeProvider>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat: Vercel Analytics"
```

---

### Task 11: Lighthouse CI gate

**Files:** `.lighthouserc.json`, modify `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.lighthouserc.json`**

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/sign-in", "http://localhost:3000/"],
      "startServerCommand": "pnpm start",
      "startServerReadyPattern": "started server on",
      "numberOfRuns": 2
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

- [ ] **Step 2: Add Lighthouse step to CI**

Append to the `ci` job in `.github/workflows/ci.yml`:

```yaml
      - name: Build
        run: pnpm build

      - name: Lighthouse CI
        run: pnpm dlx @lhci/cli@latest autorun
```

- [ ] **Step 3: Commit + push**

```bash
git add .lighthouserc.json .github/workflows/ci.yml
git commit -m "ci: Lighthouse gate (perf 90, a11y 90)"
git push
gh run watch --repo Buddalish/backdesk
```

If Lighthouse fails on first run, dig into the report and fix the worst offenders before continuing.

---

### Task 12: Accessibility audit (axe)

**Files:** `apps/web/lib/a11y.ts`, smoke test in `apps/web/components/ui-a11y.test.ts`

- [ ] **Step 1: Add axe to render-tree tests**

```ts
// apps/web/components/ui-a11y.test.ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/card";

async function check(node: HTMLElement) {
  const result = await axe.run(node, { resultTypes: ["violations"] });
  if (result.violations.length) {
    throw new Error(JSON.stringify(result.violations, null, 2));
  }
}

describe("a11y smoke", () => {
  it("Button has accessible name", async () => {
    const { container } = render(<Button>Click me</Button>);
    await check(container);
  });
  it("Card composition is accessible", async () => {
    const { container } = render(
      <Card>
        <CardHeader><CardTitle>Title</CardTitle></CardHeader>
        <CardContent>Body</CardContent>
      </Card>
    );
    await check(container);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm --filter web exec vitest run components/ui-a11y.test.ts
git add apps/web/components/ui-a11y.test.ts
git commit -m "test(a11y): axe smoke tests for Button and Card"
```

---

### Task 13: README + push

- [ ] **Step 1: Update README to reflect everything**

Append to `README.md`:

```markdown
## Features (v1)

- Pages: dashboards (Plate.js block editor) or collections (typed list view)
- Collections: text, number, currency, date, datetime, select, multi-select, checkbox fields
- Block types: Card, Chart, Table, Row (all generic — read from any collection)
- IBKR Activity Statement importer + round-trip aggregation
- Three trading templates (Performance Dashboard, Daily Journal, Weekly Review)
- Auth (email/password, Google OAuth)
- Settings: account, profile, appearance (light/dark + accent color), connections
- Cmd+K command palette
- Multi-tenant via Supabase RLS
```

- [ ] **Step 2: Final push + verify**

```bash
git add README.md
git commit -m "docs: README features list"
git push
gh run watch --repo Buddalish/backdesk
```

---

## Plan 5 — Done. v1 is launchable.

What you have:
- All settings pages (account, profile, appearance, connections)
- Theming: light/dark + 6 accent colors
- Cmd+K command palette
- Page emoji picker
- Sentry error tracking
- Vercel Analytics
- Lighthouse CI gating PRs at perf ≥ 90 / a11y ≥ 90
- axe accessibility smoke tests

## Post-execution

After Plan 5 ships:
1. Deploy to Vercel production
2. Use the app for a week. Track real friction points in a follow-up doc.
3. Decide what's next: Billing? Marketing site? More connections (Schwab, Plaid, generic CSV)? More views (kanban, calendar)? User-defined relations? Each is its own brainstorm → spec → plan cycle.
