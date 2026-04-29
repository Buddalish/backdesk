# Backdesk Plan 3: Block Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboards functional. Plate.js editor with custom data-aware blocks (Card, Chart, Table, Row) that read from any Collection. Slash menu, save-race protection, image uploads to Supabase storage. After this plan, you can drop blocks into a dashboard and they render real data from your collections.

**Architecture:** Plate.js + shadcn `@plate` registry. Custom Plate plugins for the four data-aware blocks; each one stores props in the document JSON and reads data from the `Collection` interface (extended in this plan with `aggregate()`). Save uses optimistic concurrency on `pages.updated_at`; debounced `onChange` with flush-on-unload + flush-on-route-change.

**Tech Stack:** Plate.js, `@plate/*` registry components, Recharts (dynamic-imported inside Chart blocks).

**Pre-execution refinement:** Before starting, re-read spec [Sections 7 (Block system), 13 (Performance), 17 (Error handling — save race)](../specs/2026-04-28-backdesk-v1-design.md). Verify Plan 2's `Collection` class is in place and confirm its `list/getRow/count` signatures haven't drifted from what's referenced here. Run `pnpm dlx shadcn@latest search @plate -q "editor"` to confirm the `@plate` registry is reachable.

---

## File structure created in this plan

```
apps/web/
├── components/editor/
│   ├── PlateEditor.tsx                      -- top-level editor + save loop
│   ├── plugins/
│   │   ├── card-plugin.tsx
│   │   ├── chart-plugin.tsx
│   │   ├── table-plugin.tsx
│   │   ├── row-plugin.tsx
│   │   └── image-plugin.tsx
│   ├── blocks/
│   │   ├── CardBlockElement.tsx
│   │   ├── ChartBlockElement.tsx
│   │   ├── TableBlockElement.tsx
│   │   ├── RowBlockElement.tsx
│   │   └── ImageBlockElement.tsx
│   ├── settings/
│   │   ├── CardBlockSettings.tsx
│   │   ├── ChartBlockSettings.tsx
│   │   ├── TableBlockSettings.tsx
│   │   └── RowBlockSettings.tsx
│   ├── data-hooks/
│   │   ├── useMetric.ts
│   │   ├── useChartData.ts
│   │   ├── useTableRows.ts
│   │   └── useRowDetail.ts
│   ├── slash-menu.ts                        -- customizes @plate/slash-kit
│   └── save-loop.ts                         -- debounce + flush helpers
├── actions/
│   ├── pages.ts                             -- (modified) add savePageDocument
│   └── upload.ts                            -- attachments upload Server Action
├── lib/
│   ├── collections/collection.ts            -- (modified) add aggregate()
│   └── trades/metrics.ts                    -- (added in Plan 4 — placeholder names referenced here)
└── components/empty/EmptyDashboard.tsx      -- replaced by real editor

tests/
├── apps/web/components/editor/save-loop.test.ts
└── e2e/dashboard.spec.ts
```

---

### Task 1: Install Plate + @plate registry components

**Files:**
- New shadcn components in `packages/ui/src/components/`

- [ ] **Step 1: Install Plate package**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm dlx shadcn@latest add @plate/plate --yes
```

Expected: installs `platejs` and related packages into `apps/web/package.json`.

- [ ] **Step 2: Add the editor + kits**

```bash
pnpm dlx shadcn@latest add @plate/editor @plate/editor-kit @plate/basic-blocks-kit @plate/slash-kit @plate/slash-node @plate/block-context-menu @plate/insert-toolbar-button @plate/turn-into-toolbar-button --yes
```

Expected: components added to `packages/ui/src/components/` and Plate plugin kits added wherever shadcn places them (often `apps/web/components/editor/` if the registry sets that destination — verify after install).

- [ ] **Step 3: Verify**

```bash
ls packages/ui/src/components/ | grep -E "editor|slash|insert|turn-into|block-context"
ls apps/web/components/ -R | grep -E "editor|kit"
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: install Plate.js + @plate kits"
```

---

### Task 2: Add Recharts dependency

- [ ] **Step 1: Install**

```bash
pnpm --filter web add recharts
pnpm dlx shadcn@latest add chart --yes  # shadcn's Recharts wrapper
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui apps/web pnpm-lock.yaml
git commit -m "chore: add recharts and shadcn Chart component"
```

---

### Task 3: Extend Collection with `aggregate()`

**Files:**
- Modify: `apps/web/lib/collections/collection.ts`
- Create: `apps/web/lib/collections/aggregate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/lib/collections/aggregate.test.ts
import { describe, it, expect } from "vitest";
import { aggregateRows } from "./collection";
import type { Field, Row } from "./types";

const fields: Record<string, Field> = {
  symbol: { id: "symbol", collection_id: "c", name: "Symbol", type: "text", options: [], config: {}, is_system: true, sort_index: 0 },
  pnl: { id: "pnl", collection_id: "c", name: "PnL", type: "number", options: [], config: {}, is_system: true, sort_index: 1 },
};

const rows: Row[] = [
  { id: "1", collection_id: "c", data: { symbol: "AAPL", pnl: 100 }, source: "user", source_external_id: null, created_at: "", updated_at: "" },
  { id: "2", collection_id: "c", data: { symbol: "AAPL", pnl: -50 }, source: "user", source_external_id: null, created_at: "", updated_at: "" },
  { id: "3", collection_id: "c", data: { symbol: "MSFT", pnl: 200 }, source: "user", source_external_id: null, created_at: "", updated_at: "" },
];

