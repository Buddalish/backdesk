# Backdesk Plan 2: Pages + Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the generic platform: page CRUD (dashboards + collections), the collection schema/rows/views model, and the collection list view with type-aware cells. After this plan, a user can create blank dashboards, create collections, define schemas, add/edit rows inline, sort, filter, and soft-delete.

**Architecture:** All "owned content" tables use `(owner_type, owner_id)`. Server Actions are the only mutation path; Server Components do reads. Collection rows store typed values in a JSONB `data` column keyed by field ID. The `Collection` interface (`list`, `count`, `aggregate`, `getRow`) is the contract every block in Plan 3 will use.

**Tech Stack:** Same as Plan 1, plus `dnd-kit` for sidebar reordering, `lucide-react` icons.

**Pre-execution refinement:** Before starting, re-read spec [Sections 4 (Data model), 8 (Pages), 9 (Collection list view), 10 (Sidebar)](../specs/2026-04-28-backdesk-v1-design.md). Verify Plan 1 landed all foundational shadcn components; if `dropdown-menu`, `popover`, `select`, `command`, `calendar`, `checkbox`, `badge`, `combobox`, `table`, `sheet`, `alert-dialog`, `tooltip`, `empty` are not present, add them in Task 1.

**Refinement notes from Plan 1 execution (2026-04-29):**
- `sheet` and `tooltip` are already installed from Plan 1 — `pnpm dlx shadcn@latest add ... --yes` will skip them cleanly.
- `eslint-plugin-only-warn` was removed in Plan 1 cleanup — ESLint errors now actually fail CI. Implementers must fix lint errors as they go (common: unused imports, unescaped apostrophes in JSX text — use `&apos;`).
- Supabase clients (`apps/web/lib/supabase/{browser,server,admin}.ts`) already use the `Database` generic — wire collection queries through the typed client for free type safety.
- Migration filenames: use deterministic timestamps (`20260429000001_pages.sql`) instead of auto-generated, to keep cross-machine ordering stable. Pattern established in Plan 1.
- After major route additions (`/p/[pageId]`, `/c/[pageId]`), run `pnpm --filter web build` to catch route conflicts that typecheck misses.
- The `Collection.load()` static method (Task 7) only selects `id, name` from `collections`. Plan 4 will need to extend the select to include `managed_by_connection` so Task 14's "Import" button condition resolves. For Plan 2 the button stays hidden — that's correct (no connections yet).
- Verbatim plan code can skip the formal code-quality review when the implementer reports clean typecheck + lint + tests. Use code-quality review only when the implementer made meaningful design choices.

---

## File structure created in this plan

```
apps/web/
├── actions/
│   ├── pages.ts                        -- create / rename / delete / reorder / changeEmoji
│   ├── collections.ts                  -- create / rename / delete / fields CRUD / rows CRUD
│   └── views.ts                        -- saved view config updates
├── lib/collections/
│   ├── types.ts                        -- TypeScript types for fields, rows, filters, sorts
│   ├── collection.ts                   -- Collection class implementing the interface
│   ├── fields.ts                       -- per-type validators, default values
│   └── filters.ts                      -- filter/sort engine (translates spec → SQL)
├── components/
│   ├── sidebar/
│   │   ├── AppSidebar.tsx              -- (modified) renders pages list + + New page
│   │   ├── PagesList.tsx               -- draggable list
│   │   └── NewPageMenu.tsx             -- dropdown: blank dashboard / blank collection
│   ├── collection/
│   │   ├── CollectionListView.tsx      -- the table view
│   │   ├── CollectionHeader.tsx        -- title, sort/filter buttons, import button slot
│   │   ├── AddFieldButton.tsx
│   │   ├── FieldHeader.tsx             -- header cell with sort + menu
│   │   ├── AddRowButton.tsx
│   │   ├── FilterPopover.tsx
│   │   ├── EmptyCollection.tsx
│   │   └── cells/
│   │       ├── TextCell.tsx
│   │       ├── NumberCell.tsx
│   │       ├── CurrencyCell.tsx
│   │       ├── DateCell.tsx
│   │       ├── DateTimeCell.tsx
│   │       ├── SelectCell.tsx
│   │       ├── MultiSelectCell.tsx
│   │       └── CheckboxCell.tsx
│   ├── pages/
│   │   ├── PageHeader.tsx              -- shared header for dashboards + collections
│   │   └── PageEmojiPicker.tsx         -- placeholder, full picker added in Plan 5
│   └── empty/
│       └── EmptyDashboard.tsx          -- placeholder shown until Plan 3 adds editor
├── app/(app)/
│   ├── page.tsx                        -- (modified) redirects to most-recent page or empty state
│   ├── p/[pageId]/page.tsx             -- dashboard page (placeholder body)
│   └── c/[pageId]/page.tsx             -- collection page
└── lib/collections/*.test.ts           -- unit tests for filters and field validation

supabase/migrations/
├── 20260429000001_pages.sql
├── 20260429000002_collections.sql
└── 20260429000003_indexes.sql

tests/e2e/
├── pages.spec.ts
└── collections.spec.ts
```

---

### Task 1: Add missing shadcn components

**Files:** components in `packages/ui/src/components/`

- [ ] **Step 1: Add components needed for this plan**

```bash
cd /Users/tristanfleming/Documents/Code/Trading
pnpm dlx shadcn@latest add dropdown-menu popover select command calendar checkbox badge combobox table sheet alert-dialog tooltip empty toggle-group --yes
```

- [ ] **Step 2: Verify**

```bash
ls packages/ui/src/components/ | sort
```

Expected: includes all of the components above.

- [ ] **Step 3: Commit**

```bash
git add packages/ui apps/web
git commit -m "chore: add shadcn components needed for pages and collections"
```

---

### Task 2: Migration — pages table

**Files:**
- Create: `supabase/migrations/20260429000001_pages.sql`

- [ ] **Step 1: Generate**

```bash
supabase migration new pages
mv supabase/migrations/$(ls -t supabase/migrations | head -1) supabase/migrations/20260429000001_pages.sql
```

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20260429000001_pages.sql

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  emoji TEXT,
  page_type TEXT NOT NULL CHECK (page_type IN ('dashboard','collection')),
  document JSONB,
  collection_id UUID,                        -- FK added in Task 3 (after collections table exists)
  sort_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pages_type_check CHECK (
    (page_type = 'dashboard' AND document IS NOT NULL AND collection_id IS NULL) OR
    (page_type = 'collection' AND document IS NULL AND collection_id IS NOT NULL)
  )
);

