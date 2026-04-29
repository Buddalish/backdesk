# Backdesk Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo with auth and an empty AppShell. After this plan, a user can sign up, sign in, sign out, and see an empty workspace.

**Architecture:** shadcn monorepo (Turborepo + pnpm workspaces) scaffolded via shadcn CLI. Supabase Auth with email/password + Google OAuth. Next.js App Router with middleware-enforced auth gate. Server Components for reads, Server Actions for writes. RLS policies on `profiles` table.

**Tech Stack:** Next.js 15, shadcn/ui, Supabase (Auth + Postgres + Storage), Turborepo, pnpm, Tailwind v4, TypeScript, Vitest, Playwright.

**Pre-execution refinement:** Before starting this plan, re-read [docs/superpowers/specs/2026-04-28-backdesk-v1-design.md](../specs/2026-04-28-backdesk-v1-design.md) Sections 1, 2, 3, 5, 14, 18 (Architecture, Vision, System Architecture, Auth/RLS, Project Layout, Accessibility). Verify the GitHub repo exists at `https://github.com/Buddalish/backdesk.git` (create it if not). Update task 28 with the correct remote URL if it has changed.

---

## File structure created in this plan

```
Trading/
├── .github/workflows/ci.yml
├── .gitignore
├── .env.example
├── apps/web/
│   ├── app/
│   │   ├── (marketing)/page.tsx
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   ├── reset-password/page.tsx
│   │   │   └── callback/route.ts
│   │   ├── (app)/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── actions/
│   │   ├── auth.ts
│   │   └── profile.ts
│   ├── components/
│   │   ├── auth/
│   │   │   ├── SignInForm.tsx
│   │   │   ├── SignUpForm.tsx
│   │   │   └── ResetPasswordForm.tsx
│   │   ├── shells/
│   │   │   ├── AppShell.tsx
│   │   │   └── AuthShell.tsx
│   │   └── sidebar/
│   │       └── AppSidebar.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── browser.ts
│   │   │   ├── server.ts
│   │   │   └── admin.ts
│   │   └── utils.ts
│   ├── middleware.ts
│   ├── components.json
│   ├── next.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── playwright.config.ts
├── packages/
│   ├── ui/                                  -- managed by shadcn CLI
│   ├── eslint-config/
│   └── typescript-config/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20260428000001_profiles.sql
│   └── seed.sql
├── tests/e2e/
│   └── auth.spec.ts
├── docs/superpowers/                        -- already exists
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

### Task 1: Initialize git repo

**Files:**
- Create: `/Users/tristanfleming/Documents/Code/Trading/.gitignore`

- [ ] **Step 1: Initialize git in the project root**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
git init
```

Expected: `Initialized empty Git repository in /Users/tristanfleming/Documents/Code/Trading/.git/`

- [ ] **Step 2: Create root .gitignore**

```
# dependencies
node_modules
.pnp
.pnp.js
.yarn/install-state.gz

# build outputs
.next/
.turbo/
dist/
build/
out/

# testing
coverage/
playwright-report/
test-results/
playwright/.cache/

# env
.env
.env*.local

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# editor
.vscode/
.idea/
.DS_Store
*.swp

# supabase
supabase/.branches
supabase/.temp

# superpowers (brainstorm scratch — already exists)
.superpowers/
```

- [ ] **Step 3: Initial commit (preserve the spec/plans we already wrote)**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
git add .gitignore docs/
git commit -m "chore: init repo with spec and plans"
```

Expected: commit succeeds; `git log --oneline` shows one commit.

---

### Task 2: Scaffold the monorepo with shadcn CLI

**Files:**
- Many — created by the CLI

- [ ] **Step 1: Run the scaffold command (note: project root must be empty of `package.json`)**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
npx shadcn@latest init --name backdesk --template next --preset b2oWqHU1I --monorepo --yes
```

Expected: CLI creates `apps/web/`, `packages/ui/`, `packages/eslint-config/`, `packages/typescript-config/`, plus root `package.json`, `pnpm-workspace.yaml`, `turbo.json`. Installs dependencies.

- [ ] **Step 2: Verify the dev server starts**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm dev
```

Expected: Turbo starts `apps/web` on `http://localhost:3000`. Visit it; should see the default shadcn home page. Stop with Ctrl-C.