describe("aggregateRows", () => {
  it("counts rows", () => {
    expect(aggregateRows(rows, fields, { metric: { kind: "count" } })).toEqual({ value: 3 });
  });
  it("sums a numeric field", () => {
    expect(aggregateRows(rows, fields, { metric: { kind: "sum", fieldId: "pnl" } })).toEqual({ value: 250 });
  });
  it("averages a numeric field", () => {
    expect(aggregateRows(rows, fields, { metric: { kind: "avg", fieldId: "pnl" } })).toEqual({ value: 250 / 3 });
  });
  it("min/max", () => {
    expect(aggregateRows(rows, fields, { metric: { kind: "min", fieldId: "pnl" } })).toEqual({ value: -50 });
    expect(aggregateRows(rows, fields, { metric: { kind: "max", fieldId: "pnl" } })).toEqual({ value: 200 });
  });
  it("groups by symbol summing pnl", () => {
    const result = aggregateRows(rows, fields, {
      metric: { kind: "sum", fieldId: "pnl" },
      groupBy: ["symbol"],
    });
    expect(result.groups).toEqual([
      { key: { symbol: "AAPL" }, value: 50 },
      { key: { symbol: "MSFT" }, value: 200 },
    ]);
  });
});
```

- [ ] **Step 2: Run (expect failure)**

```bash
pnpm --filter web exec vitest run lib/collections/aggregate.test.ts
```

- [ ] **Step 3: Implement `aggregateRows` and `Collection.aggregate`**

Append to `apps/web/lib/collections/collection.ts`:

```ts
export type AggregateMetric =
  | { kind: "count" }
  | { kind: "sum"; fieldId: string }
  | { kind: "avg"; fieldId: string }
  | { kind: "min"; fieldId: string }
  | { kind: "max"; fieldId: string };

export type AggregateSpec = {
  metric: AggregateMetric;
  filters?: import("./types").Filter[];
  groupBy?: string[];
};

export type AggregateResult =
  | { value: number }
  | { groups: Array<{ key: Record<string, string>; value: number }> };

export function aggregateRows(
  rows: import("./types").Row[],
  fields: Record<string, import("./types").Field>,
  spec: AggregateSpec,
): AggregateResult {
  function metricFor(group: import("./types").Row[]): number {
    if (spec.metric.kind === "count") return group.length;
    const fid = spec.metric.fieldId;
    const values = group
      .map((r) => r.data[fid])
      .filter((v): v is number => typeof v === "number");
    if (values.length === 0) return 0;
    switch (spec.metric.kind) {
      case "sum": return values.reduce((a, b) => a + b, 0);
      case "avg": return values.reduce((a, b) => a + b, 0) / values.length;
      case "min": return Math.min(...values);
      case "max": return Math.max(...values);
    }
  }

  if (!spec.groupBy || spec.groupBy.length === 0) {
    return { value: metricFor(rows) };
  }

  const buckets = new Map<string, { key: Record<string, string>; rows: import("./types").Row[] }>();
  for (const row of rows) {
    const key: Record<string, string> = {};
    for (const fid of spec.groupBy) key[fid] = String(row.data[fid] ?? "");
    const k = JSON.stringify(key);
    if (!buckets.has(k)) buckets.set(k, { key, rows: [] });
    buckets.get(k)!.rows.push(row);
  }

  const groups = Array.from(buckets.values())
    .map((b) => ({ key: b.key, value: metricFor(b.rows) }))
    .sort((a, b) => {
      // stable order: by first groupBy field's key
      const f = spec.groupBy![0];
      return String(a.key[f]).localeCompare(String(b.key[f]));
    });

  return { groups };
}

// Add the method on Collection class:
declare module "./collection" {
  interface Collection {
    aggregate(spec: AggregateSpec): Promise<AggregateResult>;
  }
}
```

Then add the actual method inside the `Collection` class (modify the class definition):

```ts
// Inside the Collection class, add:
async aggregate(spec: AggregateSpec): Promise<AggregateResult> {
  const rows = await this.list({ filters: spec.filters });
  const fieldsById = this.fieldsById();
  return aggregateRows(rows as any, fieldsById as any, spec);
}
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
pnpm --filter web exec vitest run lib/collections/aggregate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/collections
git commit -m "feat(collections): aggregate() with sum/avg/min/max/count and groupBy"
```

---

### Task 4: `savePageDocument` Server Action with optimistic concurrency

**Files:**
- Modify: `apps/web/actions/pages.ts`

- [ ] **Step 1: Add the action**

Append to `apps/web/actions/pages.ts`:

```ts
const SaveDocSchema = z.object({
  pageId: z.string().uuid(),
  document: z.unknown(),
  expectedUpdatedAt: z.string(),  // ISO from the client's last-known updated_at
});