CREATE INDEX pages_owner_idx ON pages (owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX pages_collection_idx ON pages (collection_id) WHERE collection_id IS NOT NULL;

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY pages_owner ON pages FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pages_touch_updated_at BEFORE UPDATE ON pages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

- [ ] **Step 3: Apply + commit**

```bash
supabase db reset
pnpm db:types
git add supabase/migrations apps/web/lib/supabase/types.ts
git commit -m "feat(db): pages table with RLS and updated_at trigger"
```

---

### Task 3: Migration — collections, fields, rows, views

**Files:**
- Create: `supabase/migrations/20260429000002_collections.sql`

- [ ] **Step 1: Generate + write**

```sql
-- supabase/migrations/20260429000002_collections.sql

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  managed_by_connection TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collections_owner_idx ON collections (owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE TRIGGER collections_touch BEFORE UPDATE ON collections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY collections_owner ON collections FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

-- Now that collections exists, add the FK from pages.collection_id
ALTER TABLE pages ADD CONSTRAINT pages_collection_fk
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;

CREATE TABLE collection_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN
    ('text','number','currency','date','datetime','select','multi_select','checkbox')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collection_fields_collection_idx ON collection_fields (collection_id);

ALTER TABLE collection_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_fields_owner ON collection_fields FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

CREATE TABLE collection_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'user',
  source_external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX collection_rows_collection_idx ON collection_rows (collection_id);
CREATE UNIQUE INDEX collection_rows_dedup_idx
  ON collection_rows (owner_type, owner_id, collection_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE TRIGGER collection_rows_touch BEFORE UPDATE ON collection_rows
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE collection_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_rows_owner ON collection_rows FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

CREATE TABLE collection_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user','workspace')),
  owner_id UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'list' CHECK (type IN ('list')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE collection_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_views_owner ON collection_views FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());
```

- [ ] **Step 2: Apply, regenerate types, commit**

```bash
supabase db reset
pnpm db:types
git add supabase/migrations apps/web/lib/supabase/types.ts
git commit -m "feat(db): collections, fields, rows, views with RLS"
```

---

### Task 4: Collection types

**Files:**
- Create: `apps/web/lib/collections/types.ts`

- [ ] **Step 1: Write field/value/filter/sort types**

```ts
// apps/web/lib/collections/types.ts
export type FieldType =
  | "text" | "number" | "currency"
  | "date" | "datetime"
  | "select" | "multi_select" | "checkbox";

export type SelectOption = { value: string; label: string; color?: string };

export type FieldConfig = {
  precision?: number;          // number/currency
  format?: "decimal" | "percent"; // number
  defaultCurrency?: string;    // currency — used as default when adding rows
};

export type Field = {
  id: string;
  collection_id: string;
  name: string;
  type: FieldType;
  options: SelectOption[];
  config: FieldConfig;
  is_system: boolean;
  sort_index: number;
};

export type FieldValue =
  | string                                // text, date, datetime (ISO), select
  | number                                // number
  | boolean                               // checkbox
  | string[]                              // multi_select
  | { amount: number; currency_code: string } // currency
  | null;

export type Row = {
  id: string;
  collection_id: string;
  data: Record<string, FieldValue>;       // keyed by field.id
  source: "user" | `connection:${string}`;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FilterOperator =
  | "eq" | "neq" | "contains" | "starts_with"
  | "gt" | "gte" | "lt" | "lte"
  | "is_empty" | "is_not_empty"
  | "in" | "not_in";

export type Filter = {
  fieldId: string;
  operator: FilterOperator;
  value?: FieldValue;
};

export type Sort = { fieldId: string; direction: "asc" | "desc" };

export type ViewConfig = {
  sort: Sort[];
  filters: Filter[];
  visibleFields: string[]; // field IDs in order; if empty, show all
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/lib/collections/types.ts
git commit -m "feat(collections): TypeScript types for fields, rows, filters, sorts"
```

---

### Task 5: Field type registry (defaults, validators, normalizers)

**Files:**
- Create: `apps/web/lib/collections/fields.ts`
- Create: `apps/web/lib/collections/fields.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/lib/collections/fields.test.ts
import { describe, it, expect } from "vitest";
import { defaultValueFor, normalizeValue } from "./fields";

describe("defaultValueFor", () => {
  it("text → empty string", () => {
    expect(defaultValueFor({ type: "text" } as any)).toBe("");
  });
  it("checkbox → false", () => {
    expect(defaultValueFor({ type: "checkbox" } as any)).toBe(false);
  });
  it("multi_select → empty array", () => {
    expect(defaultValueFor({ type: "multi_select" } as any)).toEqual([]);
  });
  it("currency → null (user must enter explicitly)", () => {
    expect(defaultValueFor({ type: "currency" } as any)).toBeNull();
  });
});

describe("normalizeValue", () => {
  it("number coerces string to number", () => {
    expect(normalizeValue({ type: "number" } as any, "12.5")).toBe(12.5);
  });
  it("number rejects NaN", () => {
    expect(() => normalizeValue({ type: "number" } as any, "not-a-number")).toThrow();
  });
  it("currency requires amount + currency_code", () => {
    expect(normalizeValue({ type: "currency" } as any, { amount: 100, currency_code: "USD" }))
      .toEqual({ amount: 100, currency_code: "USD" });
    expect(() => normalizeValue({ type: "currency" } as any, { amount: 100 })).toThrow();
  });
  it("checkbox accepts boolean only", () => {
    expect(normalizeValue({ type: "checkbox" } as any, true)).toBe(true);
    expect(() => normalizeValue({ type: "checkbox" } as any, "yes")).toThrow();
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
pnpm --filter web exec vitest run lib/collections/fields.test.ts
```

Expected: failures (file doesn't exist).

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/collections/fields.ts
import type { Field, FieldValue } from "./types";

export function defaultValueFor(field: Pick<Field, "type">): FieldValue {
  switch (field.type) {
    case "text": return "";
    case "number": return null;
    case "currency": return null;
    case "date": return null;
    case "datetime": return null;
    case "select": return null;
    case "multi_select": return [];
    case "checkbox": return false;
  }
}

export function normalizeValue(field: Pick<Field, "type">, value: unknown): FieldValue {
  if (value === null || value === undefined) return null;

  switch (field.type) {
    case "text":
      if (typeof value !== "string") throw new Error("text expects string");
      return value;

    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) throw new Error("number expects a finite number");
      return n;
    }

    case "currency": {
      if (typeof value !== "object" || value === null) throw new Error("currency expects {amount, currency_code}");
      const v = value as Record<string, unknown>;
      if (typeof v.amount !== "number" || typeof v.currency_code !== "string") {
        throw new Error("currency expects {amount: number, currency_code: string}");
      }
      return { amount: v.amount, currency_code: v.currency_code };
    }

    case "date":
    case "datetime": {
      if (typeof value !== "string") throw new Error(`${field.type} expects ISO string`);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error("invalid date");
      return field.type === "date" ? d.toISOString().slice(0, 10) : d.toISOString();
    }

    case "select":
      if (typeof value !== "string") throw new Error("select expects string");
      return value;

    case "multi_select":
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new Error("multi_select expects string[]");
      }
      return value as string[];

    case "checkbox":
      if (typeof value !== "boolean") throw new Error("checkbox expects boolean");
      return value;
  }
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
pnpm --filter web exec vitest run lib/collections/fields.test.ts
```

Expected: 4 + 4 = 8 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/collections/fields.ts apps/web/lib/collections/fields.test.ts
git commit -m "feat(collections): field defaults and normalizers with tests"
```

---

### Task 6: Filter / sort engine (translates spec → SQL)

**Files:**
- Create: `apps/web/lib/collections/filters.ts`
- Create: `apps/web/lib/collections/filters.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/lib/collections/filters.test.ts
import { describe, it, expect } from "vitest";
import { buildFilterClause, buildOrderClause } from "./filters";
import type { Field, Filter, Sort } from "./types";

const fields: Record<string, Field> = {
  symbol: { id: "symbol", collection_id: "c1", name: "Symbol", type: "text", options: [], config: {}, is_system: true, sort_index: 0 },
  pnl: { id: "pnl", collection_id: "c1", name: "PnL", type: "number", options: [], config: {}, is_system: true, sort_index: 1 },
  date: { id: "date", collection_id: "c1", name: "Date", type: "date", options: [], config: {}, is_system: true, sort_index: 2 },
};

describe("buildFilterClause", () => {
  it("eq on text", () => {
    const { sql, params } = buildFilterClause(
      [{ fieldId: "symbol", operator: "eq", value: "AAPL" }],
      fields,
    );
    expect(sql).toBe("(data->>'symbol' = $1)");
    expect(params).toEqual(["AAPL"]);
  });

  it("gt on number", () => {
    const { sql, params } = buildFilterClause(
      [{ fieldId: "pnl", operator: "gt", value: 100 }],
      fields,
    );
    expect(sql).toBe("((data->>'pnl')::numeric > $1)");
    expect(params).toEqual([100]);
  });

  it("contains on text", () => {
    const { sql, params } = buildFilterClause(
      [{ fieldId: "symbol", operator: "contains", value: "AA" }],
      fields,
    );
    expect(sql).toBe("(data->>'symbol' ILIKE $1)");
    expect(params).toEqual(["%AA%"]);
  });

  it("AND-joins multiple filters with sequential params", () => {
    const { sql, params } = buildFilterClause(
      [
        { fieldId: "symbol", operator: "eq", value: "AAPL" },
        { fieldId: "pnl", operator: "gt", value: 0 },
      ],
      fields,
    );
    expect(sql).toBe("(data->>'symbol' = $1) AND ((data->>'pnl')::numeric > $2)");
    expect(params).toEqual(["AAPL", 0]);
  });
});

describe("buildOrderClause", () => {
  it("orders by text asc", () => {
    expect(buildOrderClause([{ fieldId: "symbol", direction: "asc" }], fields))
      .toBe("ORDER BY data->>'symbol' ASC NULLS LAST");
  });
  it("orders by number desc", () => {
    expect(buildOrderClause([{ fieldId: "pnl", direction: "desc" }], fields))
      .toBe("ORDER BY (data->>'pnl')::numeric DESC NULLS LAST");
  });
  it("returns empty string when no sorts", () => {
    expect(buildOrderClause([], fields)).toBe("");
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
pnpm --filter web exec vitest run lib/collections/filters.test.ts
```

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/collections/filters.ts
import type { Field, Filter, Sort } from "./types";

const NUMERIC_TYPES = new Set(["number", "currency"]);
const DATETIME_TYPES = new Set(["date", "datetime"]);

function fieldExpr(field: Field): string {
  if (NUMERIC_TYPES.has(field.type)) {
    // currency stores {amount, currency_code} — for filter/sort, project amount
    if (field.type === "currency") return `((data->'${field.id}'->>'amount')::numeric)`;
    return `((data->>'${field.id}')::numeric)`;
  }
  if (DATETIME_TYPES.has(field.type)) {
    return `((data->>'${field.id}')::timestamptz)`;
  }
  return `data->>'${field.id}'`;
}