- [ ] **Step 3: Verify package manager and aliases**

```bash
cat package.json | grep packageManager
cat apps/web/components.json | grep -A2 aliases
```

Expected: `"packageManager": "pnpm@..."`, and `apps/web/components.json` aliases include `"ui": "@workspace/ui/components"`.

- [ ] **Step 4: Commit the scaffold**

```bash
git add .
git commit -m "chore: scaffold shadcn monorepo with --preset b2oWqHU1I"
```

---

### Task 3: Add foundational shadcn components

**Files:**
- Create: components in `packages/ui/src/components/` (CLI-managed)

- [ ] **Step 1: Add components needed for auth pages and AppShell**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm dlx shadcn@latest add button input label card form separator sidebar sonner skeleton field --yes
```

Expected: components added under `packages/ui/src/components/`.

- [ ] **Step 2: Verify components landed in the right place**

```bash
ls packages/ui/src/components/ | sort
```

Expected: lists `button.tsx`, `card.tsx`, `field.tsx`, `form.tsx`, `input.tsx`, `label.tsx`, `separator.tsx`, `sidebar.tsx`, `skeleton.tsx`, `sonner.tsx`.

- [ ] **Step 3: Commit**

```bash
git add packages/ui apps/web
git commit -m "chore: add foundational shadcn components"
```

---

### Task 4: Provision Supabase (local + remote project)

**Files:**
- Create: `.env.example` at the project root
- Modify: `.gitignore` (already covers `.env*.local`)

- [ ] **Step 1: Install the Supabase CLI globally if not already installed**

```bash
which supabase || brew install supabase/tap/supabase
```

Expected: a working `supabase` binary on PATH.

- [ ] **Step 2: Initialize Supabase config in the repo**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
supabase init
```

Expected: creates `supabase/config.toml` and an empty `supabase/migrations/` directory.

- [ ] **Step 3: Start local Supabase (Docker required)**

```bash
supabase start
```

Expected: pulls Docker images on first run, starts services, prints the local API URL, anon key, service role key, and Studio URL.

- [ ] **Step 4: Create `.env.example` at project root with the keys you'll need**

```
# Supabase — fill in from `supabase status` (local) or your project dashboard (prod)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Create `apps/web/.env.local` (NOT committed) with local Supabase values**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
supabase status -o json | jq -r '"NEXT_PUBLIC_SUPABASE_URL=" + .API_URL, "NEXT_PUBLIC_SUPABASE_ANON_KEY=" + .ANON_KEY, "SUPABASE_SERVICE_ROLE_KEY=" + .SERVICE_ROLE_KEY' > apps/web/.env.local
cat apps/web/.env.local
```

Expected: file shows three populated env lines.

- [ ] **Step 6: Commit Supabase config + env example**

```bash
git add supabase/config.toml .env.example .gitignore
git commit -m "chore: init supabase (local) and add env example"
```

---

### Task 5: Install Supabase JS packages in apps/web

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add `@supabase/ssr` and `@supabase/supabase-js`**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm --filter web add @supabase/ssr @supabase/supabase-js
```

Expected: `apps/web/package.json` shows the two deps; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add supabase ssr and js client"
```

---

### Task 6: Create Supabase browser client

**Files:**
- Create: `apps/web/lib/supabase/browser.ts`

- [ ] **Step 1: Write the browser client**

```ts
// apps/web/lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm --filter web typecheck
```