export async function savePageDocument(input: z.infer<typeof SaveDocSchema>) {
  const parsed = SaveDocSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();

  // Read current updated_at; reject if it doesn't match
  const { data: existing } = await supabase
    .from("pages")
    .select("updated_at, page_type")
    .eq("id", parsed.data.pageId)
    .single();
  if (!existing) return Err("PAGE_NOT_FOUND", "Page not found");
  if (existing.page_type !== "dashboard") return Err("WRONG_PAGE_TYPE", "Document only valid on dashboards");
  if (existing.updated_at !== parsed.data.expectedUpdatedAt) {
    return Err("STALE_DOCUMENT", "Page was updated elsewhere; refresh and merge.");
  }

  const { data, error } = await supabase
    .from("pages")
    .update({ document: parsed.data.document })
    .eq("id", parsed.data.pageId)
    .select("updated_at")
    .single();
  if (error) return Err("SAVE_FAILED", error.message);
  return Result({ updated_at: data.updated_at });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/actions/pages.ts
git commit -m "feat(actions): savePageDocument with optimistic concurrency"
```

---

### Task 5: Save-loop helper (debounce + flush + tests)

**Files:**
- Create: `apps/web/components/editor/save-loop.ts`
- Create: `apps/web/components/editor/save-loop.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/web/components/editor/save-loop.test.ts
import { describe, it, expect, vi } from "vitest";
import { createSaveLoop } from "./save-loop";

describe("createSaveLoop", () => {
  it("debounces saves", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue({ ok: true });
    const loop = createSaveLoop({ save, delayMs: 500 });

    loop.schedule({ doc: { v: 1 } });
    loop.schedule({ doc: { v: 2 } });
    loop.schedule({ doc: { v: 3 } });
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ doc: { v: 3 } });
    vi.useRealTimers();
  });

  it("flush() forces immediate save", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const loop = createSaveLoop({ save, delayMs: 500 });
    loop.schedule({ doc: { v: 1 } });
    await loop.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it("flush() is a no-op if nothing pending", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const loop = createSaveLoop({ save, delayMs: 500 });
    await loop.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// apps/web/components/editor/save-loop.ts
type SaveResult = { ok: true } | { ok: false; error: { code: string; message: string } };

export function createSaveLoop<T>({
  save, delayMs = 500,
}: {
  save: (payload: T) => Promise<SaveResult>;
  delayMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  async function fire() {
    if (pending === null) return;
    const payload = pending;
    pending = null;
    clear();
    await save(payload);
  }

  return {
    schedule(payload: T) {
      pending = payload;
      clear();
      timer = setTimeout(() => { void fire(); }, delayMs);
    },
    async flush() {
      if (pending === null) return;
      await fire();
    },
  };
}
```

- [ ] **Step 3: Run tests (expect pass)**

```bash
pnpm --filter web exec vitest run components/editor/save-loop.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/editor/save-loop.ts apps/web/components/editor/save-loop.test.ts
git commit -m "feat(editor): debounced save loop with flush"
```

---

### Task 6: PlateEditor wrapper component

**Files:**
- Create: `apps/web/components/editor/PlateEditor.tsx`

- [ ] **Step 1: Write the wrapper**

```tsx
// apps/web/components/editor/PlateEditor.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
// Adapt these imports to whatever the @plate kit installer wired up:
// (the names below assume the standard kit exports)
import { EditorKit } from "@/components/editor/editor-kit";
import { savePageDocument } from "@/actions/pages";
import { createSaveLoop } from "./save-loop";

type Props = {
  pageId: string;
  initialDocument: any;
  initialUpdatedAt: string;
};

export function PlateEditor({ pageId, initialDocument, initialUpdatedAt }: Props) {
  const router = useRouter();
  const updatedAtRef = useRef(initialUpdatedAt);

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialDocument,
  });

  const loopRef = useRef(createSaveLoop<any>({
    save: async (doc) => {
      const result = await savePageDocument({
        pageId,
        document: doc,
        expectedUpdatedAt: updatedAtRef.current,
      });
      if (!result.ok) {
        if (result.error.code === "STALE_DOCUMENT") {
          toast.warning("Page changed elsewhere — refreshing.");
          router.refresh();
        } else {
          toast.error(result.error.message);
        }
        return result;
      }
      updatedAtRef.current = result.data.updated_at;
      return { ok: true as const };
    },
    delayMs: 500,
  }));

  // Schedule on every change
  useEffect(() => {
    if (!editor) return;
    const off = editor.api.on("change", () => {
      loopRef.current.schedule(editor.children);
    });
    return () => { off?.(); };
  }, [editor]);

  // Flush on beforeunload
  useEffect(() => {
    function handler() { void loopRef.current.flush(); }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Flush on Next.js route change (best-effort)
  useEffect(() => {
    return () => { void loopRef.current.flush(); };
  }, []);

  return (
    <Plate editor={editor}>
      <PlateContent className="min-h-[60vh] outline-none" />
    </Plate>
  );
}
```

> **Note for the implementer:** Plate's React API has gone through revisions. The exact import paths (`platejs/react` vs `@udecode/plate/react`) and event subscription shape (`editor.api.on('change', ...)` vs `editor.tf.onChange`) depend on the version installed by the `@plate` registry. After install, run `cat node_modules/platejs/package.json | grep version` and consult `node_modules/platejs/dist/...` exports — adjust the import paths and the change-subscription mechanism to match. The shape of the wrapper (Plate provider + PlateContent + a `usePlateEditor` hook + a save-loop fed by every change) is the contract that matters.

- [ ] **Step 2: Wire into the dashboard page**

Modify `apps/web/app/(app)/p/[pageId]/page.tsx`:

```tsx
import { PlateEditor } from "@/components/editor/PlateEditor";
import { PageHeader } from "@/components/pages/PageHeader";

// Inside the component, after fetching `page`:
return (
  <div className="max-w-3xl mx-auto py-8">
    <PageHeader pageId={page.id} initialTitle={page.title} emoji={page.emoji} />
    <PlateEditor pageId={page.id} initialDocument={page.document} initialUpdatedAt={page.updated_at} />
  </div>
);
```

(Make sure the `select` in the page query also fetches `document` and `updated_at`.)

- [ ] **Step 3: Manual verify**

```bash
pnpm dev
```

Sign in, create a blank dashboard, type some text. Reload — text persists. Open in two tabs, edit in both — second save should toast "Page changed elsewhere — refreshing." Stop the server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/editor/PlateEditor.tsx apps/web/app/\(app\)/p
git commit -m "feat(editor): Plate editor with debounced save and concurrency check"
```

---

### Task 7: Card block plugin + element + settings

**Files:**
- Create: `apps/web/components/editor/plugins/card-plugin.tsx`
- Create: `apps/web/components/editor/blocks/CardBlockElement.tsx`
- Create: `apps/web/components/editor/settings/CardBlockSettings.tsx`
- Create: `apps/web/components/editor/data-hooks/useMetric.ts`

- [ ] **Step 1: Define the metric hook (server-side path)**

```ts
// apps/web/components/editor/data-hooks/useMetric.ts
"use client";
import { useEffect, useState } from "react";
import type { AggregateMetric } from "@/lib/collections/collection";

export function useMetric(collectionId: string, metric: AggregateMetric, dateRange: string) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/aggregate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionId, metric, dateRange }),
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setValue(data.value); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [collectionId, JSON.stringify(metric), dateRange]);

  return { value, loading };
}
```

- [ ] **Step 2: Add the API route for aggregate (light Route Handler — kept tiny)**

```ts
// apps/web/app/api/aggregate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Collection } from "@/lib/collections/collection";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json() as { collectionId: string; metric: any; dateRange?: string };
  const collection = await Collection.load(body.collectionId);
  // dateRange parsing is per-collection (Trades use closed_at); for v1, ignore unless it's '7d'/'30d'/'all'
  const result = await collection.aggregate({ metric: body.metric });
  return NextResponse.json("value" in result ? { value: result.value } : { groups: result.groups });
}
```

- [ ] **Step 3: Define the Card element**

```tsx
// apps/web/components/editor/blocks/CardBlockElement.tsx
"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";
import { Settings as SettingsIcon } from "lucide-react";
import { useMetric } from "../data-hooks/useMetric";
import { CardBlockSettings } from "../settings/CardBlockSettings";
// Plate-specific imports (adapt to actual API):
import { PlateElement } from "platejs/react";

export type CardBlockProps = {
  collectionId: string;
  metric: { kind: "count" } | { kind: "sum" | "avg" | "min" | "max"; fieldId: string };
  format: "number" | "currency";
  dateRange: "7d" | "30d" | "90d" | "all";
};

export function CardBlockElement(props: any) {
  const block = props.element as { id: string; props?: CardBlockProps };
  const cardProps: CardBlockProps = block.props ?? {
    collectionId: "",
    metric: { kind: "count" },
    format: "number",
    dateRange: "30d",
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { value, loading } = useMetric(cardProps.collectionId, cardProps.metric, cardProps.dateRange);

  return (
    <PlateElement {...props}>
      <Card className="my-2 relative">
        <CardHeader>
          <CardDescription>{describeMetric(cardProps.metric)}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-8 w-24" /> :
            value === null ? <span className="text-muted-foreground italic">no data</span> :
            <span className="text-2xl font-semibold tabular-nums">{formatValue(value, cardProps.format)}</span>}
        </CardContent>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={(e) => { e.preventDefault(); setSettingsOpen(true); }}
          contentEditable={false}
        >
          <SettingsIcon />
        </Button>
        <CardBlockSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          props={cardProps}
          onSave={(next) => {
            // Plate-specific: update this element's props
            props.editor.tf.setNodes({ props: next }, { at: props.path });
            setSettingsOpen(false);
          }}
        />
      </Card>
    </PlateElement>
  );
}

function describeMetric(m: CardBlockProps["metric"]): string {
  if (m.kind === "count") return "Count";
  return `${m.kind.toUpperCase()} of ${m.fieldId}`;
}

function formatValue(v: number, fmt: CardBlockProps["format"]): string {
  if (fmt === "currency") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
  return v.toLocaleString();
}
```

> **Adapt:** Plate's element-update API may be `editor.tf.setNodes`, `editor.api.setNodes`, or similar. Verify in the installed version.

- [ ] **Step 4: Define the Card plugin**

```tsx
// apps/web/components/editor/plugins/card-plugin.tsx
"use client";
import { createPlatePlugin } from "platejs/react";
import { CardBlockElement } from "../blocks/CardBlockElement";

export const CardPlugin = createPlatePlugin({
  key: "card",
  node: { isElement: true, isVoid: true, type: "card" },
  render: { node: CardBlockElement },
});
```

- [ ] **Step 5: Define the Card settings sheet**

```tsx
// apps/web/components/editor/settings/CardBlockSettings.tsx
"use client";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import type { CardBlockProps } from "../blocks/CardBlockElement";

type CollectionLite = { id: string; name: string; fields: Array<{ id: string; name: string; type: string }> };

export function CardBlockSettings({
  open, onOpenChange, props, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  props: CardBlockProps;
  onSave: (next: CardBlockProps) => void;
}) {
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [draft, setDraft] = useState<CardBlockProps>(props);
  useEffect(() => {
    fetch("/api/collections").then((r) => r.json()).then((data) => setCollections(data ?? []));
  }, []);

  const collection = collections.find((c) => c.id === draft.collectionId);
  const numericFields = collection?.fields.filter((f) => ["number","currency"].includes(f.type)) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader><SheetTitle>Card settings</SheetTitle></SheetHeader>
        <FieldGroup className="py-4">
          <Field>
            <FieldLabel>Collection</FieldLabel>
            <Select
              value={draft.collectionId}
              onValueChange={(v) => setDraft({ ...draft, collectionId: v })}
            >
              <SelectTrigger><SelectValue placeholder="Pick a collection" /></SelectTrigger>
              <SelectContent>
                {collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Metric</FieldLabel>
            <Select
              value={draft.metric.kind}
              onValueChange={(v) => setDraft({
                ...draft,
                metric: v === "count" ? { kind: "count" } : { kind: v as any, fieldId: numericFields[0]?.id ?? "" },
              })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Count of rows</SelectItem>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="avg">Average</SelectItem>
                <SelectItem value="min">Minimum</SelectItem>
                <SelectItem value="max">Maximum</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {draft.metric.kind !== "count" && (
            <Field>
              <FieldLabel>Field</FieldLabel>
              <Select
                value={(draft.metric as any).fieldId}
                onValueChange={(v) => setDraft({ ...draft, metric: { ...(draft.metric as any), fieldId: v } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {numericFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel>Format</FieldLabel>
            <Select value={draft.format} onValueChange={(v) => setDraft({ ...draft, format: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button onClick={() => onSave(draft)}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 6: Add /api/collections list endpoint**

```ts
// apps/web/app/api/collections/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: collections } = await supabase
    .from("collections")
    .select("id, name")
    .eq("owner_type", "user")
    .eq("owner_id", user.id)
    .is("deleted_at", null);
  if (!collections) return NextResponse.json([]);

  // Fetch fields for each
  const ids = collections.map((c) => c.id);
  const { data: fields } = await supabase
    .from("collection_fields")
    .select("id, name, type, collection_id")
    .in("collection_id", ids);

  const result = collections.map((c) => ({
    id: c.id, name: c.name,
    fields: (fields ?? []).filter((f) => f.collection_id === c.id),
  }));
  return NextResponse.json(result);
}
```

- [ ] **Step 7: Register Card plugin in EditorKit**

Edit the file Plate generated for the editor kit (often `apps/web/components/editor/editor-kit.ts`):
```ts
import { CardPlugin } from "./plugins/card-plugin";

export const EditorKit = [
  // ...existing plugins
  CardPlugin,
];
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api apps/web/components/editor
git commit -m "feat(editor): Card block plugin + settings + metric API"
```

---

### Task 8: Chart block (line/bar/pie/area)

**Files:**
- Create: `apps/web/components/editor/plugins/chart-plugin.tsx`
- Create: `apps/web/components/editor/blocks/ChartBlockElement.tsx`
- Create: `apps/web/components/editor/settings/ChartBlockSettings.tsx`
- Create: `apps/web/components/editor/data-hooks/useChartData.ts`

- [ ] **Step 1: Add data hook**

```ts
// apps/web/components/editor/data-hooks/useChartData.ts
"use client";
import { useEffect, useState } from "react";
import type { AggregateMetric } from "@/lib/collections/collection";

export function useChartData(opts: {
  collectionId: string;
  metric: AggregateMetric;
  groupBy: string[];
}) {
  const [data, setData] = useState<Array<{ key: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/aggregate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionId: opts.collectionId, metric: opts.metric, groupBy: opts.groupBy }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.groups) {
          setData(res.groups.map((g: any) => ({ key: Object.values(g.key).join(" / "), value: g.value })));
        } else {
          setData([{ key: "value", value: res.value }]);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [opts.collectionId, JSON.stringify(opts.metric), opts.groupBy.join(",")]);

  return { data, loading };
}
```

- [ ] **Step 2: Update aggregate route to accept groupBy**

Modify `apps/web/app/api/aggregate/route.ts` body parsing to forward `groupBy`:
```ts
const result = await collection.aggregate({ metric: body.metric, groupBy: body.groupBy });
```

- [ ] **Step 3: Write the Chart element**

```tsx
// apps/web/components/editor/blocks/ChartBlockElement.tsx
"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Card, CardHeader, CardDescription, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";
import { Settings as SettingsIcon } from "lucide-react";
import { PlateElement } from "platejs/react";
import { useChartData } from "../data-hooks/useChartData";
import { ChartBlockSettings } from "../settings/ChartBlockSettings";

const RechartsChart = dynamic(() => import("./RechartsChart").then((m) => m.RechartsChart), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full" />,
});