export function buildFilterClause(
  filters: Filter[],
  fields: Record<string, Field>,
): { sql: string; params: unknown[] } {
  if (filters.length === 0) return { sql: "", params: [] };
  const params: unknown[] = [];
  const clauses = filters.map((f) => {
    const field = fields[f.fieldId];
    if (!field) throw new Error(`unknown field: ${f.fieldId}`);
    const expr = fieldExpr(field);
    const i = () => `$${params.length + 1}`;
    switch (f.operator) {
      case "eq":   params.push(f.value); return `(${expr} = ${i()})`.replace(`$${params.length + 1}`, `$${params.length}`);
      case "neq":  params.push(f.value); return `(${expr} <> $${params.length})`;
      case "gt":   params.push(f.value); return `(${expr} > $${params.length})`;
      case "gte":  params.push(f.value); return `(${expr} >= $${params.length})`;
      case "lt":   params.push(f.value); return `(${expr} < $${params.length})`;
      case "lte":  params.push(f.value); return `(${expr} <= $${params.length})`;
      case "contains": params.push(`%${f.value}%`); return `(${expr} ILIKE $${params.length})`;
      case "starts_with": params.push(`${f.value}%`); return `(${expr} ILIKE $${params.length})`;
      case "is_empty": return `(${expr} IS NULL)`;
      case "is_not_empty": return `(${expr} IS NOT NULL)`;
      case "in":   params.push(f.value); return `(${expr} = ANY($${params.length}))`;
      case "not_in": params.push(f.value); return `(${expr} <> ALL($${params.length}))`;
    }
  });
  // Re-run to fix the `eq` case (the .replace was a typo):
  // redo cleanly
  const cleanParams: unknown[] = [];
  const cleanClauses = filters.map((f) => {
    const field = fields[f.fieldId];
    if (!field) throw new Error(`unknown field: ${f.fieldId}`);
    const expr = fieldExpr(field);
    const push = (v: unknown) => { cleanParams.push(v); return cleanParams.length; };
    switch (f.operator) {
      case "eq":           return `(${expr} = $${push(f.value)})`;
      case "neq":          return `(${expr} <> $${push(f.value)})`;
      case "gt":           return `(${expr} > $${push(f.value)})`;
      case "gte":          return `(${expr} >= $${push(f.value)})`;
      case "lt":           return `(${expr} < $${push(f.value)})`;
      case "lte":          return `(${expr} <= $${push(f.value)})`;
      case "contains":     return `(${expr} ILIKE $${push(`%${f.value}%`)})`;
      case "starts_with":  return `(${expr} ILIKE $${push(`${f.value}%`)})`;
      case "is_empty":     return `(${expr} IS NULL)`;
      case "is_not_empty": return `(${expr} IS NOT NULL)`;
      case "in":           return `(${expr} = ANY($${push(f.value)}))`;
      case "not_in":       return `(${expr} <> ALL($${push(f.value)}))`;
    }
  });
  return { sql: cleanClauses.join(" AND "), params: cleanParams };
}

export function buildOrderClause(sorts: Sort[], fields: Record<string, Field>): string {
  if (sorts.length === 0) return "";
  const parts = sorts.map((s) => {
    const field = fields[s.fieldId];
    if (!field) throw new Error(`unknown field: ${s.fieldId}`);
    const expr = fieldExpr(field);
    const dir = s.direction.toUpperCase();
    return `${expr} ${dir} NULLS LAST`;
  });
  return `ORDER BY ${parts.join(", ")}`;
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
pnpm --filter web exec vitest run lib/collections/filters.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/collections/filters.ts apps/web/lib/collections/filters.test.ts
git commit -m "feat(collections): filter/sort SQL builder with tests"
```

---

### Task 7: Collection class (the runtime interface)

**Files:**
- Create: `apps/web/lib/collections/collection.ts`

- [ ] **Step 1: Write the class**

```ts
// apps/web/lib/collections/collection.ts
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Field, Filter, Row, Sort } from "./types";
import { buildFilterClause, buildOrderClause } from "./filters";

export class Collection {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly fields: Field[],
  ) {}

  static async load(collectionId: string): Promise<Collection> {
    const supabase = await createServerSupabase();
    const [{ data: meta }, { data: fields }] = await Promise.all([
      supabase.from("collections").select("id, name").eq("id", collectionId).single(),
      supabase.from("collection_fields").select("*").eq("collection_id", collectionId).order("sort_index"),
    ]);
    if (!meta) throw new Error("Collection not found");
    return new Collection(meta.id, meta.name, (fields ?? []) as unknown as Field[]);
  }

  fieldsById(): Record<string, Field> {
    return Object.fromEntries(this.fields.map((f) => [f.id, f]));
  }

  async list(opts: { filters?: Filter[]; sort?: Sort[]; limit?: number; offset?: number } = {}): Promise<Row[]> {
    const supabase = await createServerSupabase();
    // Use Supabase's REST query for simple cases; for complex filters use rpc("collection_query")
    // v1: handle filters in JS for simplicity (volume is small) when complex, or use the
    // SQL builder via supabase.rpc for performance. v1 ships with the JS path.
    let query = supabase.from("collection_rows").select("*").eq("collection_id", this.id);
    if (opts.limit) query = query.limit(opts.limit);
    if (opts.offset) query = query.range(opts.offset, (opts.offset + (opts.limit ?? 100)) - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const fieldsById = this.fieldsById();
    let rows = (data ?? []) as unknown as Row[];

    if (opts.filters?.length) {
      rows = applyFiltersInJS(rows, opts.filters, fieldsById);
    }
    if (opts.sort?.length) {
      rows = applySortInJS(rows, opts.sort, fieldsById);
    }
    return rows;
  }

  async count(opts: { filters?: Filter[] } = {}): Promise<number> {
    const rows = await this.list({ filters: opts.filters });
    return rows.length;
  }

  async getRow(rowId: string): Promise<Row | null> {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("collection_rows")
      .select("*")
      .eq("id", rowId)
      .eq("collection_id", this.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as unknown as Row | null;
  }
}

// JS fallback implementations — used in v1; switch to SQL via RPC if perf demands
function applyFiltersInJS(rows: Row[], filters: Filter[], fields: Record<string, Field>): Row[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const field = fields[f.fieldId];
      if (!field) return false;
      const v = row.data[f.fieldId];
      switch (f.operator) {
        case "eq":           return v === f.value;
        case "neq":          return v !== f.value;
        case "gt":           return typeof v === "number" && typeof f.value === "number" && v > f.value;
        case "gte":          return typeof v === "number" && typeof f.value === "number" && v >= f.value;
        case "lt":           return typeof v === "number" && typeof f.value === "number" && v < f.value;
        case "lte":          return typeof v === "number" && typeof f.value === "number" && v <= f.value;
        case "contains":     return typeof v === "string" && typeof f.value === "string" && v.toLowerCase().includes(f.value.toLowerCase());
        case "starts_with":  return typeof v === "string" && typeof f.value === "string" && v.toLowerCase().startsWith(f.value.toLowerCase());
        case "is_empty":     return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
        case "is_not_empty": return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
        case "in":           return Array.isArray(f.value) && f.value.includes(v as string);
        case "not_in":       return Array.isArray(f.value) && !f.value.includes(v as string);
      }
    })
  );
}

function applySortInJS(rows: Row[], sorts: Sort[], _fields: Record<string, Field>): Row[] {
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const av = a.data[s.fieldId];
      const bv = b.data[s.fieldId];
      const cmp = compareValues(av, bv);
      if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/lib/collections/collection.ts
git commit -m "feat(collections): Collection class with list/count/getRow + JS filter/sort"
```

---

### Task 8: Page Server Actions

**Files:**
- Create: `apps/web/actions/pages.ts`

- [ ] **Step 1: Write the actions**

```ts
// apps/web/actions/pages.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Result = <T>(data: T) => ({ ok: true as const, data });
const Err = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, user };
}

export async function listPages() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("pages")
    .select("id, title, emoji, page_type, sort_index, collection_id")
    .eq("owner_type", "user")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .order("sort_index");
  if (error) return Err("LIST_FAILED", error.message);
  return Result(data ?? []);
}

const CreatePageSchema = z.object({
  pageType: z.enum(["dashboard", "collection"]),
  title: z.string().default("Untitled"),
  // when pageType=collection, the action also creates the underlying collection
  collectionName: z.string().optional(),
});