Expected: passes (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/supabase/browser.ts
git commit -m "feat(web): add supabase browser client"
```

---

### Task 7: Create Supabase server client

**Files:**
- Create: `apps/web/lib/supabase/server.ts`

- [ ] **Step 1: Write the server client (cookie-based session)**

```ts
// apps/web/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore;
            // middleware will refresh the session.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/supabase/server.ts
git commit -m "feat(web): add supabase server client"
```

---

### Task 8: Create Supabase admin client (with import guard)

**Files:**
- Create: `apps/web/lib/supabase/admin.ts`
- Create: `apps/web/.eslintrc.json` (or extend root config) to deny client imports of admin

- [ ] **Step 1: Write the admin client**

```ts
// apps/web/lib/supabase/admin.ts
// SERVER-ONLY. Bypasses RLS — use only inside actions/admin/* Server Actions.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 2: Add ESLint rule restricting where admin can be imported**

Edit `apps/web/eslint.config.mjs` (or create if scaffolded as `.eslintrc.json` — adapt for the actual file shape). Add a `no-restricted-imports` rule:

```js
// apps/web/eslint.config.mjs (excerpt — add to existing config)
{
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/lib/supabase/admin"],
            message: "Admin client may only be imported from actions/admin/* — it bypasses RLS.",
          },
        ],
      },
    ],
  },
  // ...allow inside actions/admin/**
  overrides: [
    {
      files: ["actions/admin/**/*.ts", "actions/admin/**/*.tsx"],
      rules: { "no-restricted-imports": "off" },
    },
  ],
}
```

- [ ] **Step 3: Verify lint catches a misuse**

Temporarily import `createAdminClient` in `apps/web/app/(app)/page.tsx`. Run:
```bash
pnpm --filter web lint
```
Expected: ERROR pointing at the restricted import. Then revert the change.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/supabase/admin.ts apps/web/eslint.config.mjs
git commit -m "feat(web): add supabase admin client with import guard"
```

---

### Task 9: First migration — profiles table + RLS

**Files:**
- Create: `supabase/migrations/20260428000001_profiles.sql`

- [ ] **Step 1: Generate a migration file**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
supabase migration new profiles
```

Expected: creates `supabase/migrations/<timestamp>_profiles.sql`. Rename to `20260428000001_profiles.sql` for stable ordering.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20260428000001_profiles.sql

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_path TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light','dark','system')),
  theme_accent TEXT NOT NULL DEFAULT 'default'
    CHECK (theme_accent IN ('default','blue','emerald','rose','amber','violet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self ON profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 3: Apply migration locally**

```bash
supabase db reset
```

Expected: drops local DB, replays all migrations, prints success.

- [ ] **Step 4: Verify table exists**

```bash
supabase db dump --data-only --schema public 2>&1 | head -20
psql $(supabase status -o json | jq -r .DB_URL) -c "\d profiles"
```

Expected: shows the `profiles` table with the columns above and `Row level security: enabled`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): profiles table with RLS"
```

---

### Task 10: Generate Supabase TypeScript types

**Files:**
- Create: `apps/web/lib/supabase/types.ts`
- Add: a `pnpm db:types` script to root `package.json`

- [ ] **Step 1: Add the script**

Edit `/Users/tristanfleming/Documents/Code/Trading/package.json`:
```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --local > apps/web/lib/supabase/types.ts"
  }
}
```

- [ ] **Step 2: Generate types**

```bash
pnpm db:types
```

Expected: file `apps/web/lib/supabase/types.ts` is created with `export type Database = { ... }` reflecting the `profiles` table.

- [ ] **Step 3: Wire types into clients**

Update `browser.ts`, `server.ts`, `admin.ts` to use `Database` generic:
```ts
// browser.ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
export function createClient() {
  return createBrowserClient<Database>( /* ... */ );
}
```

Same change in `server.ts` and `admin.ts`.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/supabase/types.ts package.json apps/web/lib/supabase/{browser,server,admin}.ts
git commit -m "feat(web): generate and wire supabase types"
```

---

### Task 11: Create middleware for session refresh + auth gate

**Files:**
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Write the middleware**

```ts
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAppRoute = path === "/" || path.startsWith("/p/") || path.startsWith("/c/")
    || path.startsWith("/settings");
  const isAuthRoute = path.startsWith("/sign-in") || path.startsWith("/sign-up")
    || path.startsWith("/reset-password");

  if (isAppRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat(web): middleware for session refresh and auth gate"
```

---

### Task 12: Create AuthShell layout

**Files:**
- Create: `apps/web/components/shells/AuthShell.tsx`
- Create: `apps/web/app/(auth)/layout.tsx`

- [ ] **Step 1: Write the AuthShell**

```tsx
// apps/web/components/shells/AuthShell.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Write the (auth) layout**

```tsx
// apps/web/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/shells/AuthShell.tsx apps/web/app/\(auth\)/layout.tsx
git commit -m "feat(web): AuthShell card layout"
```

---

### Task 13: Sign-up Server Action + page

**Files:**
- Create: `apps/web/actions/auth.ts`
- Create: `apps/web/components/auth/SignUpForm.tsx`
- Create: `apps/web/app/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Write `signUp` Server Action**