export type ChartBlockProps = {
  collectionId: string;
  chartType: "line" | "bar" | "pie" | "area";
  metric: { kind: "count" } | { kind: "sum"|"avg"|"min"|"max"; fieldId: string };
  groupByFieldId: string;
  title?: string;
};

export function ChartBlockElement(props: any) {
  const block = props.element as { id: string; props?: ChartBlockProps };
  const cfg: ChartBlockProps = block.props ?? {
    collectionId: "",
    chartType: "bar",
    metric: { kind: "count" },
    groupByFieldId: "",
  };
  const [open, setOpen] = useState(false);
  const { data, loading } = useChartData({
    collectionId: cfg.collectionId,
    metric: cfg.metric,
    groupBy: cfg.groupByFieldId ? [cfg.groupByFieldId] : [],
  });

  return (
    <PlateElement {...props}>
      <Card className="my-2 relative">
        <CardHeader>
          <CardDescription>{cfg.title ?? "Chart"}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full" /> :
            data.length === 0 ? <span className="text-muted-foreground italic">no data</span> :
            <RechartsChart type={cfg.chartType} data={data} />}
        </CardContent>
        <Button variant="ghost" size="icon" className="absolute top-2 right-2"
                onClick={(e) => { e.preventDefault(); setOpen(true); }} contentEditable={false}>
          <SettingsIcon />
        </Button>
        <ChartBlockSettings
          open={open} onOpenChange={setOpen}
          props={cfg}
          onSave={(next) => {
            props.editor.tf.setNodes({ props: next }, { at: props.path });
            setOpen(false);
          }}
        />
      </Card>
    </PlateElement>
  );
}
```

- [ ] **Step 4: Write the Recharts client component (using shadcn's Chart wrapper)**

This composes Recharts primitives inside shadcn's `ChartContainer`, which provides theme-aware colors (CSS variables `--chart-1` through `--chart-5` that respond to light/dark mode and the user's accent), plus shadcn-styled tooltip and legend.

```tsx
// apps/web/components/editor/blocks/RechartsChart.tsx
"use client";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@workspace/ui/components/chart";
import {
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
} from "recharts";

