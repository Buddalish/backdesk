# Backdesk Plan 5 — Pre-execution Refinement Notes

> **Read this BEFORE executing `2026-04-28-backdesk-5-polish.md`.** It supersedes specific tasks/snippets in that plan based on what shipped in Plans 1–4 and on a re-read of the current codebase.

---

## What changed vs. the original Plan 5 draft

### 1. Preset b2fA is OKLCH, not HSL — accent overrides must match

The plan's accent block uses HSL like `--primary: 217.2 91.2% 59.8%;`. The **actual** preset (`packages/ui/src/styles/globals.css`) defines all theme tokens in `oklch(...)`. Mixing color spaces in the same variable causes shadcn's contrast/hover utilities to misbehave.

**Replace Task 2 Step 3 entirely** with this OKLCH block. Note the *two* `[data-accent]` selectors — one under `:root` (light mode) and one under `.dark` (dark mode). The accent has to look right in both.

```css
/* Accent overrides — applied via <html data-accent="..."> from AppearanceForm.
   Values picked to harmonize with b2fA's near-monochrome base.
   The "default" accent uses the preset's existing :root values (no override). */

:root[data-accent="blue"] {
  --primary: oklch(0.55 0.20 260);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.55 0.20 260);
}
.dark[data-accent="blue"] {
  --primary: oklch(0.70 0.17 260);
  --primary-foreground: oklch(0.205 0 0);
  --ring: oklch(0.70 0.17 260);
}

:root[data-accent="emerald"] {
  --primary: oklch(0.58 0.15 160);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.58 0.15 160);
}
.dark[data-accent="emerald"] {
  --primary: oklch(0.72 0.14 160);
  --primary-foreground: oklch(0.205 0 0);
  --ring: oklch(0.72 0.14 160);
}

:root[data-accent="rose"] {
  --primary: oklch(0.60 0.22 15);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.60 0.22 15);
}
.dark[data-accent="rose"] {
  --primary: oklch(0.72 0.20 15);
  --primary-foreground: oklch(0.205 0 0);
  --ring: oklch(0.72 0.20 15);
}

:root[data-accent="amber"] {
  --primary: oklch(0.70 0.16 70);
  --primary-foreground: oklch(0.205 0 0);
  --ring: oklch(0.70 0.16 70);
}
.dark[data-accent="amber"] {
  --primary: oklch(0.78 0.14 70);
  --primary-foreground: oklch(0.205 0 0);
  --ring: oklch(0.78 0.14 70);
}

:root[data-accent="violet"] {
  --primary: oklch(0.55 0.22 290);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.55 0.22 290);
}
.dark[data-accent="violet"] {
  --primary: oklch(0.68 0.20 290);
  --primary-foreground: oklch(0.205 0 0);
  --ring: oklch(0.68 0.20 290);
}
```

Also update `SWATCHES` in `AppearanceForm.tsx` to use the same oklch colors (Task 4 Step 1):

```ts
const SWATCHES: Record<Accent, string> = {
  default: "var(--primary)",
  blue: "oklch(0.60 0.20 260)",
  emerald: "oklch(0.65 0.15 160)",
  rose: "oklch(0.66 0.22 15)",
  amber: "oklch(0.74 0.16 70)",
  violet: "oklch(0.62 0.22 290)",
};
```

After implementing, **verify visually** in the Appearance page in both light and dark mode. Tweak lightness/chroma per accent if any read as too washed-out or oversaturated against b2fA's grays. Don't ship without this visual check.

### 2. profiles table already has all the columns we need

`supabase/migrations/20260428000001_profiles.sql` already defines: `display_name`, `avatar_path`, `timezone`, `theme_mode`, `theme_accent` — and the CHECK constraint matches the accent names above. **No new profiles migration needed.** Skip any plan step that suggests adding columns; just write to them.

### 3. Sentry wizard is interactive — replace Task 9 Step 1 with manual scaffolding

`pnpm dlx @sentry/wizard` requires interactive input (DSN paste, source-map upload toggles). Subagent execution will hang. Replace Task 9 Step 1 with the three config files written manually:

```ts
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      // Strip user PII — we only want errors, not who hit them
      if (event.user) { event.user = { id: event.user.id }; }
      return event;
    },
  });
}
```

```ts
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
}
```

```ts
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
}
```

And in `apps/web/next.config.ts`, wrap the export with `withSentryConfig`:

```ts
import { withSentryConfig } from "@sentry/nextjs";
const nextConfig = { /* existing */ };
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

The `if (dsn)` guards mean dev environments without Sentry vars set don't crash. Production env vars get added in Vercel.

### 4. Lighthouse CI — fix server command and ready pattern

Plan 5 Task 11 uses `pnpm start` and `started server on`. Neither matches reality:
- `pnpm start` at the repo root has no script — must be `pnpm --filter web start`
- Next.js 15 logs `▲ Next.js ...` then `✓ Ready in ...` — the matcher needs to handle both lines

Replace `.lighthouserc.json` with:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/sign-in", "http://localhost:3000/sign-up"],
      "startServerCommand": "pnpm --filter web start",
      "startServerReadyPattern": "Ready in",
      "numberOfRuns": 2
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Changes:
- Test only **unauthenticated** routes (`/sign-in`, `/sign-up`) so we don't need to seed an auth session in CI. The authenticated `/` redirects there anyway.
- Demote performance to `warn` at 0.85 — Plate-heavy `/p/[pageId]` routes already needed prod-build mode in Playwright (Plan 3), realistic perf threshold for the unauthenticated forms is the better gate. `accessibility` stays at error/0.9.
- Build is already produced by the existing `pnpm --filter web build` step. The `assert` step expects `dist`/`.next` to exist — make sure the Lighthouse step in CI runs **after** Build, not in parallel.

### 5. axe-core in jsdom is unreliable — run a11y in Playwright instead

Task 12 plans `axe-core` inside vitest jsdom. axe explicitly documents incomplete jsdom support — many checks no-op or false-pass without a real layout engine. We already have Playwright running in CI; do a11y there.

Replace Task 12 entirely with:

```bash
pnpm --filter web add -D @axe-core/playwright
```

```ts
// tests/e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("sign-in page has no a11y violations", async ({ page }) => {
  await page.goto("/sign-in");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("sign-up page has no a11y violations", async ({ page }) => {
  await page.goto("/sign-up");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

Drop `axe-core` and `@axe-core/react` from Task 1. They're not needed.

### 6. Cmd+K — small fixes to the snippet

In `useCommands.ts`:
- Remove the unused `import { connections }` (Task 7 Step 1, line 770 in plan)
- Type `pages` properly in `CommandPalette` — replace `pages: any[]` with `pages: Array<{ id: string; title: string; page_type: "dashboard"|"collection" }>`

In the keyboard handler in Task 7 Step 2: also bind to the platform-correct **Mac vs Windows** modifier. The `metaKey || ctrlKey` already handles both — leave as-is. But add `e.target instanceof HTMLInputElement` guard so ⌘K doesn't fire while a user is typing in inputs.

```ts
const handler = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    // Allow ⌘K even when focused in form fields (it's a global shortcut)
    e.preventDefault(); setOpen((v) => !v);
  }
};
```

(Actually leave the current behavior — global ⌘K is the right call. Just leaving the comment so the executor doesn't get tempted to "fix" it.)

### 7. Profile timezone picker — use shadcn Combobox, not native select

Task 5 Step 2 has a comment "Use shadcn's Combobox" but then writes a `<select>`. Native select with 400+ timezones is unusable. Use shadcn's Combobox component:

```bash
pnpm dlx shadcn@latest add combobox --yes
```

```tsx
// in ProfileForm.tsx
import { Combobox } from "@workspace/ui/components/combobox";

<Combobox
  options={TIMEZONES.map((t) => ({ value: t, label: t }))}
  value={tz}
  onValueChange={(v) => { setTz(v); commit(); }}
  placeholder="Search timezones…"
/>
```

(Shadcn's Combobox API may differ slightly; adapt to whatever the registry produces.)

### 8. AvatarUpload — `<Button asChild>` doesn't pass `disabled`

In Task 5 Step 1, `<Button asChild variant="outline" size="sm" disabled={uploading}>` — `asChild` makes Button render its child directly, so the `disabled` prop is dropped on a `<span>`. Either:

(a) Drop `asChild` and put the file input on the same row visually:

```tsx
<Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
  {uploading ? "Uploading…" : "Change avatar"}
</Button>
<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
```

(b) Or apply `aria-disabled` to the span and add CSS to make it look disabled.

Prefer (a) — simpler.

### 9. Avatars bucket migration — make sure it lands in the right migration directory

Task 5 Step 4's SQL is correct, but the `supabase migration new` command produces a timestamped file. The implementer should pick the **next sequence number** (after `20260430000003_fix_collection_rows_dedup_idx.sql`). Use `2026040X000001` style consistent with existing files. Don't let CLI auto-generate a 14-digit timestamp that breaks alphabetical ordering.

### 10. Order of execution

Run tasks in this order (slightly different from the plan's numbering):
1. **Task 1** — install deps (drop `axe-core` and `@axe-core/react`, add `@axe-core/playwright -D`)
2. **Task 2** — Theme provider + accent CSS (use OKLCH block above)
3. **Task 3** — settings actions
4. **Task 4** — Appearance page (visual-verify both modes against b2fA before committing)
5. **Task 5** — Profile page (with Combobox + AvatarUpload fixes)
6. **Task 6** — Account page
7. **Task 7** — Cmd+K palette
8. **Task 8** — Emoji picker
9. **Task 9** — Sentry (manual configs, not wizard)
10. **Task 10** — Vercel Analytics (one-line addition)
11. **Task 11** — Lighthouse CI (use the unauthenticated-only config)
12. **Task 12** — A11y via Playwright (replaces vitest+axe approach)
13. **Task 13** — README + push

### 11. Things that are fine in the original plan

- The overall architecture decisions (next-themes for mode, CSS-var swaps for accent, emoji-mart, @vercel/analytics, etc.)
- The settings actions structure (zod validation + Server Actions, admin client only for delete-account)
- DeleteAccountDialog confirm-by-typing pattern
- The decision to test Lighthouse on unauth routes and the temporary-public-storage upload target
- Skipping radius axis (per memory)

---

## Risks the executor should watch for

1. **Visual quality of accents under b2fA.** Fastest sanity check: after Task 4 lands, open `/settings/appearance`, click each accent, switch light/dark, look at any colored UI (buttons, links, focus rings). If anything looks wrong, tune the OKLCH triplet for that accent before moving on.
2. **Cmd+K shortcut on Plate pages.** Plate has its own keyboard handling — `⌘K` should still bubble out, but verify by opening a `/p/[pageId]` page and pressing ⌘K from inside the editor.
3. **Lighthouse perf on warm vs cold runs.** Numbers vary ±5 points on identical code. Run twice (`numberOfRuns: 2`) is set — if both runs are below threshold, the threshold is wrong, not the code.
4. **Sentry source maps in prod.** `withSentryConfig` reads `SENTRY_AUTH_TOKEN` and uploads source maps on build. If that env var is missing in Vercel, the build will warn but not fail (silent: true). Make sure prod env has the token before relying on stack traces.