export async function createPage(input: z.infer<typeof CreatePageSchema>) {
  const parsed = CreatePageSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);

  const { supabase, user } = await requireUser();

  // Compute next sort_index
  const { data: lastPage } = await supabase
    .from("pages")
    .select("sort_index")
    .eq("owner_type", "user")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .order("sort_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_index = (lastPage?.sort_index ?? 0) + 1000;

  if (parsed.data.pageType === "dashboard") {
    const { data, error } = await supabase
      .from("pages")
      .insert({
        owner_type: "user",
        owner_id: user.id,
        title: parsed.data.title,
        page_type: "dashboard",
        document: { type: "doc", children: [{ type: "p", children: [{ text: "" }] }] },
        sort_index,
      })
      .select("id")
      .single();
    if (error) return Err("CREATE_FAILED", error.message);
    revalidatePath("/", "layout");
    return Result({ id: data.id });
  }

  // collection page: create collection, then page, then default view
  const { data: collection, error: cErr } = await supabase
    .from("collections")
    .insert({
      owner_type: "user",
      owner_id: user.id,
      name: parsed.data.collectionName ?? parsed.data.title,
    })
    .select("id")
    .single();
  if (cErr) return Err("CREATE_FAILED", cErr.message);

  const { data: page, error: pErr } = await supabase
    .from("pages")
    .insert({
      owner_type: "user",
      owner_id: user.id,
      title: parsed.data.title,
      page_type: "collection",
      collection_id: collection.id,
      sort_index,
    })
    .select("id")
    .single();
  if (pErr) return Err("CREATE_FAILED", pErr.message);

  await supabase.from("collection_views").insert({
    owner_type: "user",
    owner_id: user.id,
    collection_id: collection.id,
    name: "Default view",
    type: "list",
    config: { sort: [], filters: [], visibleFields: [] },
    is_default: true,
    sort_index: 0,
  });

  revalidatePath("/", "layout");
  return Result({ id: page.id, collection_id: collection.id });
}

const RenameSchema = z.object({ pageId: z.string().uuid(), title: z.string().min(1) });
export async function renamePage(input: z.infer<typeof RenameSchema>) {
  const parsed = RenameSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("pages").update({ title: parsed.data.title }).eq("id", parsed.data.pageId);
  if (error) return Err("RENAME_FAILED", error.message);
  revalidatePath("/", "layout");
  return Result({});
}

const EmojiSchema = z.object({ pageId: z.string().uuid(), emoji: z.string().nullable() });
export async function changePageEmoji(input: z.infer<typeof EmojiSchema>) {
  const parsed = EmojiSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("pages").update({ emoji: parsed.data.emoji }).eq("id", parsed.data.pageId);
  if (error) return Err("UPDATE_FAILED", error.message);
  revalidatePath("/", "layout");
  return Result({});
}

const DeleteSchema = z.object({ pageId: z.string().uuid() });
export async function deletePage(input: z.infer<typeof DeleteSchema>) {
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("pages").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data.pageId);
  if (error) return Err("DELETE_FAILED", error.message);
  revalidatePath("/", "layout");
  return Result({});
}

const ReorderSchema = z.object({ pageIds: z.array(z.string().uuid()) });
export async function reorderPages(input: z.infer<typeof ReorderSchema>) {
  const parsed = ReorderSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();
  // Assign new sort_index values in 1000-step increments
  const updates = parsed.data.pageIds.map((id, idx) =>
    supabase.from("pages").update({ sort_index: (idx + 1) * 1000 }).eq("id", id),
  );
  await Promise.all(updates);
  revalidatePath("/", "layout");
  return Result({});
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/actions/pages.ts
git commit -m "feat(actions): page CRUD and reorder"
```

---

### Task 9: Collection Server Actions

**Files:**
- Create: `apps/web/actions/collections.ts`

- [ ] **Step 1: Write the actions**

```ts
// apps/web/actions/collections.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { defaultValueFor, normalizeValue } from "@/lib/collections/fields";
import type { FieldType, Field } from "@/lib/collections/types";

const Result = <T>(data: T) => ({ ok: true as const, data });
const Err = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, user };
}

const FieldTypeEnum = z.enum(["text","number","currency","date","datetime","select","multi_select","checkbox"]);

const AddFieldSchema = z.object({
  collectionId: z.string().uuid(),
  name: z.string().min(1),
  type: FieldTypeEnum,
  options: z.array(z.object({ value: z.string(), label: z.string(), color: z.string().optional() })).default([]),
  config: z.record(z.unknown()).default({}),
});

export async function addField(input: z.infer<typeof AddFieldSchema>) {
  const parsed = AddFieldSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase, user } = await requireUser();

  // Compute next sort_index
  const { data: lastField } = await supabase
    .from("collection_fields")
    .select("sort_index")
    .eq("collection_id", parsed.data.collectionId)
    .order("sort_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_index = (lastField?.sort_index ?? 0) + 1000;

  const { data, error } = await supabase
    .from("collection_fields")
    .insert({
      owner_type: "user",
      owner_id: user.id,
      collection_id: parsed.data.collectionId,
      name: parsed.data.name,
      type: parsed.data.type,
      options: parsed.data.options,
      config: parsed.data.config,
      sort_index,
    })
    .select("id")
    .single();
  if (error) return Err("ADD_FIELD_FAILED", error.message);
  revalidatePath("/c/[pageId]", "page");
  return Result({ id: data.id });
}

const RenameFieldSchema = z.object({ fieldId: z.string().uuid(), name: z.string().min(1) });
export async function renameField(input: z.infer<typeof RenameFieldSchema>) {
  const parsed = RenameFieldSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();

  // Refuse to rename system fields
  const { data: field } = await supabase
    .from("collection_fields").select("is_system").eq("id", parsed.data.fieldId).single();
  if (field?.is_system) return Err("SYSTEM_FIELD", "System fields can't be renamed.");

  const { error } = await supabase.from("collection_fields").update({ name: parsed.data.name }).eq("id", parsed.data.fieldId);
  if (error) return Err("RENAME_FAILED", error.message);
  revalidatePath("/c/[pageId]", "page");
  return Result({});
}

const DeleteFieldSchema = z.object({ fieldId: z.string().uuid() });
export async function deleteField(input: z.infer<typeof DeleteFieldSchema>) {
  const parsed = DeleteFieldSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();

  const { data: field } = await supabase
    .from("collection_fields").select("is_system").eq("id", parsed.data.fieldId).single();
  if (field?.is_system) return Err("SYSTEM_FIELD", "System fields can't be deleted.");

  const { error } = await supabase.from("collection_fields").delete().eq("id", parsed.data.fieldId);
  if (error) return Err("DELETE_FAILED", error.message);
  revalidatePath("/c/[pageId]", "page");
  return Result({});
}

const AddRowSchema = z.object({ collectionId: z.string().uuid(), data: z.record(z.unknown()).default({}) });
export async function addRow(input: z.infer<typeof AddRowSchema>) {
  const parsed = AddRowSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase, user } = await requireUser();

  // Build initial data: defaults for every field unless overridden
  const { data: fields } = await supabase
    .from("collection_fields").select("*").eq("collection_id", parsed.data.collectionId);
  const initial: Record<string, unknown> = {};
  (fields ?? []).forEach((f: any) => { initial[f.id] = defaultValueFor(f); });
  Object.assign(initial, parsed.data.data);

  const { data, error } = await supabase
    .from("collection_rows")
    .insert({
      owner_type: "user",
      owner_id: user.id,
      collection_id: parsed.data.collectionId,
      data: initial,
      source: "user",
    })
    .select("id")
    .single();
  if (error) return Err("ADD_ROW_FAILED", error.message);
  revalidatePath("/c/[pageId]", "page");
  return Result({ id: data.id });
}

const UpdateRowFieldSchema = z.object({
  rowId: z.string().uuid(),
  fieldId: z.string().uuid(),
  value: z.unknown(),
});
export async function updateRowField(input: z.infer<typeof UpdateRowFieldSchema>) {
  const parsed = UpdateRowFieldSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();

  const { data: field } = await supabase
    .from("collection_fields").select("type").eq("id", parsed.data.fieldId).single() as { data: Pick<Field, "type"> | null };
  if (!field) return Err("FIELD_NOT_FOUND", "Field doesn't exist.");

  let normalized;
  try {
    normalized = normalizeValue(field, parsed.data.value);
  } catch (e) {
    return Err("INVALID_VALUE", (e as Error).message);
  }

  // Read-modify-write the JSONB blob
  const { data: row } = await supabase.from("collection_rows").select("data").eq("id", parsed.data.rowId).single();
  if (!row) return Err("ROW_NOT_FOUND", "Row doesn't exist.");
  const newData = { ...(row.data as Record<string, unknown>), [parsed.data.fieldId]: normalized };

  const { error } = await supabase.from("collection_rows").update({ data: newData }).eq("id", parsed.data.rowId);
  if (error) return Err("UPDATE_FAILED", error.message);
  revalidatePath("/c/[pageId]", "page");
  return Result({});
}