type Datum = { key: string; value: number };

const baseConfig: ChartConfig = {
  value: { label: "Value", color: "var(--chart-1)" },
};

export function RechartsChart({ type, data }: { type: "line"|"bar"|"pie"|"area"; data: Datum[] }) {
  if (type === "pie") {
    // For pies, give each slice its own color from the chart palette
    const pieConfig: ChartConfig = Object.fromEntries(
      data.map((d, i) => [d.key, { label: d.key, color: `var(--chart-${(i % 5) + 1})` }]),
    );
    return (
      <ChartContainer config={pieConfig} className="aspect-video max-h-[240px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Pie data={data} dataKey="value" nameKey="key" outerRadius={80}>
            {data.map((d) => <Cell key={d.key} fill={`var(--color-${d.key})`} />)}
          </Pie>
        </PieChart>
      </ChartContainer>
    );
  }

  if (type === "line") {
    return (
      <ChartContainer config={baseConfig} className="aspect-video max-h-[240px]">
        <LineChart data={data} margin={{ left: 12, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    );
  }

  if (type === "area") {
    return (
      <ChartContainer config={baseConfig} className="aspect-video max-h-[240px]">
        <AreaChart data={data} margin={{ left: 12, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.3} />
        </AreaChart>
      </ChartContainer>
    );
  }

  // Bar (default)
  return (
    <ChartContainer config={baseConfig} className="aspect-video max-h-[240px]">
      <BarChart data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
```

**Why this matters:**
- **Theme-aware colors:** `var(--chart-1)` through `var(--chart-5)` are defined in shadcn's global CSS and automatically swap when the user toggles light/dark or picks a different accent color in Plan 5.
- **Consistent tooltip styling:** `ChartTooltipContent` matches shadcn's overall design (radius, border, typography) instead of Recharts's default look.
- **The `var(--color-<key>)` pattern:** when you pass a `config={{ value: { color: "var(--chart-1)" } }}` to `ChartContainer`, shadcn registers `--color-value` for descendants. So `Bar fill="var(--color-value)"` resolves to your themed color.
- **Same Recharts API underneath:** `LineChart`, `Bar`, `XAxis`, etc. are all Recharts — we only swap `ResponsiveContainer` for `ChartContainer` and `Tooltip` for `ChartTooltip + ChartTooltipContent`.

- [ ] **Step 5: Write Chart settings (mirror Card pattern)**

Same shape as `CardBlockSettings.tsx`, but with extra fields: chart type (Select), groupBy field (Select). Omitted here for brevity but follow the Card settings template, replacing `format` field with:
```tsx
<Field>
  <FieldLabel>Chart type</FieldLabel>
  <Select value={draft.chartType} onValueChange={(v) => setDraft({ ...draft, chartType: v as any })}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="bar">Bar</SelectItem>
      <SelectItem value="line">Line</SelectItem>
      <SelectItem value="area">Area</SelectItem>
      <SelectItem value="pie">Pie</SelectItem>
    </SelectContent>
  </Select>
</Field>
<Field>
  <FieldLabel>Group by</FieldLabel>
  <Select value={draft.groupByFieldId} onValueChange={(v) => setDraft({ ...draft, groupByFieldId: v })}>
    <SelectTrigger><SelectValue placeholder="(none — single value)" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="">(none)</SelectItem>
      {collection?.fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
    </SelectContent>
  </Select>
</Field>
```

- [ ] **Step 6: Write Chart plugin and register**

```tsx
// apps/web/components/editor/plugins/chart-plugin.tsx
"use client";
import { createPlatePlugin } from "platejs/react";
import { ChartBlockElement } from "../blocks/ChartBlockElement";

export const ChartPlugin = createPlatePlugin({
  key: "chart",
  node: { isElement: true, isVoid: true, type: "chart" },
  render: { node: ChartBlockElement },
});
```

Add to `EditorKit`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/editor apps/web/app/api/aggregate
git commit -m "feat(editor): Chart block (line/bar/pie/area) with settings"
```

---

### Task 9: Table block (collection rows in a dashboard)

**Files:**
- Create: `apps/web/components/editor/plugins/table-plugin.tsx`
- Create: `apps/web/components/editor/blocks/TableBlockElement.tsx`
- Create: `apps/web/components/editor/settings/TableBlockSettings.tsx`

- [ ] **Step 1: Define block + element + plugin**

The Table block reuses `CollectionListView` (or a read-only variant) keyed to a specific collection + view config. Implementation mirrors Card/Chart patterns:

```tsx
// apps/web/components/editor/blocks/TableBlockElement.tsx
"use client";
import { useState, useEffect } from "react";
import { PlateElement } from "platejs/react";
import { Card, CardHeader, CardDescription, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";
import { Settings as SettingsIcon } from "lucide-react";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@workspace/ui/components/table";
import { TableBlockSettings } from "../settings/TableBlockSettings";
import { renderCell } from "@/components/collection/cells";
import type { Field, Row } from "@/lib/collections/types";

export type TableBlockProps = {
  collectionId: string;
  visibleFields: string[];
  pageSize: number;
  title?: string;
};

export function TableBlockElement(props: any) {
  const block = props.element as { id: string; props?: TableBlockProps };
  const cfg: TableBlockProps = block.props ?? { collectionId: "", visibleFields: [], pageSize: 10 };
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cfg.collectionId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/collections/${cfg.collectionId}/rows?limit=${cfg.pageSize}`).then((r) => r.json()),
      fetch(`/api/collections/${cfg.collectionId}/fields`).then((r) => r.json()),
    ]).then(([r, f]) => {
      if (cancelled) return;
      setRows(r ?? []);
      setFields(f ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [cfg.collectionId, cfg.pageSize]);

  const visible = (cfg.visibleFields.length ? fields.filter((f) => cfg.visibleFields.includes(f.id)) : fields);

  return (
    <PlateElement {...props}>
      <Card className="my-2 relative">
        <CardHeader>
          <CardDescription>{cfg.title ?? "Table"}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32 w-full" /> :
            <Table>
              <TableHeader>
                <TableRow>{visible.map((f) => <TableHead key={f.id}>{f.name}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    {visible.map((f) => (
                      <TableCell key={f.id}>
                        {renderCell(f, r.data[f.id] ?? null, () => {})}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
        </CardContent>
        <Button variant="ghost" size="icon" className="absolute top-2 right-2"
                onClick={(e) => { e.preventDefault(); setOpen(true); }} contentEditable={false}>
          <SettingsIcon />
        </Button>
        <TableBlockSettings
          open={open} onOpenChange={setOpen}
          props={cfg}
          onSave={(next) => { props.editor.tf.setNodes({ props: next }, { at: props.path }); setOpen(false); }}
        />
      </Card>
    </PlateElement>
  );
}
```

- [ ] **Step 2: Write TableBlockSettings**

Mirror the Card/Chart settings sheets but with: collection picker, visibleFields multi-select, pageSize number input, title text input.

- [ ] **Step 3: Add /api/collections/[id]/rows and /fields routes**

```ts
// apps/web/app/api/collections/[id]/rows/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const supabase = await createClient();
  const { data } = await supabase.from("collection_rows")
    .select("*").eq("collection_id", id).limit(limit);
  return NextResponse.json(data ?? []);
}
```

```ts
// apps/web/app/api/collections/[id]/fields/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("collection_fields")
    .select("*").eq("collection_id", id).order("sort_index");
  return NextResponse.json(data ?? []);
}
```

- [ ] **Step 4: Register Table plugin**

```tsx
// apps/web/components/editor/plugins/table-plugin.tsx
"use client";
import { createPlatePlugin } from "platejs/react";
import { TableBlockElement } from "../blocks/TableBlockElement";

export const TablePlugin = createPlatePlugin({
  key: "data-table",   // 'table' may collide with Plate's built-in table
  node: { isElement: true, isVoid: true, type: "data-table" },
  render: { node: TableBlockElement },
});
```

Add to `EditorKit`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/editor apps/web/app/api/collections
git commit -m "feat(editor): Table block reading from any collection"
```

---

### Task 10: Row block (embed one row's fields)

**Files:**
- Create: `apps/web/components/editor/plugins/row-plugin.tsx`
- Create: `apps/web/components/editor/blocks/RowBlockElement.tsx`
- Create: `apps/web/components/editor/settings/RowBlockSettings.tsx`
- Create: `apps/web/components/editor/data-hooks/useRowDetail.ts`

- [ ] **Step 1: Add the row hook**

```ts
// apps/web/components/editor/data-hooks/useRowDetail.ts
"use client";
import { useEffect, useState } from "react";
import type { Field, Row } from "@/lib/collections/types";

export function useRowDetail(collectionId: string, rowId: string) {
  const [row, setRow] = useState<Row | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!collectionId || !rowId) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([
      fetch(`/api/collections/${collectionId}/rows/${rowId}`).then((r) => r.json()),
      fetch(`/api/collections/${collectionId}/fields`).then((r) => r.json()),
    ]).then(([r, f]) => {
      if (cancelled) return;
      setRow(r); setFields(f ?? []); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [collectionId, rowId]);
  return { row, fields, loading };
}
```

- [ ] **Step 2: Add /api/collections/[id]/rows/[rowId] route**

```ts
// apps/web/app/api/collections/[id]/rows/[rowId]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { id, rowId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("collection_rows")
    .select("*").eq("id", rowId).eq("collection_id", id).maybeSingle();
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Write RowBlockElement**

```tsx
// apps/web/components/editor/blocks/RowBlockElement.tsx
"use client";
import { useState } from "react";
import { PlateElement } from "platejs/react";
import { Card, CardHeader, CardDescription, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";
import { Settings as SettingsIcon } from "lucide-react";
import { useRowDetail } from "../data-hooks/useRowDetail";
import { renderCell } from "@/components/collection/cells";
import { RowBlockSettings } from "../settings/RowBlockSettings";

export type RowBlockProps = { collectionId: string; rowId: string };

export function RowBlockElement(props: any) {
  const block = props.element as { id: string; props?: RowBlockProps };
  const cfg: RowBlockProps = block.props ?? { collectionId: "", rowId: "" };
  const [open, setOpen] = useState(false);
  const { row, fields, loading } = useRowDetail(cfg.collectionId, cfg.rowId);

  return (
    <PlateElement {...props}>
      <Card className="my-2 relative">
        <CardHeader>
          <CardDescription>Row</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-24 w-full" /> :
            !row ? <span className="text-muted-foreground italic">row not found</span> :
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
              {fields.map((f) => (
                <div key={f.id} className="contents">
                  <dt className="text-muted-foreground text-sm">{f.name}</dt>
                  <dd>{renderCell(f, row.data[f.id] ?? null, () => {})}</dd>
                </div>
              ))}
            </dl>}
        </CardContent>
        <Button variant="ghost" size="icon" className="absolute top-2 right-2"
                onClick={(e) => { e.preventDefault(); setOpen(true); }} contentEditable={false}>
          <SettingsIcon />
        </Button>
        <RowBlockSettings
          open={open} onOpenChange={setOpen}
          props={cfg}
          onSave={(next) => { props.editor.tf.setNodes({ props: next }, { at: props.path }); setOpen(false); }}
        />
      </Card>
    </PlateElement>
  );
}
```

- [ ] **Step 4: Write RowBlockSettings (collection picker → row picker)**

Pick a collection, then load its first 50 rows and show as a Combobox with each row's first text field as the label. Implementation pattern same as Card/Chart settings.

- [ ] **Step 5: Register Row plugin**

```tsx
// apps/web/components/editor/plugins/row-plugin.tsx
"use client";
import { createPlatePlugin } from "platejs/react";
import { RowBlockElement } from "../blocks/RowBlockElement";

export const RowPlugin = createPlatePlugin({
  key: "data-row",
  node: { isElement: true, isVoid: true, type: "data-row" },
  render: { node: RowBlockElement },
});
```

Add to `EditorKit`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/editor apps/web/app/api/collections
git commit -m "feat(editor): Row block embeds a single collection row's fields"
```

---

### Task 11: Slash menu — register custom items

**Files:**
- Create: `apps/web/components/editor/slash-menu.ts`
- Modify: the editor-kit file to use it

- [ ] **Step 1: Add custom slash items**

The exact API depends on `@plate/slash-kit`. The pattern is to extend its items array:

```ts
// apps/web/components/editor/slash-menu.ts
"use client";
// Adapt these to the actual slash-kit API:
import { insertNodes } from "platejs";
import type { TElement } from "platejs";

export function customSlashItems() {
  return [
    {
      label: "Card",
      icon: "📊",
      keywords: ["card", "kpi", "metric"],
      onSelect: (editor: any) => {
        insertNodes(editor, { type: "card", children: [{ text: "" }], props: {} } as any);
      },
    },
    {
      label: "Chart",
      icon: "📈",
      keywords: ["chart", "graph", "viz"],
      onSelect: (editor: any) => {
        insertNodes(editor, { type: "chart", children: [{ text: "" }], props: {} } as any);
      },
    },
    {
      label: "Table",
      icon: "📋",
      keywords: ["table", "rows"],
      onSelect: (editor: any) => {
        insertNodes(editor, { type: "data-table", children: [{ text: "" }], props: {} } as any);
      },
    },
    {
      label: "Row",
      icon: "🔢",
      keywords: ["row", "record"],
      onSelect: (editor: any) => {
        insertNodes(editor, { type: "data-row", children: [{ text: "" }], props: {} } as any);
      },
    },
  ];
}
```

Follow the slash-kit's documentation to plug these into the menu items list.

- [ ] **Step 2: Manual verify**

```bash
pnpm dev
```

Open a dashboard, type `/`, see Card / Chart / Table / Row alongside built-ins. Insert a Card, click ⚙, set collection + metric, save. Card renders the value. Stop server.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/editor
git commit -m "feat(editor): custom slash menu items for data blocks"
```

---

### Task 12: Image plugin with Supabase storage upload

**Files:**
- Create: `apps/web/actions/upload.ts`
- Create: `apps/web/components/editor/plugins/image-plugin.tsx`
- Create: `apps/web/components/editor/blocks/ImageBlockElement.tsx`
- Create: a Supabase storage bucket migration

- [ ] **Step 1: Create the attachments bucket via migration**

```bash
supabase migration new attachments_bucket
```

```sql
-- supabase/migrations/<timestamp>_attachments_bucket.sql
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: read/write own files only (path begins with auth.uid())
CREATE POLICY attachments_select ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY attachments_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY attachments_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
```

```bash
supabase db reset
pnpm db:types
```

- [ ] **Step 2: Add `attachments` table migration**

```bash
supabase migration new attachments_table
```

```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user',
  owner_id UUID NOT NULL,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  row_id UUID REFERENCES collection_rows(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_owner ON attachments FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());
```

Apply + regenerate types.

- [ ] **Step 3: Write upload Server Action**

```ts
// apps/web/actions/upload.ts
"use server";
import { createClient } from "@/lib/supabase/server";

export async function uploadImage(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in." } };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: { code: "NO_FILE", message: "Pick a file." } };

  const path = `${user.id}/editor/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error } = await supabase.storage.from("attachments").upload(path, file);
  if (error) return { ok: false as const, error: { code: "UPLOAD_FAILED", message: error.message } };

  // Create signed URL (private bucket)
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60 * 24 * 30);
  return { ok: true as const, data: { path, url: signed?.signedUrl ?? "" } };
}
```

- [ ] **Step 4: Write the Image element**

```tsx
// apps/web/components/editor/blocks/ImageBlockElement.tsx
"use client";
import { useState } from "react";
import { PlateElement } from "platejs/react";
import { Button } from "@workspace/ui/components/button";
import { uploadImage } from "@/actions/upload";

export type ImageBlockProps = { storagePath: string; url: string; caption?: string };

export function ImageBlockElement(props: any) {
  const block = props.element as { id: string; props?: ImageBlockProps };
  const cfg: ImageBlockProps | null = block.props ?? null;
  const [uploading, setUploading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.set("file", file);
    const result = await uploadImage(fd);
    setUploading(false);
    if (!result.ok) return;
    props.editor.tf.setNodes({ props: { storagePath: result.data.path, url: result.data.url } }, { at: props.path });
  }

  return (
    <PlateElement {...props}>
      <div className="my-2">
        {cfg?.url ? (
          <img src={cfg.url} alt={cfg.caption ?? ""} className="max-w-full rounded border" />
        ) : (
          <label className="block border-2 border-dashed rounded p-8 text-center cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            <span className="text-sm text-muted-foreground">{uploading ? "Uploading…" : "Click to upload an image"}</span>
          </label>
        )}
      </div>
    </PlateElement>
  );
}
```

- [ ] **Step 5: Define plugin and register**

```tsx
// apps/web/components/editor/plugins/image-plugin.tsx
"use client";
import { createPlatePlugin } from "platejs/react";
import { ImageBlockElement } from "../blocks/ImageBlockElement";

export const ImagePlugin = createPlatePlugin({
  key: "image",
  node: { isElement: true, isVoid: true, type: "image" },
  render: { node: ImageBlockElement },
});
```

Add to `EditorKit` and to `customSlashItems` (insert with type `"image"`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations apps/web
git commit -m "feat(editor): image upload plugin via Supabase storage"
```

---

### Task 13: E2E — drop a Card block on a dashboard

**Files:**
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/dashboard.spec.ts
import { test, expect } from "@playwright/test";

async function signUp(page: any) {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);
}

test("create dashboard, add a Card block via slash menu, configure metric", async ({ page }) => {
  await signUp(page);

  // Create a collection with one number field and a row
  await page.click("button:has-text('New page')");
  await page.click("text=Blank collection");
  await page.waitForURL(/\/c\//);
  await page.click("button:has-text('Add field')");
  await page.fill("input#field-name", "Amount");
  // pick number type from the Select; assume it's the second item
  await page.locator('[role="combobox"]').click();
  await page.locator('text=Number').click();
  await page.click("button:has-text('Add field')").last();

  // Add a row with amount=42
  await page.click("button:has-text('Add row')");
  await page.click("table tbody tr td"); // first cell
  await page.fill("input", "42");
  await page.keyboard.press("Enter");

  // Create dashboard
  await page.click("button:has-text('New page')");
  await page.click("text=Blank dashboard");
  await page.waitForURL(/\/p\//);

  // Open editor, type / to insert Card
  await page.click(".outline-none"); // PlateContent
  await page.keyboard.type("/");
  await page.click("text=Card");

  // Open settings
  await page.click("button[aria-label='settings'], button:has(svg)").first();
  await page.click("text=Pick a collection");
  await page.click("text=Untitled"); // first collection
  await page.click("text=Sum");
  await page.click("text=Amount");
  await page.click("button:has-text('Save')");

  // Card should display 42
  await expect(page.locator(".text-2xl").filter({ hasText: "42" })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

```bash
supabase start
pnpm test:e2e tests/e2e/dashboard.spec.ts
```

- [ ] **Step 3: Commit + push**

```bash
git add tests/e2e/dashboard.spec.ts
git commit -m "test(e2e): drop Card block, configure, verify renders"
git push
gh run watch --repo Alumicraft/backdesk
```

---

## Plan 3 — Done. What you have now

- Dashboards have a working Plate editor
- Card / Chart / Table / Row blocks read from any collection
- Slash menu inserts custom blocks
- Save loop is debounced + flushed + concurrency-checked
- Images upload to Supabase storage and render in the editor

## Pre-execution refinement notes (read before Plan 4)

After executing Plan 3, before starting Plan 4:
1. Verify the Plate API names you used match the installed version. Plan 4 doesn't touch the editor much, but the templates in Plan 4 produce Plate documents — confirm the document shape (`type`, `children`, `props`) matches what the editor actually stores.
2. Confirm Card / Chart / Table / Row blocks all work in isolation.
3. Re-read [Plan 4 file](./2026-04-28-backdesk-4-trading-vertical.md). Templates in Plan 4 reference Card/Chart/Table block types by their plugin keys — make sure your keys (`card`, `chart`, `data-table`, `data-row`) match the templates.
4. Any rough edges in the editor UX should be noted now and either fixed before Plan 4 or scheduled for Plan 5 polish.