```ts
// apps/web/actions/auth.ts
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
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0].message } };
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
```

- [ ] **Step 2: Write the SignUpForm**

```tsx
// apps/web/components/auth/SignUpForm.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { signUp } from "@/actions/auth";

export function SignUpForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await signUp(fd);
          if (result && !result.ok) {
            toast.error(result.error.message);
          } else {
            router.refresh();
          }
        })
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 3: Write the sign-up page**

```tsx
// apps/web/app/(auth)/sign-up/page.tsx
import Link from "next/link";
import { AuthShell } from "@/components/shells/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your Backdesk account"
      description="One workspace for your data."
    >
      <SignUpForm />
      <p className="mt-4 text-sm text-muted-foreground text-center">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
```

- [ ] **Step 5: Manual verify**

```bash
pnpm dev
```

Open `http://localhost:3000/sign-up`, fill in an email + password (≥8 chars), submit. Verify it redirects to `/` (will currently 404 since we haven't built the (app) layout — that's fine, we'll fix in Task 19). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/actions/auth.ts apps/web/components/auth/SignUpForm.tsx apps/web/app/\(auth\)/sign-up/page.tsx
git commit -m "feat(web): sign-up page and Server Action"
```

---

### Task 14: Sign-in Server Action + page

**Files:**
- Modify: `apps/web/actions/auth.ts` (add `signIn`)
- Create: `apps/web/components/auth/SignInForm.tsx`
- Create: `apps/web/app/(auth)/sign-in/page.tsx`

- [ ] **Step 1: Add `signIn` to `actions/auth.ts`**

Append to `apps/web/actions/auth.ts`:

```ts
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
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0].message } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false as const, error: { code: "SIGN_IN_FAILED", message: error.message } };
  }

  redirect("/");
}
```

- [ ] **Step 2: Write the SignInForm**

```tsx
// apps/web/components/auth/SignInForm.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { signIn } from "@/actions/auth";

export function SignInForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await signIn(fd);
          if (result && !result.ok) {
            toast.error(result.error.message);
          } else {
            router.refresh();
          }
        })
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 3: Write the sign-in page**

```tsx
// apps/web/app/(auth)/sign-in/page.tsx
import Link from "next/link";
import { AuthShell } from "@/components/shells/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  return (
    <AuthShell title="Sign in to Backdesk">
      <SignInForm />
      <p className="mt-4 text-sm text-muted-foreground text-center">
        New to Backdesk? <Link href="/sign-up" className="underline">Create an account</Link>
        <br/>
        <Link href="/reset-password" className="underline">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/actions/auth.ts apps/web/components/auth/SignInForm.tsx apps/web/app/\(auth\)/sign-in/page.tsx
git commit -m "feat(web): sign-in page and Server Action"
```

---

### Task 15: Reset-password page + Server Action

**Files:**
- Modify: `apps/web/actions/auth.ts` (add `requestPasswordReset`)
- Create: `apps/web/components/auth/ResetPasswordForm.tsx`
- Create: `apps/web/app/(auth)/reset-password/page.tsx`

- [ ] **Step 1: Add `requestPasswordReset` to `actions/auth.ts`**

```ts
const ResetSchema = z.object({ email: z.string().email() });

export async function requestPasswordReset(formData: FormData) {
  const parsed = ResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0].message } };
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
```

- [ ] **Step 2: Write the ResetPasswordForm**

```tsx
// apps/web/components/auth/ResetPasswordForm.tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { requestPasswordReset } from "@/actions/auth";

export function ResetPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return <p className="text-sm">Check your email for a reset link.</p>;
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await requestPasswordReset(fd);
          if (!result.ok) {
            toast.error(result.error.message);
          } else {
            setSent(true);
          }
        })
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// apps/web/app/(auth)/reset-password/page.tsx
import Link from "next/link";
import { AuthShell } from "@/components/shells/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a link to set a new password."
    >
      <ResetPasswordForm />
      <p className="mt-4 text-sm text-muted-foreground text-center">
        <Link href="/sign-in" className="underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/actions/auth.ts apps/web/components/auth/ResetPasswordForm.tsx apps/web/app/\(auth\)/reset-password/page.tsx
git commit -m "feat(web): reset-password page and Server Action"
```