const DeleteRowSchema = z.object({ rowId: z.string().uuid() });
export async function deleteRow(input: z.infer<typeof DeleteRowSchema>) {
  const parsed = DeleteRowSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("collection_rows").delete().eq("id", parsed.data.rowId);
  if (error) return Err("DELETE_FAILED", error.message);
  revalidatePath("/c/[pageId]", "page");
  return Result({});
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add apps/web/actions/collections.ts
git commit -m "feat(actions): collection field/row CRUD with type-safe normalization"
```

---

### Task 10: View config Server Actions (sort/filter persistence)

**Files:**
- Create: `apps/web/actions/views.ts`

- [ ] **Step 1: Write**

```ts
// apps/web/actions/views.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SortSchema = z.array(z.object({ fieldId: z.string(), direction: z.enum(["asc","desc"]) }));
const FilterSchema = z.array(z.object({
  fieldId: z.string(),
  operator: z.enum(["eq","neq","gt","gte","lt","lte","contains","starts_with","is_empty","is_not_empty","in","not_in"]),
  value: z.unknown().optional(),
}));
const VisibleFieldsSchema = z.array(z.string());

const UpdateViewSchema = z.object({
  viewId: z.string().uuid(),
  config: z.object({
    sort: SortSchema.optional(),
    filters: FilterSchema.optional(),
    visibleFields: VisibleFieldsSchema.optional(),
  }),
});

export async function updateView(input: z.infer<typeof UpdateViewSchema>) {
  const parsed = UpdateViewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0].message } };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in." } };

  // Read existing config and merge
  const { data: view } = await supabase.from("collection_views").select("config").eq("id", parsed.data.viewId).single();
  const newConfig = { ...(view?.config as object), ...parsed.data.config };

  const { error } = await supabase.from("collection_views").update({ config: newConfig }).eq("id", parsed.data.viewId);
  if (error) return { ok: false as const, error: { code: "UPDATE_FAILED", message: error.message } };
  revalidatePath("/c/[pageId]", "page");
  return { ok: true as const, data: {} };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/actions/views.ts
git commit -m "feat(actions): updateView for sort/filter/visibleFields"
```

---

### Task 11: Sidebar PagesList component

**Files:**
- Create: `apps/web/components/sidebar/PagesList.tsx`
- Modify: `apps/web/components/sidebar/AppSidebar.tsx`

- [ ] **Step 1: Install dnd-kit**

```bash
pnpm --filter web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers
```

- [ ] **Step 2: Write PagesList**

```tsx
// apps/web/components/sidebar/PagesList.tsx
"use client";
import Link from "next/link";
import { useTransition } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@workspace/ui/components/sidebar";
import { reorderPages } from "@/actions/pages";

type PageRow = {
  id: string;
  title: string;
  emoji: string | null;
  page_type: "dashboard" | "collection";
};