---

### Task 16: OAuth callback route

**Files:**
- Create: `apps/web/app/(auth)/callback/route.ts`

- [ ] **Step 1: Write the callback handler**

```ts
// apps/web/app/(auth)/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=callback_failed", url.origin));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/app/\(auth\)/callback/route.ts
git commit -m "feat(web): OAuth + email-link callback handler"
```

---

### Task 17: Add Google OAuth button to sign-in/sign-up

**Files:**
- Modify: `apps/web/actions/auth.ts` (add `signInWithGoogle`)
- Modify: `apps/web/components/auth/SignInForm.tsx`
- Modify: `apps/web/components/auth/SignUpForm.tsx`

- [ ] **Step 1: Add `signInWithGoogle` Server Action**

```ts
// append to apps/web/actions/auth.ts
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
```

- [ ] **Step 2: Add a "Continue with Google" button to both forms**

In both `SignInForm.tsx` and `SignUpForm.tsx`, after the existing `<Button type="submit">`, add:

```tsx
import { Separator } from "@workspace/ui/components/separator";
import { signInWithGoogle } from "@/actions/auth";

// inside the JSX, after the FieldGroup:
<div className="mt-4 flex items-center gap-3">
  <Separator className="flex-1" />
  <span className="text-xs text-muted-foreground">OR</span>
  <Separator className="flex-1" />
</div>
<form action={signInWithGoogle} className="mt-4">
  <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
</form>
```

- [ ] **Step 3: Configure Google OAuth in Supabase**

Manual step:
1. Visit `http://localhost:54323` (local Supabase Studio)
2. Authentication → Providers → Google → Enable
3. Add client ID + secret from Google Cloud Console (developer responsibility — document in README)
4. For local dev, the redirect URL is `http://localhost:54321/auth/v1/callback`

- [ ] **Step 4: Verify UI shows the OAuth button**

```bash
pnpm dev
```

Open `/sign-in`, see "Continue with Google" button below the form. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/actions/auth.ts apps/web/components/auth/SignInForm.tsx apps/web/components/auth/SignUpForm.tsx
git commit -m "feat(web): Google OAuth on sign-in/sign-up"
```

---

### Task 18: Profile auto-creation on signup

**Files:**
- Create: `apps/web/actions/profile.ts`
- Modify: `apps/web/app/(auth)/callback/route.ts` (call `ensureProfile` after exchange)
- Modify: `apps/web/actions/auth.ts` (call `ensureProfile` after `signInWithPassword`)
- Add: a Postgres trigger that auto-creates a profile row on `auth.users` insert (the durable defense)

- [ ] **Step 1: Add the DB trigger as a migration**

```bash
supabase migration new ensure_profile_on_signup
```

Edit the new migration file:
```sql
-- Auto-create a profile row whenever a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
pnpm db:types
```

- [ ] **Step 3: Add an `ensureProfile` Server Action as belt-and-suspenders**

```ts
// apps/web/actions/profile.ts
"use server";
import { createClient } from "@/lib/supabase/server";

export async function ensureProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  if (error) return { ok: false as const, error: { code: "PROFILE_UPSERT_FAILED", message: error.message } };
  return { ok: true as const };
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add supabase/migrations apps/web/actions/profile.ts apps/web/lib/supabase/types.ts
git commit -m "feat(db): auto-create profile on signup + ensureProfile action"
```

---

### Task 19: Sign-out Server Action

**Files:**
- Modify: `apps/web/actions/auth.ts`

- [ ] **Step 1: Add `signOut`**

```ts
// append to apps/web/actions/auth.ts
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/actions/auth.ts
git commit -m "feat(web): signOut Server Action"
```

---

### Task 20: AppShell layout with sidebar

**Files:**
- Create: `apps/web/components/shells/AppShell.tsx`
- Create: `apps/web/components/sidebar/AppSidebar.tsx`
- Create: `apps/web/app/(app)/layout.tsx`

- [ ] **Step 1: Write the AppSidebar (minimal: brand + sign out)**

```tsx
// apps/web/components/sidebar/AppSidebar.tsx
"use client";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { Button } from "@workspace/ui/components/button";
import { signOut } from "@/actions/auth";

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="px-3 py-2 font-semibold text-sm">Backdesk</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Pages list goes here in Plan 2 */}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/settings/account">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                <LogOut data-icon="inline-start" />
                Sign out
              </Button>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Write the AppShell**

```tsx
// apps/web/components/shells/AppShell.tsx
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/sidebar/AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 h-12">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 3: Wire the (app) layout**

```tsx
// apps/web/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shells/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/components/sidebar/AppSidebar.tsx apps/web/components/shells/AppShell.tsx apps/web/app/\(app\)/layout.tsx
git commit -m "feat(web): AppShell with sidebar and auth gate"
```

---

### Task 21: Empty-state landing for authenticated users

**Files:**
- Create: `apps/web/app/(app)/page.tsx`

- [ ] **Step 1: Write the empty state**

```tsx
// apps/web/app/(app)/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Backdesk</CardTitle>
          <CardDescription>
            Pages are how you organize your work. Create a dashboard for visualizations, a collection
            for structured data, or import data from a connection. (Page creation ships in Plan 2.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once you've added a page, it'll show up in the sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
pnpm dev
```

Sign in with the user you created in Task 13. You should see the AppShell with sidebar + the "Welcome to Backdesk" card. Sign out via the sidebar; verify redirect to `/sign-in`. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/page.tsx
git commit -m "feat(web): empty-state landing for authenticated users"
```

---

### Task 22: Marketing placeholder page

**Files:**
- Create: `apps/web/app/(marketing)/page.tsx`

- [ ] **Step 1: Write a minimal marketing landing**

```tsx
// apps/web/app/(marketing)/page.tsx
import Link from "next/link";
import { Button } from "@workspace/ui/components/button";

export default function MarketingHome() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold">Backdesk</h1>
      <p className="text-lg text-muted-foreground max-w-md">
        A workspace for your data. Pages of blocks, collections, connections.
      </p>
      <div className="flex gap-3">
        <Button asChild><Link href="/sign-up">Create account</Link></Button>
        <Button asChild variant="outline"><Link href="/sign-in">Sign in</Link></Button>
      </div>
    </div>
  );
}
```

> Note: middleware will route authed users to `/` instead of this page; unauthed users land here only if they hit a non-app, non-auth route. The (marketing) group is mostly a placeholder for the v2 marketing site.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(marketing\)/page.tsx
git commit -m "feat(web): marketing placeholder page"
```

---

### Task 23: Configure Vitest

**Files:**
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json` (add test script)
- Modify: root `turbo.json` (add `test` task)

- [ ] **Step 1: Install Vitest**

```bash
pnpm --filter web add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Write `vitest.setup.ts`**

```ts
// apps/web/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add `test` script**

In `apps/web/package.json` scripts:
```json
{ "test": "vitest run" }
```

In root `turbo.json` pipeline:
```json
{
  "tasks": {
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 5: Add a smoke test that asserts true**

```ts
// apps/web/lib/sanity.test.ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/package.json apps/web/lib/sanity.test.ts turbo.json pnpm-lock.yaml
git commit -m "chore: configure vitest with sanity test"
```

---

### Task 24: Configure Playwright + first E2E test

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `tests/e2e/auth.spec.ts`
- Modify: root `package.json`

- [ ] **Step 1: Install Playwright**

```bash
pnpm --filter web add -D @playwright/test
pnpm --filter web exec playwright install chromium
```

- [ ] **Step 2: Write Playwright config**

```ts
// apps/web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    cwd: "../..",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write the auth E2E test**

```ts
// tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";

test("sign-up flow lands on empty state", async ({ page }) => {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");

  // Wait for redirect to authenticated home
  await page.waitForURL("/");
  await expect(page.getByText("Welcome to Backdesk")).toBeVisible();
});

test("sign-in then sign-out", async ({ page }) => {
  // First sign up so we have a known user
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // Sign out
  await page.locator("button:has-text('Sign out')").click();
  await page.waitForURL("/sign-in");

  // Sign back in
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expect(page.getByText("Welcome to Backdesk")).toBeVisible();
});
```

- [ ] **Step 4: Add a `test:e2e` script to root `package.json`**

```json
{
  "scripts": {
    "test:e2e": "pnpm --filter web exec playwright test"
  }
}
```

- [ ] **Step 5: Run E2E**

In one terminal:
```bash
supabase start
```

In another:
```bash
pnpm test:e2e
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/playwright.config.ts tests/e2e/auth.spec.ts apps/web/package.json package.json pnpm-lock.yaml
git commit -m "test: e2e for sign-up/sign-in/sign-out flows"
```

---

### Task 25: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm --filter web typecheck

      - name: Lint
        run: pnpm --filter web lint

      - name: Unit tests
        run: pnpm --filter web test

      # E2E uses local Supabase via the supabase CLI
      - name: Set up Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start local Supabase
        run: supabase start

      - name: Seed env for E2E
        run: |
          supabase status -o json | jq -r '"NEXT_PUBLIC_SUPABASE_URL=" + .API_URL, "NEXT_PUBLIC_SUPABASE_ANON_KEY=" + .ANON_KEY, "SUPABASE_SERVICE_ROLE_KEY=" + .SERVICE_ROLE_KEY' > apps/web/.env.local

      - name: Install Playwright browsers
        run: pnpm --filter web exec playwright install --with-deps chromium

      - name: E2E
        run: pnpm test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: github actions for typecheck, lint, unit, e2e"
```

---

### Task 26: Push to GitHub remote

**Files:** none

- [ ] **Step 1: Add the remote (verify URL is correct first)**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
git remote add origin https://github.com/Buddalish/backdesk.git
git branch -M main
```

- [ ] **Step 2: Push**

```bash
git push -u origin main
```

Expected: branch `main` pushed; first CI run kicks off on the default branch.

- [ ] **Step 3: Verify CI green**

```bash
gh run watch --repo Buddalish/backdesk
```

Expected: workflow completes successfully. If anything fails, fix locally, commit, push.

---

### Task 27: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write a concise README**

```markdown
# Backdesk

A workspace for your data. Pages of blocks, collections, connections.

## Stack

- Next.js 15 (App Router) + shadcn/ui + Plate.js (added in Plan 3)
- Supabase (Auth + Postgres + Storage)
- Turborepo + pnpm workspaces

## Local development

Prerequisites: Node 20+, pnpm 9+, Docker, Supabase CLI.

```bash
pnpm install
supabase start
pnpm db:types
cp apps/web/.env.example apps/web/.env.local   # then edit with values from `supabase status`
pnpm dev
```

Visit http://localhost:3000.

## Scripts

- `pnpm dev` — run the app in dev
- `pnpm build` / `pnpm start`
- `pnpm test` — unit tests
- `pnpm test:e2e` — Playwright e2e (requires local Supabase running)
- `pnpm db:migrate` — apply migrations to local Supabase
- `pnpm db:types` — regenerate Supabase TypeScript types

## Project layout

See `docs/superpowers/specs/2026-04-28-backdesk-v1-design.md` for the full design.
Plans live in `docs/superpowers/plans/`.
```

- [ ] **Step 2: Commit + push**

```bash
git add README.md
git commit -m "docs: project README"
git push
```

---

## Plan 1 — Done. What you have now

- Monorepo scaffolded (`apps/web`, `packages/ui`)
- Supabase running locally with `profiles` table + RLS + auto-create-on-signup trigger
- Sign-up / sign-in / sign-out / reset-password / Google OAuth all working
- AppShell with sidebar (signed-in users see "Welcome to Backdesk" empty state)
- Vitest + Playwright configured; CI green on push

## Pre-execution refinement notes (read before starting Plan 2)

After executing Plan 1, before starting Plan 2:
1. Re-read [Plan 2 file](./2026-04-28-backdesk-2-pages-collections.md)
2. Note any drift — did Plan 1 deviate from the intended file/folder structure? Update Plan 2's file paths to match.
3. Check if any new components landed in `packages/ui` that Plan 2 assumed (it might not need to add them).
4. Verify `pnpm db:types` is wired and the Supabase client `Database` type is being used everywhere. Plan 2 builds heavily on this.
5. Confirm CI is green and your remote setup matches Plan 2's assumptions (same branch protection, same workflow).