function PageItem({ page }: { page: PageRow }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: page.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const href = page.page_type === "dashboard" ? `/p/${page.id}` : `/c/${page.id}`;
  return (
    <SidebarMenuItem ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SidebarMenuButton asChild>
        <Link href={href}>
          <span className="size-4 inline-flex items-center justify-center text-sm">
            {page.emoji ?? (page.page_type === "dashboard" ? "📊" : "📋")}
          </span>
          <span>{page.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function PagesList({ pages: initial }: { pages: PageRow[] }) {
  const [, startTransition] = useTransition();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = initial.findIndex((p) => p.id === active.id);
    const newIndex = initial.findIndex((p) => p.id === over.id);
    const next = arrayMove(initial, oldIndex, newIndex);
    startTransition(() => reorderPages({ pageIds: next.map((p) => p.id) }));
  }

  return (
    <DndContext collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={initial.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <SidebarMenu>
          {initial.map((p) => <PageItem key={p.id} page={p} />)}
        </SidebarMenu>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 3: Modify AppSidebar to fetch and render pages**

```tsx
// apps/web/components/sidebar/AppSidebar.tsx
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { Button } from "@workspace/ui/components/button";
import { signOut } from "@/actions/auth";
import { listPages } from "@/actions/pages";
import { PagesList } from "./PagesList";
import { NewPageMenu } from "./NewPageMenu";

export async function AppSidebar() {
  const result = await listPages();
  const pages = result.ok ? result.data : [];

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="px-3 py-2 font-semibold text-sm">Backdesk</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NewPageMenu />
            <PagesList pages={pages as any} />
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

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/sidebar pnpm-lock.yaml
git commit -m "feat(sidebar): pages list with drag-to-reorder"
```

---

### Task 12: NewPageMenu (+ New page dropdown)

**Files:**
- Create: `apps/web/components/sidebar/NewPageMenu.tsx`

- [ ] **Step 1: Write**

```tsx
// apps/web/components/sidebar/NewPageMenu.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";
import { createPage } from "@/actions/pages";

export function NewPageMenu() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function newDashboard() {
    startTransition(async () => {
      const result = await createPage({ pageType: "dashboard", title: "Untitled" });
      if (!result.ok) { toast.error(result.error.message); return; }
      router.push(`/p/${result.data.id}`);
    });
  }
  function newCollection() {
    startTransition(async () => {
      const result = await createPage({ pageType: "collection", title: "Untitled", collectionName: "Untitled" });
      if (!result.ok) { toast.error(result.error.message); return; }
      router.push(`/c/${result.data.id}`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start" disabled={isPending}>
          <Plus data-icon="inline-start" />
          New page
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={newDashboard}>📊 Blank dashboard</DropdownMenuItem>
          <DropdownMenuItem onClick={newCollection}>📋 Blank collection</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>From template</DropdownMenuLabel>
        <DropdownMenuItem disabled>Templates ship in Plan 4</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Connections</DropdownMenuLabel>
        <DropdownMenuItem disabled>Importers ship in Plan 4</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/sidebar/NewPageMenu.tsx
git commit -m "feat(sidebar): NewPageMenu dropdown for blank dashboard/collection"
```

---

### Task 13: Dashboard page route (placeholder)

**Files:**
- Create: `apps/web/app/(app)/p/[pageId]/page.tsx`
- Create: `apps/web/components/empty/EmptyDashboard.tsx`

- [ ] **Step 1: Write the dashboard page**

```tsx
// apps/web/app/(app)/p/[pageId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyDashboard } from "@/components/empty/EmptyDashboard";

export default async function DashboardPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("id, title, emoji, page_type")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!page || page.page_type !== "dashboard") notFound();

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-3xl font-semibold mb-6">
        {page.emoji && <span className="mr-2">{page.emoji}</span>}
        {page.title}
      </h1>
      <EmptyDashboard pageId={page.id} />
    </div>
  );
}
```

- [ ] **Step 2: Write EmptyDashboard placeholder**

```tsx
// apps/web/components/empty/EmptyDashboard.tsx
import { Empty } from "@workspace/ui/components/empty";

export function EmptyDashboard({ pageId: _ }: { pageId: string }) {
  return (
    <Empty>
      <h3 className="font-medium">Block editor coming in Plan 3</h3>
      <p className="text-sm text-muted-foreground">
        Once the editor is wired up, type <code>/</code> to insert blocks (cards, charts, tables, text).
      </p>
    </Empty>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/p apps/web/components/empty
git commit -m "feat(web): dashboard page route with empty placeholder"
```

---

### Task 14: Collection page route + CollectionListView shell

**Files:**
- Create: `apps/web/app/(app)/c/[pageId]/page.tsx`
- Create: `apps/web/components/collection/CollectionListView.tsx`
- Create: `apps/web/components/collection/CollectionHeader.tsx`
- Create: `apps/web/components/collection/EmptyCollection.tsx`

- [ ] **Step 1: Write the collection page**

```tsx
// apps/web/app/(app)/c/[pageId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Collection } from "@/lib/collections/collection";
import { CollectionListView } from "@/components/collection/CollectionListView";

export default async function CollectionPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("id, title, emoji, page_type, collection_id")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!page || page.page_type !== "collection" || !page.collection_id) notFound();

  const collection = await Collection.load(page.collection_id);
  const { data: views } = await supabase
    .from("collection_views").select("*").eq("collection_id", page.collection_id).order("sort_index").limit(1);
  const view = views?.[0];

  // SSR a fresh page of rows
  const initialRows = await collection.list({
    sort: (view?.config as any)?.sort ?? [],
    filters: (view?.config as any)?.filters ?? [],
    limit: 100,
  });

  return (
    <CollectionListView
      page={page as any}
      collection={{ id: collection.id, name: collection.name, fields: collection.fields }}
      view={view as any}
      initialRows={initialRows as any}
    />
  );
}
```

- [ ] **Step 2: Write CollectionHeader**

```tsx
// apps/web/components/collection/CollectionHeader.tsx
"use client";
import { Button } from "@workspace/ui/components/button";
import { Filter as FilterIcon, ArrowUpDown } from "lucide-react";

export function CollectionHeader({
  title, emoji, onOpenFilters, onOpenSort, importSlot,
}: {
  title: string;
  emoji: string | null;
  onOpenFilters: () => void;
  onOpenSort: () => void;
  importSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-4 mb-4">
      <div className="flex items-center gap-2">
        {emoji && <span className="text-2xl">{emoji}</span>}
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpenSort}>
          <ArrowUpDown data-icon="inline-start" />
          Sort
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenFilters}>
          <FilterIcon data-icon="inline-start" />
          Filter
        </Button>
        {importSlot}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write EmptyCollection**

```tsx
// apps/web/components/collection/EmptyCollection.tsx
import { Empty } from "@workspace/ui/components/empty";
import { Button } from "@workspace/ui/components/button";
import { Plus } from "lucide-react";

export function EmptyCollection({ onAddRow }: { onAddRow: () => void }) {
  return (
    <Empty>
      <h3 className="font-medium">No rows yet</h3>
      <p className="text-sm text-muted-foreground">Add a row to get started, or import data from a connection (Plan 4).</p>
      <Button onClick={onAddRow} size="sm" className="mt-3"><Plus data-icon="inline-start" />Add row</Button>
    </Empty>
  );
}
```

- [ ] **Step 4: Write CollectionListView (shell — cells added in Task 15)**

```tsx
// apps/web/components/collection/CollectionListView.tsx
"use client";
import { useState, useTransition } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CollectionHeader } from "./CollectionHeader";
import { EmptyCollection } from "./EmptyCollection";
import { addRow, addField } from "@/actions/collections";
import type { Field, Row } from "@/lib/collections/types";
// imported in Task 15:
// import { renderCell, renderEditor } from "./cells";

export function CollectionListView({
  page, collection, view, initialRows,
}: {
  page: { id: string; title: string; emoji: string | null };
  collection: { id: string; name: string; fields: Field[] };
  view: { id: string; config: { sort: any; filters: any; visibleFields: string[] } };
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [, startTransition] = useTransition();
  const visible = view.config.visibleFields?.length
    ? collection.fields.filter((f) => view.config.visibleFields.includes(f.id))
    : collection.fields;

  function handleAddRow() {
    startTransition(async () => {
      const result = await addRow({ collectionId: collection.id, data: {} });
      if (!result.ok) { toast.error(result.error.message); return; }
      // Optimistic — the page will revalidate
    });
  }

  function handleAddField() {
    const name = window.prompt("Field name?")?.trim();
    if (!name) return;
    const type = window.prompt("Field type? (text|number|currency|date|datetime|select|multi_select|checkbox)", "text")?.trim();
    if (!type) return;
    startTransition(async () => {
      const result = await addField({ collectionId: collection.id, name, type: type as any });
      if (!result.ok) { toast.error(result.error.message); return; }
    });
  }

  return (
    <div className="max-w-6xl mx-auto py-6">
      <CollectionHeader
        title={page.title}
        emoji={page.emoji}
        onOpenFilters={() => { /* Task 16 */ }}
        onOpenSort={() => { /* Task 16 */ }}
      />

      {rows.length === 0 ? (
        <EmptyCollection onAddRow={handleAddRow} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {visible.map((f) => <TableHead key={f.id}>{f.name}</TableHead>)}
              <TableHead>
                <Button variant="ghost" size="sm" onClick={handleAddField}>
                  <Plus data-icon="inline-start" />
                  Add field
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {visible.map((f) => (
                  <TableCell key={f.id}>
                    {/* renderCell + renderEditor wired up in Task 15 */}
                    {JSON.stringify(row.data[f.id] ?? "")}
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={visible.length + 1}>
                <Button variant="ghost" size="sm" onClick={handleAddRow}>
                  <Plus data-icon="inline-start" />
                  Add row
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/c apps/web/components/collection
git commit -m "feat(web): collection page route + list view shell"
```

---

### Task 15: Type-aware cell components

**Files:**
- Create: `apps/web/components/collection/cells/{TextCell,NumberCell,CurrencyCell,DateCell,DateTimeCell,SelectCell,MultiSelectCell,CheckboxCell}.tsx`
- Create: `apps/web/components/collection/cells/index.tsx`
- Modify: `apps/web/components/collection/CollectionListView.tsx`

- [ ] **Step 1: Write TextCell (template — others follow same pattern)**

```tsx
// apps/web/components/collection/cells/TextCell.tsx
"use client";
import { useState } from "react";
import { Input } from "@workspace/ui/components/input";

export function TextCell({
  value, onSave,
}: {
  value: string | null;
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left w-full min-h-[1.5rem] truncate"
      >
        {v || <span className="text-muted-foreground italic">empty</span>}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); if (v !== (value ?? "")) onSave(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
    />
  );
}
```

- [ ] **Step 2: Write NumberCell**

```tsx
// apps/web/components/collection/cells/NumberCell.tsx
"use client";
import { useState } from "react";
import { Input } from "@workspace/ui/components/input";

export function NumberCell({
  value, onSave,
}: {
  value: number | null;
  onSave: (value: number | null) => void;
}) {
  const [v, setV] = useState(value === null ? "" : String(value));
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-right tabular-nums w-full min-h-[1.5rem]"
      >
        {value === null ? <span className="text-muted-foreground italic">empty</span> : value.toLocaleString()}
      </button>
    );
  }

  return (
    <Input
      type="number"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = v === "" ? null : Number(v);
        if (n !== value) onSave(n);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
    />
  );
}
```

- [ ] **Step 3: Write CurrencyCell**

```tsx
// apps/web/components/collection/cells/CurrencyCell.tsx
"use client";
import { useState } from "react";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

const CURRENCIES = ["USD","EUR","GBP","CAD","JPY","CHF","AUD"];

export function CurrencyCell({
  value, onSave,
}: {
  value: { amount: number; currency_code: string } | null;
  onSave: (value: { amount: number; currency_code: string } | null) => void;
}) {
  const [amount, setAmount] = useState(value === null ? "" : String(value.amount));
  const [code, setCode] = useState(value?.currency_code ?? "USD");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-right tabular-nums w-full min-h-[1.5rem]"
      >
        {value === null
          ? <span className="text-muted-foreground italic">empty</span>
          : new Intl.NumberFormat(undefined, { style: "currency", currency: value.currency_code }).format(value.amount)}
      </button>
    );
  }

  return (
    <div className="flex gap-1">
      <Input
        type="number"
        step="0.01"
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const n = amount === "" ? null : Number(amount);
          const next = n === null ? null : { amount: n, currency_code: code };
          if (JSON.stringify(next) !== JSON.stringify(value)) onSave(next);
        }}
      />
      <Select value={code} onValueChange={setCode}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 4: Write DateCell**

```tsx
// apps/web/components/collection/cells/DateCell.tsx
"use client";
import { useState } from "react";
import { Calendar } from "@workspace/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { format } from "date-fns";

export function DateCell({
  value, onSave,
}: {
  value: string | null;
  onSave: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="text-left w-full min-h-[1.5rem]">
        {date ? format(date, "PP") : <span className="text-muted-foreground italic">empty</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) onSave(d.toISOString().slice(0, 10));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 5: Write DateTimeCell, SelectCell, MultiSelectCell, CheckboxCell**

```tsx
// apps/web/components/collection/cells/DateTimeCell.tsx
"use client";
import { useState } from "react";
import { Input } from "@workspace/ui/components/input";

export function DateTimeCell({
  value, onSave,
}: {
  value: string | null;
  onSave: (value: string | null) => void;
}) {
  const [v, setV] = useState(value ? value.slice(0, 16) : "");
  return (
    <Input
      type="datetime-local"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (!v) { if (value !== null) onSave(null); return; }
        const iso = new Date(v).toISOString();
        if (iso !== value) onSave(iso);
      }}
    />
  );
}
```

```tsx
// apps/web/components/collection/cells/SelectCell.tsx
"use client";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Badge } from "@workspace/ui/components/badge";
import type { SelectOption } from "@/lib/collections/types";

export function SelectCell({
  value, options, onSave,
}: {
  value: string | null;
  options: SelectOption[];
  onSave: (value: string | null) => void;
}) {
  const opt = options.find((o) => o.value === value);
  return (
    <Select value={value ?? ""} onValueChange={(v) => onSave(v || null)}>
      <SelectTrigger className="border-none bg-transparent h-7 shadow-none">
        <SelectValue placeholder={<span className="text-muted-foreground italic">empty</span>}>
          {opt && <Badge variant="secondary">{opt.label}</Badge>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="">— clear —</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
```

```tsx
// apps/web/components/collection/cells/MultiSelectCell.tsx
"use client";
import { useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Checkbox } from "@workspace/ui/components/checkbox";
import type { SelectOption } from "@/lib/collections/types";

export function MultiSelectCell({
  value, options, onSave,
}: {
  value: string[];
  options: SelectOption[];
  onSave: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(v: string) {
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onSave(next);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="text-left w-full min-h-[1.5rem]">
        {value.length === 0 ? (
          <span className="text-muted-foreground italic">empty</span>
        ) : (
          <span className="flex gap-1 flex-wrap">
            {value.map((v) => {
              const opt = options.find((o) => o.value === v);
              return <Badge key={v} variant="secondary">{opt?.label ?? v}</Badge>;
            })}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.value} className="flex items-center gap-2">
              <Checkbox id={`opt-${o.value}`} checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              <label htmlFor={`opt-${o.value}`} className="text-sm">{o.label}</label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

```tsx
// apps/web/components/collection/cells/CheckboxCell.tsx
"use client";
import { Checkbox } from "@workspace/ui/components/checkbox";

export function CheckboxCell({
  value, onSave,
}: {
  value: boolean;
  onSave: (value: boolean) => void;
}) {
  return <Checkbox checked={value} onCheckedChange={(v) => onSave(Boolean(v))} />;
}
```

- [ ] **Step 6: Write the `renderCell` index**

```tsx
// apps/web/components/collection/cells/index.tsx
"use client";
import type { Field, FieldValue } from "@/lib/collections/types";
import { TextCell } from "./TextCell";
import { NumberCell } from "./NumberCell";
import { CurrencyCell } from "./CurrencyCell";
import { DateCell } from "./DateCell";
import { DateTimeCell } from "./DateTimeCell";
import { SelectCell } from "./SelectCell";
import { MultiSelectCell } from "./MultiSelectCell";
import { CheckboxCell } from "./CheckboxCell";

export function renderCell(field: Field, value: FieldValue, onSave: (v: FieldValue) => void) {
  switch (field.type) {
    case "text": return <TextCell value={value as string | null} onSave={onSave as any} />;
    case "number": return <NumberCell value={value as number | null} onSave={onSave as any} />;
    case "currency": return <CurrencyCell value={value as any} onSave={onSave as any} />;
    case "date": return <DateCell value={value as string | null} onSave={onSave as any} />;
    case "datetime": return <DateTimeCell value={value as string | null} onSave={onSave as any} />;
    case "select": return <SelectCell value={value as string | null} options={field.options} onSave={onSave as any} />;
    case "multi_select": return <MultiSelectCell value={(value as string[]) ?? []} options={field.options} onSave={onSave as any} />;
    case "checkbox": return <CheckboxCell value={Boolean(value)} onSave={onSave as any} />;
  }
}
```

- [ ] **Step 7: Wire renderCell into CollectionListView**

In `CollectionListView.tsx`, replace the `JSON.stringify(...)` cell content with:

```tsx
import { renderCell } from "./cells";
import { updateRowField } from "@/actions/collections";

// inside TableCell:
{renderCell(f, row.data[f.id] ?? null, async (v) => {
  const result = await updateRowField({ rowId: row.id, fieldId: f.id, value: v });
  if (!result.ok) toast.error(result.error.message);
  setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, data: { ...r.data, [f.id]: v } } : r));
})}
```

- [ ] **Step 8: Manual verify**

```bash
pnpm dev
```

Sign in, click "+ New page" → Blank collection. The collection page loads. Click "Add field" (prompt-based for now), enter a name and type. Click "Add row". Click cells to edit. Verify saves work. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/collection/cells apps/web/components/collection/CollectionListView.tsx
git commit -m "feat(collection): type-aware cell components with inline edit"
```

---

### Task 16: Sort + Filter UI (popovers)

**Files:**
- Create: `apps/web/components/collection/SortPopover.tsx`
- Create: `apps/web/components/collection/FilterPopover.tsx`
- Modify: `apps/web/components/collection/CollectionListView.tsx`

- [ ] **Step 1: Write SortPopover**

```tsx
// apps/web/components/collection/SortPopover.tsx
"use client";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group";
import type { Field, Sort } from "@/lib/collections/types";

export function SortPopover({
  fields, value, onChange, children,
}: {
  fields: Field[];
  value: Sort[];
  onChange: (next: Sort[]) => void;
  children: React.ReactNode;
}) {
  const current = value[0] ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
          <Select
            value={current?.fieldId ?? ""}
            onValueChange={(fid) => onChange(fid ? [{ fieldId: fid, direction: current?.direction ?? "asc" }] : [])}
          >
            <SelectTrigger><SelectValue placeholder="Pick a field" /></SelectTrigger>
            <SelectContent>
              {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {current && (
            <ToggleGroup
              type="single"
              value={current.direction}
              onValueChange={(d) => d && onChange([{ ...current, direction: d as "asc"|"desc" }])}
            >
              <ToggleGroupItem value="asc">Ascending</ToggleGroupItem>
              <ToggleGroupItem value="desc">Descending</ToggleGroupItem>
            </ToggleGroup>
          )}
          {current && (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>Clear sort</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Write FilterPopover**

```tsx
// apps/web/components/collection/FilterPopover.tsx
"use client";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Trash2 } from "lucide-react";
import type { Field, Filter, FilterOperator } from "@/lib/collections/types";

const OPS_FOR_TYPE: Record<string, FilterOperator[]> = {
  text: ["eq","neq","contains","starts_with","is_empty","is_not_empty"],
  number: ["eq","neq","gt","gte","lt","lte","is_empty","is_not_empty"],
  currency: ["gt","gte","lt","lte","is_empty","is_not_empty"],
  date: ["eq","gt","gte","lt","lte","is_empty","is_not_empty"],
  datetime: ["eq","gt","gte","lt","lte","is_empty","is_not_empty"],
  select: ["eq","neq","is_empty","is_not_empty"],
  multi_select: ["in","not_in","is_empty","is_not_empty"],
  checkbox: ["eq"],
};

export function FilterPopover({
  fields, value, onChange, children,
}: {
  fields: Field[];
  value: Filter[];
  onChange: (next: Filter[]) => void;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Filter[]>(value);

  function setField(idx: number, fieldId: string) {
    const next = [...draft];
    next[idx] = { ...next[idx], fieldId, operator: OPS_FOR_TYPE[fields.find((f) => f.id === fieldId)?.type ?? "text"][0] };
    setDraft(next);
  }
  function setOp(idx: number, op: FilterOperator) {
    const next = [...draft]; next[idx] = { ...next[idx], operator: op }; setDraft(next);
  }
  function setValue(idx: number, v: string) {
    const next = [...draft]; next[idx] = { ...next[idx], value: v }; setDraft(next);
  }
  function add() {
    setDraft([...draft, { fieldId: fields[0]?.id ?? "", operator: "eq", value: "" }]);
  }
  function remove(idx: number) {
    setDraft(draft.filter((_, i) => i !== idx));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[28rem]">
        <div className="space-y-2">
          {draft.map((f, idx) => {
            const field = fields.find((x) => x.id === f.fieldId);
            const ops = OPS_FOR_TYPE[field?.type ?? "text"];
            const needsValue = !["is_empty","is_not_empty"].includes(f.operator);
            return (
              <div key={idx} className="flex items-center gap-2">
                <Select value={f.fieldId} onValueChange={(v) => setField(idx, v)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {fields.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={f.operator} onValueChange={(v) => setOp(idx, v as FilterOperator)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ops.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                {needsValue && (
                  <Input value={(f.value as string) ?? ""} onChange={(e) => setValue(idx, e.target.value)} />
                )}
                <Button variant="ghost" size="icon" onClick={() => remove(idx)}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <div className="flex justify-between">
            <Button size="sm" variant="ghost" onClick={add}>+ Add filter</Button>
            <Button size="sm" onClick={() => onChange(draft)}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Wire popovers into CollectionListView**

Replace the placeholder buttons in `CollectionListView.tsx`:

```tsx
import { SortPopover } from "./SortPopover";
import { FilterPopover } from "./FilterPopover";
import { updateView } from "@/actions/views";

// Replace CollectionHeader props for sort/filter:
<CollectionHeader
  title={page.title}
  emoji={page.emoji}
  onOpenFilters={() => {}}
  onOpenSort={() => {}}
/>

// Above the table, render:
<div className="flex gap-2 mb-3">
  <SortPopover
    fields={collection.fields}
    value={view.config.sort ?? []}
    onChange={(next) => updateView({ viewId: view.id, config: { sort: next } })}
  >
    <Button variant="outline" size="sm">Sort</Button>
  </SortPopover>
  <FilterPopover
    fields={collection.fields}
    value={view.config.filters ?? []}
    onChange={(next) => updateView({ viewId: view.id, config: { filters: next } })}
  >
    <Button variant="outline" size="sm">Filter</Button>
  </FilterPopover>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/collection
git commit -m "feat(collection): sort and filter popovers persisted via view config"
```

---

### Task 17: AddFieldButton (replace prompt-based UX)

**Files:**
- Create: `apps/web/components/collection/AddFieldButton.tsx`
- Modify: `apps/web/components/collection/CollectionListView.tsx`

- [ ] **Step 1: Write AddFieldButton with a Sheet**

```tsx
// apps/web/components/collection/AddFieldButton.tsx
"use client";
import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addField } from "@/actions/collections";
import type { FieldType } from "@/lib/collections/types";

const TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
  { value: "checkbox", label: "Checkbox" },
];

export function AddFieldButton({ collectionId }: { collectionId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await addField({ collectionId, name: name.trim(), type });
      if (!result.ok) { toast.error(result.error.message); return; }
      setOpen(false);
      setName("");
      setType("text");
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus data-icon="inline-start" />
          Add field
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>Add field</SheetTitle></SheetHeader>
        <div className="py-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="field-name">Name</FieldLabel>
              <Input id="field-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button onClick={submit} disabled={isPending || !name.trim()}>
            {isPending ? "Adding…" : "Add field"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Wire into CollectionListView**

Replace the `handleAddField` `window.prompt(...)` body and the inline button with:

```tsx
import { AddFieldButton } from "./AddFieldButton";

// In the header row:
<TableHead>
  <AddFieldButton collectionId={collection.id} />
</TableHead>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/collection/AddFieldButton.tsx apps/web/components/collection/CollectionListView.tsx
git commit -m "feat(collection): AddFieldButton sheet replaces prompt"
```

---

### Task 18: FieldHeader with sort indicator + menu

**Files:**
- Create: `apps/web/components/collection/FieldHeader.tsx`
- Modify: `apps/web/components/collection/CollectionListView.tsx`

- [ ] **Step 1: Write**

```tsx
// apps/web/components/collection/FieldHeader.tsx
"use client";
import { ArrowUp, ArrowDown, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu";
import { toast } from "sonner";
import { renameField, deleteField } from "@/actions/collections";
import type { Field } from "@/lib/collections/types";

export function FieldHeader({
  field, sortDir, onClickSort,
}: {
  field: Field;
  sortDir: "asc" | "desc" | null;
  onClickSort: () => void;
}) {
  return (
    <div className="flex items-center gap-1 group">
      <button
        className="flex items-center gap-1 text-left"
        onClick={onClickSort}
        type="button"
      >
        <span className="font-medium text-sm">{field.name}</span>
        {sortDir === "asc" && <ArrowUp className="size-3" />}
        {sortDir === "desc" && <ArrowDown className="size-3" />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={field.is_system}
            onClick={async () => {
              const name = window.prompt("Rename field", field.name);
              if (!name) return;
              const result = await renameField({ fieldId: field.id, name });
              if (!result.ok) toast.error(result.error.message);
            }}
          >
            <Pencil data-icon="inline-start" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={field.is_system}
            onClick={async () => {
              if (!window.confirm(`Delete "${field.name}" and all its data?`)) return;
              const result = await deleteField({ fieldId: field.id });
              if (!result.ok) toast.error(result.error.message);
            }}
          >
            <Trash2 data-icon="inline-start" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Wire into CollectionListView**

Replace `<TableHead key={f.id}>{f.name}</TableHead>` with:

```tsx
<TableHead key={f.id}>
  <FieldHeader
    field={f}
    sortDir={view.config.sort?.find((s) => s.fieldId === f.id)?.direction ?? null}
    onClickSort={() => {
      const cur = view.config.sort?.find((s) => s.fieldId === f.id);
      const nextDir: "asc" | "desc" | null = !cur ? "asc" : cur.direction === "asc" ? "desc" : null;
      const next = nextDir === null ? [] : [{ fieldId: f.id, direction: nextDir }];
      updateView({ viewId: view.id, config: { sort: next } });
    }}
  />
</TableHead>
```

Add the import:
```tsx
import { FieldHeader } from "./FieldHeader";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/collection
git commit -m "feat(collection): FieldHeader with sort indicator and rename/delete menu"
```

---

### Task 19: Page header with title editing + emoji slot

**Files:**
- Create: `apps/web/components/pages/PageHeader.tsx`
- Modify: dashboard and collection pages to use it

- [ ] **Step 1: Write PageHeader**

```tsx
// apps/web/components/pages/PageHeader.tsx
"use client";
import { useState, useTransition } from "react";
import { renamePage } from "@/actions/pages";
import { toast } from "sonner";

export function PageHeader({
  pageId, initialTitle, emoji,
}: {
  pageId: string;
  initialTitle: string;
  emoji: string | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  function commit() {
    setEditing(false);
    if (title !== initialTitle) {
      startTransition(async () => {
        const result = await renamePage({ pageId, title });
        if (!result.ok) toast.error(result.error.message);
      });
    }
  }

  return (
    <div className="flex items-center gap-2 mb-6">
      {emoji && <span className="text-3xl">{emoji}</span>}
      {editing ? (
        <input
          autoFocus
          className="text-3xl font-semibold bg-transparent border-b focus:outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="text-3xl font-semibold">
          {title}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use in dashboard and collection pages**

In `apps/web/app/(app)/p/[pageId]/page.tsx`:
```tsx
import { PageHeader } from "@/components/pages/PageHeader";

// replace the inline <h1> with:
<PageHeader pageId={page.id} initialTitle={page.title} emoji={page.emoji} />
```

In `CollectionListView.tsx`, replace the inline title in `CollectionHeader`. Pass through the `pageId` so the rename works:

```tsx
// CollectionHeader becomes:
<div className="flex items-center justify-between gap-4 border-b pb-4 mb-4">
  <PageHeader pageId={page.id} initialTitle={page.title} emoji={page.emoji} />
  <div className="flex items-center gap-2">
    {/* sort + filter buttons stay here */}
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/pages apps/web/app apps/web/components/collection
git commit -m "feat(web): PageHeader with inline title edit"
```

---

### Task 20: Authenticated home — redirect to most-recent page

**Files:**
- Modify: `apps/web/app/(app)/page.tsx`

- [ ] **Step 1: Update the home page to redirect or show empty state**

```tsx
// apps/web/app/(app)/page.tsx
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: pages } = await supabase
    .from("pages")
    .select("id, page_type")
    .eq("owner_type", "user")
    .eq("owner_id", user!.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (pages && pages[0]) {
    const p = pages[0];
    redirect(p.page_type === "dashboard" ? `/p/${p.id}` : `/c/${p.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Backdesk</CardTitle>
          <CardDescription>
            Pages are how you organize your work. Use <strong>+ New page</strong> in the sidebar to create
            a dashboard or a collection.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Once you create a page, you'll land on it next time you sign in.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/page.tsx
git commit -m "feat(web): home redirects to most-recent page or shows empty state"
```

---

### Task 21: E2E — create dashboard, create collection, add field, add row

**Files:**
- Create: `tests/e2e/pages.spec.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/e2e/pages.spec.ts
import { test, expect } from "@playwright/test";

async function signUp(page: any) {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);
}

test("create blank dashboard and rename", async ({ page }) => {
  await signUp(page);
  await page.click("button:has-text('New page')");
  await page.click("text=Blank dashboard");
  await page.waitForURL(/\/p\//);
  await expect(page.getByRole("heading", { name: "Untitled" })).toBeVisible();

  await page.click("text=Untitled");
  await page.fill("input", "My dashboard");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "My dashboard" })).toBeVisible();
});

test("create collection, add a field, add a row", async ({ page }) => {
  await signUp(page);
  await page.click("button:has-text('New page')");
  await page.click("text=Blank collection");
  await page.waitForURL(/\/c\//);

  // Add a text field via sheet
  await page.click("button:has-text('Add field')");
  await page.fill("input#field-name", "Name");
  await page.click("button:has-text('Add field')").last();

  // Add row
  await page.click("button:has-text('Add row')");
  // Expect a row with our field cell
  await expect(page.locator("table tbody tr").first()).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

In one terminal:
```bash
supabase start
```

In another:
```bash
pnpm test:e2e
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/pages.spec.ts
git commit -m "test(e2e): create pages and edit a collection"
```

---

### Task 22: Push and verify CI

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Watch CI**

```bash
gh run watch --repo Buddalish/backdesk
```

Expected: green.

---

## Plan 2 — Done. What you have now

- Page CRUD with sidebar drag-to-reorder
- Two page types: dashboard (placeholder body) and collection (full list view)
- Collections with: schema CRUD (typed fields), inline-edit rows, sort, filter, delete
- Soft delete on pages and collections
- E2E tests for creating dashboards and editing collections

## Pre-execution refinement notes (read before Plan 3)

After executing Plan 2, before starting Plan 3:
1. Verify the `Collection` class works correctly with non-trivial filters/sorts (manually try a filtered+sorted view; check the rendered data is correct).
2. If you noticed list view performance issues at >500 rows, plan to add pagination or row virtualization in Plan 3.
3. Re-read [Plan 3 file](./2026-04-28-backdesk-3-block-editor.md). Plan 3 builds on the `Collection.aggregate()` method (added in Plan 3) — confirm the interface in `lib/collections/collection.ts` matches what Plan 3 expects.
4. Confirm shadcn `@plate` registry is reachable from the project: `pnpm dlx shadcn@latest search @plate -q "editor" -l 5` should list items.
