# Backdesk — v1 design

**Date:** 2026-04-28
**Status:** Draft for review
**Scope:** v1 product specification

---

## 1. Overview

**Backdesk** is a workspace for working with structured data. Pages are either **dashboards** (a Notion-style block document) or **collections** (a typed table with a list view). Dashboards contain blocks that can read from collections. Collections are populated by user input or by **connections** (importers that bring in external data).

v1 ships with one connection — Interactive Brokers Activity Statement import — and three opinionated **templates** (Performance Dashboard, Daily Journal, Weekly Review). The first vertical is a personal trading journal, but the product itself is generic: the only trading-specific code in v1 is the IBKR parser, the round-trip aggregation pipeline, and three template files.

### Goals

- Ship a usable, opinionated trading journal as the first vertical
- Build it on top of generic primitives that scale to other verticals (sales pipelines, content calendars, expense trackers, etc.) without rewrites
- Multi-tenant SaaS-ready from day one (auth + RLS), but billing and marketing site are deferred to follow-up specs
- Lightning-fast UX: target Lighthouse Performance ≥ 90 on dashboard pages

### Non-goals (v1)

- Billing, plans, dunning
- Marketing site beyond a placeholder landing page
- Multiplayer / real-time collaboration on the same page
- Mobile editing (read-only on phones; full editor on tablet+)
- Multiple connections (only IBKR)
- User-defined relations between collections, formula fields, kanban/calendar views
- Public sharing of pages
- Email notifications

### Out-of-scope items deferred to v2 or later

| Feature | Why deferred |
|---|---|
| Auth/billing/marketing-site polish | Each becomes its own spec |
| Additional connections (Schwab, Plaid, generic CSV with column mapping) | One importer is enough to validate the model |
| Multiple views per collection (kanban, calendar) | The schema models this; the UI ships in v2 |
| Inter-collection relations | Significant scope; not required for trading |
| Computed collections as a user-facing concept | The pipeline mechanism exists internally as the Fills→Trades aggregator; user-facing exposure is v2 |
| Cmd+K full-text content search | v1 indexes pages by title only |
| Universal undo across page types | v1 relies on per-page undo |
| Per-user audit log | Compliance feature, not a v1 need |
| Background jobs for very large imports (>10k fills) | v1 imports are synchronous |
| 2FA / MFA | Supabase supports it; UI/flow is v2 |

---

## 2. Long-term vision and architectural seams

The product story is **Backdesk: workspace for your data.** Trading is the first vertical, not the product.

To honor that without building a generic platform from scratch, v1 makes these architectural commitments:

| Seam | Implementation in v1 | What it unlocks for v2+ |
|---|---|---|
| **Pages have a type** (`dashboard` or `collection`) | Discriminated `pages` table | New page types (kanban, calendar, etc.) slot in |
| **Collections are first-class** (schema + rows in generic tables) | Trading uses the same primitive as user-created collections | Users define their own collections from day one in v1 |
| **Blocks query through a `Collection` interface** | `collection.aggregate(...)`, `collection.list(...)` — blocks never reference table names | New collection sources (computed, federated) work without changing blocks |
| **Importers are pluggable (`Connection` interface)** | One connection (IBKR) in v1 | More connections in v2; UI doesn't change |
| **Templates are pluggable** | Three template JSON files for trading | More templates per vertical |
| **Aggregation is a named pipeline** | One pipeline (Fills → Trades) in v1 | Other pipelines (transactions → categorized expenses) in v2 |
| **No trading-specific UI primitives** | Card / Chart / Table / Row blocks are generic; "Row" block embeds any collection row, including trades | Domain-specific blocks live in `blocks/domain/<vertical>/` and are pluggable |

The user-visible v1 surface is unambiguously a workspace tool with one trading integration. Internally, every concept generalizes.

---

## 3. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Next.js client (React + shadcn + Plate.js)          │    │
│  │  • Sidebar (pages, settings, Cmd+K palette)         │    │
│  │  • Dashboard page: Plate editor with custom blocks  │    │
│  │  • Collection page: typed list view                 │    │
│  │  • Custom blocks: Card, Chart, Table, Row           │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│  Vercel (Next.js server, App Router)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Server Components (read data via Supabase client)   │    │
│  │ Server Actions (CSV upload, page CRUD, block save,  │    │
│  │   collection CRUD, settings updates)                │    │
│  │ Middleware (refresh session, redirect on auth)      │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Supabase JS SDK (anon + service role)
                       │ Pooler URL (?pgbouncer=true)
┌──────────────────────▼──────────────────────────────────────┐
│  Supabase (same region as Vercel deployment)                │
│   • Postgres — pages, collections, fields, rows, etc.       │
│   • Auth — email/password + Google OAuth, session mgmt      │
│   • Storage — screenshot + avatar uploads                   │
│   • Row-Level Security — user_id = auth.uid() everywhere    │
│   • Materialized views — equity_curve, pnl_by_symbol, ...   │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural choices:**

- **Server Components do reads, Server Actions do writes.** No API routes for normal app traffic; route handlers only used for the OAuth callback.
- **RLS is the security boundary.** Every user-data table enforces `user_id = auth.uid()`. Forgetting a `where` clause cannot leak data.
- **CSV import runs synchronously in a Server Action.** v1 imports are bounded (≤10k fills) and finish in seconds. Background queue is a v2 concern.
- **No client-side state management library.** Server Components own server state; React `useState` owns ephemeral UI state.

---

## 4. Data model

### Ownership model

Every content table uses an `owner_id` + `owner_type` pair instead of a bare `user_id`:
- v1: `owner_type` is always `'user'`; `owner_id` is `auth.uid()`
- v2 (teams): `owner_type` can be `'workspace'`; `owner_id` becomes a `workspace_id`

This forward-compatible naming avoids a column rename when teams arrive. RLS in v1 reads: `owner_type = 'user' AND owner_id = auth.uid()`.

`profiles` keeps a `user_id` column because it's per-account data (theme, timezone) and never workspace-scoped.

### Schema

```sql
-- Auth
auth.users                       -- managed by Supabase Auth

profiles                         -- per-account data, never workspace-scoped
  user_id UUID PK FK→auth.users ON DELETE CASCADE
  display_name TEXT
  avatar_path TEXT               -- supabase storage path
  timezone TEXT                  -- IANA tz, e.g. 'America/New_York'; default = browser tz at signup
  theme_mode TEXT                -- 'light' | 'dark' | 'system'
  theme_accent TEXT              -- 'default' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet'
  created_at TIMESTAMPTZ

-- Pages and content
pages
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL         -- = auth.uid() in v1
  title TEXT
  emoji TEXT                     -- nullable; user-picked
  page_type TEXT                 -- 'dashboard' | 'collection'
  document JSONB                 -- Plate document; null for collections
  collection_id UUID FK→collections ON DELETE CASCADE NULLABLE
  sort_index INT
  deleted_at TIMESTAMPTZ         -- soft delete; queries filter WHERE deleted_at IS NULL
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ         -- bumped on every save (used for optimistic concurrency)
  CONSTRAINT pages_type_check CHECK (
    (page_type = 'dashboard' AND document IS NOT NULL AND collection_id IS NULL) OR
    (page_type = 'collection' AND document IS NULL AND collection_id IS NOT NULL)
  )

-- Generic collections
collections
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL
  name TEXT
  is_system BOOLEAN              -- true for connection-managed (Fills, Trades)
  managed_by_connection TEXT     -- 'ibkr' | NULL — which connection owns this
  deleted_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

collection_fields
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL         -- denormalized for RLS speed
  collection_id UUID FK→collections ON DELETE CASCADE
  name TEXT
  type TEXT                      -- see "Field types" below
  options JSONB                  -- for select types: [{ value, label, color }]
  config JSONB                   -- type-specific config (number precision, date format, ...)
  is_system BOOLEAN              -- true if connection-managed; user can't rename/delete
  sort_index INT
  created_at TIMESTAMPTZ

collection_rows
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL
  collection_id UUID FK→collections ON DELETE CASCADE
  data JSONB                     -- { fieldId: value, ... } — value shape depends on field type
  source TEXT                    -- 'user' | 'connection:ibkr'
  source_external_id TEXT        -- e.g., IBKR TradeID; null for user rows
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE (owner_type, owner_id, collection_id, source_external_id)
                                 -- enforces dedup for connection-imported rows

-- Saved views (single 'list' view per collection in v1; schema supports more)
collection_views
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL
  collection_id UUID FK→collections ON DELETE CASCADE
  name TEXT
  type TEXT                      -- 'list' (v1 only)
  config JSONB                   -- { sort: [...], filters: [...], visibleFields: [...] }
  is_default BOOLEAN
  sort_index INT
  created_at TIMESTAMPTZ

-- Connection import audit
connection_imports
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL
  connection TEXT                -- 'ibkr-activity-statement'
  filename TEXT
  imported_at TIMESTAMPTZ
  rows_added INT
  rows_skipped_duplicate INT
  rows_skipped_unsupported INT   -- e.g., non-stock IBKR fills
  pipeline_rows_created INT      -- e.g., trades created from fills
  pipeline_rows_updated INT
  status TEXT                    -- 'parsed' | 'failed' | 'partial'
  error_message TEXT             -- null on success

-- Storage references attached to any collection row
attachments
  id UUID PK
  owner_type TEXT NOT NULL DEFAULT 'user'
  owner_id UUID NOT NULL
  collection_id UUID FK→collections ON DELETE CASCADE
  row_id UUID FK→collection_rows ON DELETE CASCADE
  storage_path TEXT
  caption TEXT
  uploaded_at TIMESTAMPTZ
```

### Field types

| Type | Stored shape in `collection_rows.data[fieldId]` | Notes |
|---|---|---|
| `text` | string | |
| `number` | number | `config.precision`, `config.format` ('decimal' \| 'percent') |
| `currency` | `{ amount: number, currency_code: string }` | **Multi-currency-aware.** Each row holds its own currency. Aggregations group by `currency_code` in v1; FX conversion is a v2 feature. |
| `date` | ISO date string `YYYY-MM-DD` | |
| `datetime` | ISO timestamp (UTC) | Always stored as UTC; rendered in user's timezone |
| `select` | string (option value) | `options` defines the choice list |
| `multi_select` | string[] | |
| `checkbox` | boolean | |

### Notes on the data model

- **Pages own their content.** Dashboard pages store the Plate document as `pages.document`. Collection pages reference a `collections` row.
- **Collections are universal.** The IBKR-created `Fills` and `Trades` collections are rows in `collections` with `is_system=true` and `managed_by_connection='ibkr'`. They share the same primitive as user-created collections.
- **System fields are protected.** Fields with `is_system=true` cannot be renamed or deleted by the user; they can hide them via `collection_views.config.visibleFields`. Users *can* add their own fields to system collections (e.g., a "Setup" select column on `Trades`); these survive re-imports.
- **JSONB row data with indexes.** v1 volume (thousands of rows per owner) handles fine with direct queries. Expression indexes on hot fields (`((data->>'symbol'))`) added per-collection as needed.
- **Soft delete.** `pages` and `collections` have `deleted_at`; standard queries filter `WHERE deleted_at IS NULL`. Trash/Restore UI is v2.
- **Saved views are first-class.** Every collection has at least one `collection_views` row (the default list view). v1 ships only `type='list'` but the data model supports kanban / calendar in v2 with no migration.
- **Attachments are generic.** Not modeled as a trading-specific table; any collection row can have attachments.
- **Optimistic concurrency.** `pages.updated_at` is included in save requests; the server rejects writes whose `updated_at` doesn't match the current DB value. Prevents lost edits when the same page is open in multiple tabs.

### Performance approach (no materialized views in v1)

v1 ships **no materialized views**. Direct queries against `collection_rows` with proper indexes are sub-50ms at the volumes we expect (a year of trades = ~thousands of rows). Materialized views were a hedge that adds complexity (refresh failure modes, stale data after import) without proven need. We add them post-launch only if metrics show they're required.

---

## 5. Authentication & Row-Level Security

### Routes

```
app/
├── (marketing)/              -- public, no auth (placeholder landing)
│   └── page.tsx
├── (auth)/
│   ├── sign-in/page.tsx
│   ├── sign-up/page.tsx
│   ├── reset-password/page.tsx
│   └── callback/route.ts     -- OAuth callback handler
├── (app)/                    -- middleware enforces session
│   ├── layout.tsx            -- AppShell: sidebar + page area
│   ├── page.tsx              -- redirects to most-recent page or /onboarding empty state
│   ├── p/[pageId]/page.tsx   -- dashboard view (Plate editor)
│   ├── c/[pageId]/page.tsx   -- collection view (list)
│   ├── settings/
│   │   ├── account/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── appearance/page.tsx
│   │   └── connections/page.tsx
│   └── (no api routes — Server Actions for everything except OAuth callback)
middleware.ts                 -- session refresh + auth gate
```

### Three Supabase clients

| Client | Where | Key | Permissions |
|---|---|---|---|
| Browser client | Client Components | anon | RLS-bound to `auth.uid()` |
| Server client | Server Components, Server Actions | anon + cookies | RLS-bound to user's session |
| Admin client | Server Actions in `actions/admin/` only | **service role** (bypasses RLS) | Used for: account deletion, seed reset |

The service role key lives in `SUPABASE_SERVICE_ROLE_KEY` env var (server-only). A lint rule and folder convention prevent the admin client from being imported into client code.

### Middleware

`middleware.ts` runs on every request:
- Refreshes the Supabase session if it's about to expire
- Routes under `(app)/...` without a session → redirect to `/sign-in`
- Routes under `(auth)/...` with a valid session → redirect to `/`

### RLS policies

For every owned content table:

```sql
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY pages_owner ON pages FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());
```

Same pattern, repeated for: `pages`, `collections`, `collection_fields`, `collection_rows`, `collection_views`, `connection_imports`, `attachments`.

`profiles` uses a slightly different policy (it's per-account, not workspace-scoped):
```sql
CREATE POLICY profiles_self ON profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

When teams ship in v2, the policy on owned content tables extends to:
```sql
USING (
  (owner_type = 'user' AND owner_id = auth.uid()) OR
  (owner_type = 'workspace' AND owner_id IN (
    SELECT workspace_id FROM memberships WHERE user_id = auth.uid()
  ))
)
```
No column rename required.

### Storage RLS

Two private buckets:
- `attachments` — path convention: `{user_id}/{collection_id}/{row_id}/{filename}`
- `avatars` — path convention: `{user_id}/{filename}`

Storage policies allow read/write only on paths starting with the user's `auth.uid()`.

---

## 6. CSV import + round-trip aggregation

### Part A — Parsing the IBKR Activity Statement CSV

The Activity Statement is a multi-section CSV (Trades, Open Positions, Cash, Fees, Dividends, etc.). Each section starts with `<Section>,Header,...` and is followed by `<Section>,Data,...` rows.

**Timezone:** IBKR Activity Statement datetimes are in the account's configured timezone. The IBKR connection has a `sourceTimezone` config (default `America/New_York`) that the parser uses to interpret incoming timestamps. All timestamps are stored in UTC (`TIMESTAMPTZ`) in `collection_rows.data`. Display widgets convert to `profiles.timezone` on render.

**Parser steps:**

1. Read with `papaparse`, no header row.
2. Walk rows top-to-bottom. When `Trades,Header,DataDiscriminator,Asset Category,...` appears, capture the column index map.
3. For each `Trades,Data,Execution,Stocks,...` row, extract: `TradeID`, `Symbol`, `Date/Time`, `Quantity`, `T. Price`, `Comm/Fee`, `Currency`.
4. Skip `SubTotal`, `Total`, and `Order` rows (we want individual executions, not parent orders).
5. Stop reading Trades when a non-Trades section header appears.
6. Map `Quantity > 0 → BUY`, `Quantity < 0 → SELL`. Store absolute value as `quantity`.
7. Parse `Date/Time` ("2025-04-15, 09:32:14") in the connection's `sourceTimezone`, convert to UTC, store as ISO string.
8. Preserve the IBKR `Currency` field per-fill — non-USD fills are first-class in v1.
9. Return an array of normalized fill records ready for insertion.

**Dedup:** `INSERT ... ON CONFLICT (owner_type, owner_id, collection_id, source_external_id) DO NOTHING`. Re-importing the same statement adds zero new rows.

**Failure modes:**
- Wrong file (no Trades section) → `{ ok: false, error: { code: 'NO_TRADES_SECTION', message: ... } }`
- Missing required columns → error message lists them
- Date format mismatch (IBKR uses `"2025-04-15, 09:32:14"`) → strict parse, fail loudly
- Non-stock asset categories → silently skipped; recorded as `rows_skipped_unsupported` in import audit

### Part B — Aggregating fills into round-trip trades

**Definition:** a *trade* = one round trip on a symbol, from flat → flat.

**Per symbol, fills in chronological order:**

```
position = 0
current_trade = null

for fill in fills_for_symbol:
    if abs(position) < EPSILON:
        // open a new trade
        current_trade = new Trade(
            side = LONG if fill.side == BUY else SHORT,
            opened_at = fill.executed_at,
            fills = [fill],
        )
        position = signed_qty(fill)

    elif same_direction(position, fill):
        // scaling in
        current_trade.fills.append(fill)
        position += signed_qty(fill)

    else:
        new_position = position + signed_qty(fill)

        if abs(new_position) < EPSILON:
            // exact close
            current_trade.fills.append(fill)
            close_trade(current_trade, closed_at=fill.executed_at)
            position = 0

        elif sign(new_position) == sign(position):
            // partial close, still in same direction
            current_trade.fills.append(fill)
            position = new_position

        else:
            // FLIP: close at the qty that flattens, open new trade with leftover
            closing_qty = abs(position)
            leftover_qty = abs(new_position)
            split_a, split_b = split_fill(fill, closing_qty, leftover_qty)
            current_trade.fills.append(split_a)
            close_trade(current_trade, closed_at=fill.executed_at)
            current_trade = new Trade(
                side = LONG if split_b.side == BUY else SHORT,
                opened_at = fill.executed_at,
                fills = [split_b],
            )
            position = signed_qty(split_b)
```

`EPSILON = 1e-6` to absorb fractional-share rounding noise.

### P&L math (weighted average)

When a trade closes:
- `avg_entry_price` = Σ(qty × price) over opening-direction fills / Σ(qty)
- `avg_exit_price` = Σ(qty × price) over closing-direction fills / Σ(qty)
- `total_quantity` = Σ(opening qty) (= Σ(closing qty))
- `gross_pnl` = (avg_exit − avg_entry) × total_quantity × (1 if LONG else −1)
- `fees` = sum of fee fields across all fills
- `net_pnl` = gross_pnl − fees

> Weighted average is the right choice for performance review. FIFO matters for taxes and is out of scope for v1. The math layer is isolated in `lib/trades/metrics.ts` so swapping it out is a one-file change.

### Aggregator output → collection rows

The aggregator writes rows to the `Trades` collection (a `collection_rows` row per trade). System-managed fields written by the aggregator:
- `symbol`, `side`, `opened_at`, `closed_at`, `hold_duration_seconds`
- `total_quantity`, `avg_entry_price` (currency field), `avg_exit_price` (currency field)
- `gross_pnl` (currency field), `fees` (currency field), `net_pnl` (currency field)
- `currency_code` (for filtering/grouping)

All currency-valued fields use the `currency` field type — `{ amount, currency_code }`. The currency comes from the underlying fills (IBKR provides it per-execution). Mixed-currency aggregations group by `currency_code`.

**Stable identity for upsert** (implementation detail, lives in `lib/connections/ibkr-activity-statement/aggregator.ts` — not a generic concept):
`(owner_type, owner_id, symbol, opened_at, side, opening_fill_id)` where `opening_fill_id` is the `source_external_id` of the first fill in the round-trip. The `opening_fill_id` tiebreaker prevents collisions on coincident timestamps (rare but possible with multi-fill orders). User-added fields on the `Trades` collection are preserved across re-aggregation because the upsert only writes to system field IDs.

### When aggregation runs

- Inside the IBKR import Server Action, scoped to the symbols that received new fills
- Manually via Settings → Connections → "Rebuild Trades" — recomputes from scratch using all `Fills`

---

## 7. Block system (Plate.js)

### Editor stack

- Core: `platejs` (Slate-based)
- Components: shadcn `@plate` registry
  - `@plate/editor`, `@plate/editor-kit`
  - `@plate/basic-blocks-kit` — paragraph, heading, list, quote, code
  - `@plate/slash-kit`, `@plate/slash-node` — `/` insert menu
  - `@plate/block-context-menu` — right-click on blocks
  - `@plate/insert-toolbar-button`, `@plate/turn-into-toolbar-button`
- Plus a custom image plugin uploading to Supabase storage (`attachments` bucket)

### Block types

| Block | Source | Stored props |
|---|---|---|
| Paragraph, heading, list, quote, code | `@plate/basic-blocks-kit` | text content (Slate-native) |
| Image | custom Plate plugin | `{ storagePath, caption }` |
| **Card** | custom Plate plugin | `{ collectionId, metric, dateRange, format }` |
| **Chart** | custom Plate plugin | `{ collectionId, chartType, dataSource, filters }` |
| **Table** | custom Plate plugin | `{ collectionId, viewId? OR { sort, filters, visibleFields, pageSize } }` |
| **Row** | custom Plate plugin | `{ collectionId, rowId }` — embeds one collection row's fields inline (replaces what would have been a "Trade" block; works for any collection) |

**No block type is trading-specific.** All four data-aware blocks reference a collection by ID. The Trade-detail UX comes from the `Row` block pointed at a row in the `Trades` collection.

### Custom block render pattern

```tsx
// components/editor/blocks/CardBlock.tsx
export const CardBlockElement = withRef<typeof PlateElement>(({ children, ...props }, ref) => {
  const { collectionId, metric, dateRange, format } = props.element as CardBlockProps;
  const { data, isLoading } = useMetric(collectionId, metric, dateRange);
  return (
    <PlateElement ref={ref} {...props}>
      <Card>
        <CardHeader>
          <CardDescription>{METRIC_LABELS[metric]}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-8 w-24" /> : <MetricValue value={data} format={format} />}
        </CardContent>
      </Card>
      <BlockConfigButton block={props.element} />
    </PlateElement>
  );
});
```

- **Data hooks** (`useMetric`, `useChartData`, `useTableRows`, `useRowDetail`) call the typed `Collection` interface (next section).
- **Configuration**: clicking `⚙` opens a shadcn `Sheet` with form fields specific to the block type. Save → updates the block's props → page document gets persisted.
- **Persistence**: Plate's `onChange` debounced 500ms → Server Action writes the entire `value` (Plate document) JSONB to the page row. Save payload includes `pages.updated_at` for optimistic concurrency — server rejects if it doesn't match (handles multi-tab editing).
- **Save-race protection**: any pending debounced save is force-flushed on `beforeunload` (browser close/refresh) and on Next.js route changes (`router.events`). No edits are lost when the user navigates mid-debounce.
- **Slash menu**: extends `@plate/slash-kit` with `/card`, `/chart`, `/table`, `/row`.
- **Universal `+` insert**: enabled via Plate's hover-add affordance on every block.

### The `Collection` interface (the seam that prevents trading-specific coupling)

```ts
// lib/collections/collection.ts
interface Collection {
  id: string;
  name: string;
  fields: CollectionField[];
  list(opts: { filters?: Filter[]; sort?: Sort[]; limit?: number; offset?: number }): Promise<Row[]>;
  count(opts: { filters?: Filter[] }): Promise<number>;
  aggregate(opts: { metric: MetricSpec; filters?: Filter[]; groupBy?: string[] }): Promise<AggregateResult>;
  getRow(rowId: string): Promise<Row | null>;
}
```

`Card`, `Chart`, `Table`, `Row` blocks talk to this interface. The implementation queries `collection_rows` for user collections; for the `Trades` collection it delegates to the materialized views for `aggregate()` calls and falls back to the generic implementation for `list()` / `getRow()`. No block component imports anything trading-specific.

---

## 8. Pages: dashboards and collections

### Page lifecycle

- **Create** (`+ New page` menu): blank dashboard / blank collection / apply template / import data (creates collection(s) via a connection)
- **Rename** — inline edit of title in sidebar or page header
- **Reorder** — drag in the sidebar; `pages.sort_index` updates
- **Delete** — soft prompt; cascades to `collection_rows`/`collection_fields` (for collection pages) and detaches the page from any blocks referencing its collection (those blocks render an "unavailable" empty state)

### Dashboard pages

- Route: `/p/[pageId]`
- Renders the Plate editor on `pages.document`
- Sidebar entry: emoji + title

### Collection pages

- Route: `/c/[pageId]`
- Renders the list view (Section 9)
- Always has at least one `collection_views` row (the default list view)
- v1 surfaces only the default view; future versions add a view picker

### Templates

- Stored as JSON files in `templates/` in the repo
- Format: `{ pageType, title, emoji, document?, collection? }` — a template can be a single page (the v1 case)
- Three trading templates ship with v1:
  - `trading-performance-dashboard.json` — Plate document with KPI cards row, equity curve chart, P&L by symbol bar chart, recent trades table
  - `trading-daily-journal.json` — text-heavy template with a "Today's trades" table block
  - `trading-weekly-review.json` — text-heavy template with weekly aggregates
- Applying a template = Server Action that creates the page from the JSON, adjusting block IDs

### Connections (importers)

- Format: an object implementing the `Connection` interface (Section 12)
- v1 ships one: `ibkr-activity-statement`
- A connection knows: how to detect compatible files, how to parse them, what collections it produces, and what aggregation pipelines to run

### `+ New page` menu

A shadcn `DropdownMenu` (or `Command`-style in a `Dialog` for searchability):
- Blank dashboard
- Blank collection
- Apply template ▸ (submenu of available templates)
- Import data ▸ (submenu of available connections — just IBKR in v1)

---

## 9. Collection list view

Built on shadcn `Table`. Type-aware cell renderers based on `collection_fields.type`.

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋  Trades              [↑ Sort] [⚙ Filter]    [⬆ Import] [+ Field] │
├──────────────────────────────────────────────────────────────────────┤
│  Symbol ⇅  │ Side  │ Opened   │ Closed   │ Net P&L  │ Setup ▼  │... │
├──────────────────────────────────────────────────────────────────────┤
│  NVDA      │ LONG  │ Apr 26   │ Apr 26   │ +$842    │ breakout │... │
│  SPY       │ SHORT │ Apr 25   │ Apr 25   │ −$216    │ —        │... │
│  ...                                                                 │
├──────────────────────────────────────────────────────────────────────┤
│  + Add row                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### Type-aware cells

| Field type | Renderer | Editor |
|---|---|---|
| `text` | plain text | `Input` |
| `number` | right-aligned, `Intl.NumberFormat` | numeric `Input` |
| `currency` | right-aligned, native formatting per row's `currency_code` (`Intl.NumberFormat`) | numeric `Input` + `Select` for currency code (defaults to last-used) |
| `date` | `date-fns` formatted | `Calendar` in `Popover` |
| `datetime` | date + time | `Calendar` + time input |
| `select` | `Badge` with the option's color | `Select` |
| `multi_select` | row of `Badge`s | combobox with `Checkbox` items |
| `checkbox` | `Checkbox` | toggle on click |

### Interactions

- **Inline edit**: click cell → input/picker; blur or Enter saves (debounced 300ms)
- **Add row**: button at table bottom → blank row, focus on first editable cell
- **Add field**: `+` button on right of header → `Popover` with name + type picker
- **Field menu**: three-dot menu on each header for rename / change type / delete (greyed out for `is_system` fields)
- **Sort**: click column header → toggle asc/desc/none; persists on `collection_views.config.sort`
- **Filter**: button opens `Popover` with one filter at a time (field, operator, value); persists on `collection_views.config.filters`
- **Row detail**: click a row's leading icon → opens a `Sheet` with all fields stacked (useful when there are many columns)
- **Import**: button on collection page header opens an import `Sheet` with file upload (only enabled for collections that belong to a connection)

### Empty state

A friendly empty state with two CTAs:
- "Add your first row" (creates a blank row)
- "Import data" (only shown if a connection produces this collection)

---

## 10. Sidebar, navigation, and Cmd+K

### App shell layout

```
┌──────────────────────────────────────────────────────────────┐
│ 🟦 Backdesk                      [Search]  [⚙]  [👤]        │
├─────────┬────────────────────────────────────────────────────┤
│ Sidebar │                Page area                           │
│         │                                                    │
│ ➕ New  │  (renders dashboard or collection page)            │
│ ────── │                                                    │
│ 📊 ... │                                                    │
│ 📋 ... │                                                    │
│         │                                                    │
└─────────┴────────────────────────────────────────────────────┘
```

shadcn `Sidebar` for the left rail. Sidebar contents:

- `+ New page` button at top
- Flat list of pages (dashboards + collections), `sort_index` order, drag to reorder
- Each page entry: emoji + title
- Settings link at bottom

### Cmd+K command palette

shadcn `Command` inside a `Dialog`, opened with `⌘K` / `Ctrl+K` and clickable from the header.

**Commands (v1):**
- Jump to page (fuzzy search by title)
- Create new ▸ (dashboard / collection / from template / import)
- Open settings ▸ (account / profile / appearance / connections)
- Toggle theme (light / dark)
- Sign out

Implemented as a `useCommands()` hook returning a flat list of `{ id, label, icon, handler, group }` objects. Adding a new command = adding to the list; no new wiring.

### Page emoji picker

Click the emoji on a page (or in the sidebar) → opens a shadcn `Popover` with `emoji-mart` (or equivalent picker). Picked emoji writes to `pages.emoji`.

### Empty state for first-time user

The main content area when a user has no pages:

> **Welcome to Backdesk**
> Pages are how you organize your work. Create a dashboard for visualizations, a collection for structured data, or import data from a connection.
>
> [+ New dashboard]   [+ New collection]   [+ New page ▾]

Friendly, no forced flow. The same `+ New page` menu from the sidebar is available here.

---

## 11. Settings

Routes:
- `/settings/account`
- `/settings/profile`
- `/settings/appearance`
- `/settings/connections`

Layout: shared settings layout with a `Sidebar` (sub-navigation) on the left and the active section on the right.

### `/settings/account`

- Email (display only — change requires Supabase email-change confirmation flow)
- Change password (`supabase.auth.updateUser({ password })`)
- Sign out
- Delete account → confirmation modal → admin Server Action that calls `supabase.auth.admin.deleteUser(...)`; FK cascades wipe user data

### `/settings/profile`

- Display name
- Avatar (uploaded to `avatars/{user_id}/...`)
- **Timezone** (IANA tz picker; defaults to browser tz at signup; affects how datetime fields and time-window aggregations are rendered)

### `/settings/appearance`

- **Theme mode**: Light / Dark / System (`ToggleGroup`), persisted via `next-themes` and to `profiles.theme_mode`
- **Accent color**: 6 swatches (`default`, `blue`, `emerald`, `rose`, `amber`, `violet`), persisted to `profiles.theme_accent`
  - Implementation: `<html data-accent={accent}>`; CSS rules in the global stylesheet override `--primary`, `--ring`, `--accent` variables for each `[data-accent="..."]` selector
  - Default = `default`, which uses the `--primary` from the project's preset (`b2oWqHU1I`); other accents override `--primary`/`--ring`/`--accent` only
- **Theme preset**: only one preset in v1 (no preset picker UI)

### `/settings/connections`

This is the canonical place to discover and manage data sources. Implemented as a list of connector cards.

- List of available connections with status:
  - **Interactive Brokers — Activity Statement** *(the only connector in v1)*
    - Description: "Import your IBKR Activity Statement CSV. Produces a Fills collection (raw executions) and a Trades collection (round-trip aggregated)."
    - Status: "Connected" once the user has imported at least once; "Not yet imported" otherwise
    - **Spreadsheet upload** as the only interaction — drag-and-drop or file picker for the Activity Statement CSV
    - Import history table: filename, when, rows added / skipped / updated, status, error message if any
    - "Import now" button → opens the same import `Sheet` available on collection pages
    - "Rebuild Trades" button → re-runs the aggregation pipeline against all existing `Fills`
    - Per-connection settings (v1):
      - **Source timezone** (defaults to `America/New_York` — change if your IBKR account is configured to a different tz)
    - Future per-connection settings reserved for v2 (account number filter, default date range, etc.)
- Below the connector cards: a placeholder section ("More connectors coming soon — Schwab, Fidelity, Plaid, generic CSV") to signal the platform direction

---

## 12. Templates and connections (the pluggable concepts)

### Template format

```ts
// templates/trading-performance-dashboard.ts
export const trading_performance_dashboard: PageTemplate = {
  id: 'trading-performance-dashboard',
  name: 'Performance Dashboard',
  description: 'KPIs, equity curve, recent trades — pre-built for IBKR-imported Trades',
  pageType: 'dashboard',
  emoji: '📊',
  // Plate document with placeholder block IDs to be replaced on instantiation
  document: { ... },
  // Required collections — instantiation fails if not present
  requiresCollections: [{ name: 'Trades', managed_by_connection: 'ibkr' }],
};
```

A template registry (`templates/index.ts`) exports an array; the `+ New page → Apply template` menu reads from it.

When a template requires a collection that doesn't exist, the menu disables it with a tooltip ("Import IBKR data first").

### Connection interface

```ts
// lib/connections/types.ts
interface Connection {
  id: string;            // 'ibkr-activity-statement'
  displayName: string;   // 'Interactive Brokers — Activity Statement'
  description: string;

  // Per-connection settings schema (Zod). Surfaced in Settings → Connections.
  settingsSchema: ZodSchema;
  defaultSettings: Record<string, unknown>;
  // Example for IBKR: { sourceTimezone: 'America/New_York' }

  // What collections does this connection produce?
  producedCollections: ConnectionCollectionSpec[];

  // Can this importer parse this file?
  canParse(file: File): Promise<boolean>;

  // Parse + return rows ready for upsert. Receives the connection's settings.
  parse(file: File, settings: Record<string, unknown>): Promise<{
    rowsByCollection: Record<string, RawRow[]>;
    metadata: { rowCount: number; rowsSkipped: number };
  }>;

  // Optional pipeline run after parse + upsert (for derived collections like Trades)
  postProcess?(ctx: { ownerType: string; ownerId: string }):
    Promise<{ rowsCreated: number; rowsUpdated: number }>;
}
```

A connection registry (`lib/connections/index.ts`) exports an array. `+ New page → Import data` reads from it. Settings → Connections lists the same.

v1 ships one connection: `ibkr-activity-statement`. It produces two collections (`Fills`, `Trades`) and runs the round-trip aggregator as `postProcess`. Default settings: `{ sourceTimezone: 'America/New_York' }`.

---

## 13. Performance commitments

| Concern | Commitment |
|---|---|
| Network latency | Vercel + Supabase same region (target: us-east-1) |
| Connection storms (serverless) | Use Supabase pooler URL `?pgbouncer=true` for all server-side connections |
| Hot analytics queries | Materialized views for `equity_curve`, `pnl_by_symbol`; refreshed inside import Server Action |
| First paint | Server Components prefetch + stream; Plate editor mounts client-side after first paint with Skeleton |
| Bundle size | Per-route code splitting; Plate not in marketing/auth bundles; Recharts dynamic-imported inside Chart blocks |
| Re-renders | Plate `onChange` debounced 500ms; React Server Component cache dedups same-data fetches across blocks |
| Cold starts | Production runs Supabase Pro tier (no auto-pause); free tier for dev only |
| Quality gate | Target Lighthouse Performance ≥ 90 on dashboard pages; CI check on PR |

**Honest limit:** Supabase is single-region by default. Users far from the deploy region experience higher latency. Multi-region is enterprise-tier and out of v1 scope.

---

## 14. Project layout & dependencies

### Scaffold (monorepo)

```bash
# Run inside /Users/tristanfleming/Documents/Code/Trading/
npx shadcn@latest init --name backdesk --template next --preset b2oWqHU1I --monorepo
```

This creates a Turborepo + pnpm-workspaces monorepo with:
- `apps/web` — the Next.js app (the only app in v1)
- `packages/ui` — shared shadcn primitives (`@workspace/ui`)
- `packages/eslint-config` and `packages/typescript-config` — shared dev configs

Future apps and packages (deferred to v2+, but the monorepo is ready for them):
- `apps/marketing` — landing site (Astro or another Next.js app)
- `apps/admin` — internal admin dashboard
- `packages/connections`, `packages/db` — extracted only when a second consumer needs them

### Directory layout

```
Trading/                                     -- project root, monorepo
├── apps/
│   └── web/                                 -- the Next.js app
│       ├── app/                             -- App Router (Section 5)
│       ├── components/
│       │   ├── editor/
│       │   │   ├── PlateEditor.tsx
│       │   │   └── blocks/
│       │   │       ├── CardBlock.tsx
│       │   │       ├── ChartBlock.tsx
│       │   │       ├── TableBlock.tsx
│       │   │       └── RowBlock.tsx
│       │   ├── collection/
│       │   │   ├── CollectionListView.tsx
│       │   │   ├── cells/                   -- TextCell, NumberCell, ...
│       │   │   ├── CollectionHeader.tsx
│       │   │   └── ImportSheet.tsx
│       │   ├── command-palette/
│       │   │   └── CommandPalette.tsx
│       │   ├── sidebar/
│       │   │   └── AppSidebar.tsx
│       │   └── shells/
│       │       ├── AppShell.tsx
│       │       └── SettingsShell.tsx
│       ├── actions/                         -- Server Actions
│       │   ├── pages.ts
│       │   ├── collections.ts
│       │   ├── views.ts
│       │   ├── import.ts
│       │   ├── settings.ts
│       │   └── admin/                       -- service-role-only
│       │       ├── seed.ts
│       │       └── delete-account.ts
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── browser.ts
│       │   │   ├── server.ts
│       │   │   └── admin.ts
│       │   ├── collections/
│       │   │   ├── collection.ts            -- Collection interface + impl
│       │   │   ├── fields.ts
│       │   │   └── filters.ts
│       │   ├── connections/
│       │   │   ├── types.ts                 -- Connection interface
│       │   │   ├── index.ts                 -- registry
│       │   │   └── ibkr-activity-statement/
│       │   │       ├── connection.ts
│       │   │       ├── parser.ts
│       │   │       └── aggregator.ts
│       │   ├── trades/
│       │   │   ├── aggregate-fills.ts
│       │   │   ├── metrics.ts
│       │   │   └── *.test.ts
│       │   └── utils.ts
│       ├── templates/
│       │   ├── index.ts
│       │   ├── trading-performance-dashboard.ts
│       │   ├── trading-daily-journal.ts
│       │   └── trading-weekly-review.ts
│       ├── components.json
│       ├── middleware.ts
│       └── package.json
├── packages/
│   ├── ui/                                  -- shared shadcn primitives
│   │   ├── src/
│   │   │   ├── components/                  -- managed via shadcn CLI
│   │   │   ├── hooks/
│   │   │   └── lib/utils.ts                 -- shadcn cn()
│   │   ├── components.json
│   │   └── package.json
│   ├── eslint-config/
│   └── typescript-config/
├── supabase/                                -- top-level for shared use
│   ├── migrations/                          -- schema + RLS
│   └── seed.sql
├── seed/                                    -- dev fixtures (top-level)
│   ├── sample-activity-statement.csv
│   └── seed.ts                              -- `pnpm seed`
├── tests/                                   -- top-level e2e + integration
│   ├── unit/                                -- (or co-located in apps/web/)
│   ├── integration/                         -- RLS + Server Actions
│   └── e2e/                                 -- Playwright
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                             -- root, with shared scripts
└── README.md
```

**Import aliases:**
- shadcn primitives: `import { Button } from "@workspace/ui/components/button"`
- App-local code: `import { Foo } from "@/components/..."` (resolves inside `apps/web/`)

**Top-level scripts** (proxied through Turbo):
- `pnpm dev` → `turbo dev` (runs `apps/web` dev server)
- `pnpm build` → `turbo build`
- `pnpm test` → `turbo test`
- `pnpm typecheck` → `turbo typecheck`
- `pnpm lint` → `turbo lint`
- Project-only scripts (`pnpm seed`, `pnpm db:migrate`, `pnpm test:e2e`) live in the root `package.json` and target the right workspace where needed

### Key dependencies (v1)

| Purpose | Package |
|---|---|
| Framework | `next@^15` |
| UI primitives | shadcn (managed via `components.json`) |
| Block editor | `platejs` + selected `@plate/*` registry items |
| Charts | `recharts` (shadcn `Chart` wraps it) |
| Auth + DB + Storage | `@supabase/ssr`, `@supabase/supabase-js` |
| CSV parsing | `papaparse` |
| Date handling | `date-fns` |
| Forms | `react-hook-form` + `zod` |
| Theming | `next-themes` |
| Emoji picker | `emoji-mart` |
| Tests — unit | `vitest` |
| Tests — e2e | `@playwright/test` |
| Tests — RLS | Vitest + Supabase test client + truncate-between-tests pattern |

### Scripts

- `pnpm dev` — Next dev server
- `pnpm build` / `pnpm start`
- `pnpm test` — unit + integration
- `pnpm test:e2e` — Playwright
- `pnpm seed` / `pnpm seed:add` — dev fixtures (Section 15)
- `pnpm db:migrate` — apply Supabase migrations
- `pnpm typecheck` / `pnpm lint`

### Continuous integration

GitHub Actions workflow on every PR:
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (unit + integration against an ephemeral local Supabase)
- `pnpm test:e2e` (Playwright against a Vercel preview deployment of the PR)
- Lighthouse CI check on the dashboard route — fails the PR if Performance score drops below 90

`main` deploys auto-promote to production via Vercel; preview branches get their own URLs.

---

## 15. Development & seed data

### Seed CSV

Repo ships `seed/sample-activity-statement.csv` — a synthetic IBKR Activity Statement with realistic structure:

- ~80–120 fills across ~20 symbols
- Mix of: clean round-trips, multi-fill scale-ins, multi-fill scale-outs, short trades, one position flip, winners and losers, small fees
- Date range: ~3 months of activity
- Realistic `TradeID`, `Symbol`, `Date/Time`, `Quantity`, `T. Price`, `Comm/Fee`, `Currency` columns

### Seed scripts

- `pnpm seed` — wipes the dev user's `Fills` and `Trades` collection rows, then imports the sample CSV through the real connection pipeline (parser + aggregator)
- `pnpm seed:add` — imports without wiping (tests dedup logic)

The seed exercises the production code paths, so it doubles as a smoke test for the parser + aggregator.

---

## 16. Testing strategy

### Three layers

| Layer | Tool | What it tests |
|---|---|---|
| **Unit** | Vitest | CSV parser, round-trip aggregator, metric calculations, collection filter/sort engine, template instantiation |
| **Integration** | Vitest + local Supabase | RLS policies (every test creates 2 users; user A's queries cannot see user B's data), Server Actions end-to-end |
| **E2E** | Playwright | sign-up → create collection → add a row → create dashboard → drop in a Card block → verify number; sign-up → import seed CSV → verify dashboard renders |

### Critical test cases (non-obvious)

- **Aggregator**: position flip, zero-quantity rounding noise, scaling in then partial close then full close, fills out-of-order in CSV
- **Parser**: missing Trades section, missing required columns, weird date format, non-stock asset rows, totals/subtotals not mistaken for executions
- **RLS**: every Server Action verified that user A cannot read/write user B's resources
- **Idempotency**: re-importing the same CSV produces zero new fills and zero new trades
- **Template instantiation**: applying a trading template when the required `Trades` collection is missing returns a clear error
- **Collection schema migration**: adding a user field to the system `Trades` collection survives a re-import

---

## 17. Error handling

### Server Action contract

Every Server Action returns:
```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

Client uses a small `useAction` hook that surfaces `ok=false` errors via `sonner` toast.

### Validation

Zod schemas on every Server Action input. Invalid input rejected before any DB call; the validation error is returned with `code: 'INVALID_INPUT'` and field-by-field details.

### CSV import errors

First-class. Parse failures show a `Sheet` with:
- The error code and human message
- The offending row (if known)
- A "Try again" button

### Database errors

RLS denials and constraint violations are logged server-side with the user's id and a request ID. The client toast shows a generic "Something went wrong" with the request ID for support.

### Fail-loud-in-dev posture

In development (`NODE_ENV !== 'production'`), unhandled errors throw and surface in the dev overlay. In production, the same errors are caught at the Server Action boundary and returned as `ok=false`.

### Editor save-race protection

The Plate editor debounces `onChange` by 500ms before persisting. Two specific protections prevent lost edits:

1. **Flush on navigate / unload.** A pending debounced save is force-flushed on `beforeunload` (browser close/refresh) and on Next.js route changes. Even if the user navigates 100ms after typing, the save fires.
2. **Optimistic concurrency.** Save payload includes the `pages.updated_at` timestamp the client last saw. The server only writes if it matches the current DB value; otherwise returns `{ code: 'STALE_DOCUMENT' }` and the client refetches and merges (last-write-wins by default; we surface a "your changes from another tab were applied" toast).

---

## 18. Accessibility

v1 baseline:
- All shadcn primitives (which we use everywhere) ship with accessible defaults: focus rings, keyboard navigation, ARIA labels, screen reader announcements
- Editor (Plate) has built-in keyboard nav (arrows, Tab, Shift+Tab, Enter for line breaks, Backspace to merge)
- Sidebar, command palette, dialogs, sheets are all keyboard-navigable (Tab order tested in e2e)
- Color contrast meets WCAG AA in both themes — verified by automated `axe-core` checks in unit tests for key components (Button, Card, Input, Badge)
- Every interactive element has an accessible name (visible label, `aria-label`, or `sr-only` label)
- Form inputs use `Field` + `FieldLabel` (per shadcn rules) so labels are properly associated

Not in v1 baseline (deferred):
- Full WCAG AAA conformance audit
- Custom screen reader announcements for live updates (e.g., "saved" toasts)
- Reduced-motion preference respect on chart animations (CSS `@media (prefers-reduced-motion)` will be added; chart-specific animation toggles are v2)

## 19. Observability

v1, minimal:

- **Sentry** — client + server error tracking (free tier)
- **Vercel Analytics** — page-load metrics
- **Supabase logs** — query performance dashboard

No Datadog, no custom metrics in v1. Add when there's volume to justify.

---

## 20. Open questions

None blocking. Items deferred to follow-up specs:

- Auth polish: email verification UX, password reset email template, OAuth providers beyond Google (v1 ships Google only)
- Billing: plans, trial, dunning, upgrade flow
- Marketing site: landing page, pricing, docs, blog
- Additional connections (Schwab, Plaid, generic CSV)
- Additional view types for collections (kanban, calendar, gallery)
- Inter-collection relations + Lookup/Rollup field types
- Computed collections as a user-facing concept
- Multi-block selection / bulk operations
- Cmd+K full-text content search
- Universal undo across page types
- 2FA / MFA UI
- Background job queue for very large imports

---

## Appendix A — Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | Next.js 15 App Router | SaaS-ready, Server Components fit the "fast" bar, ecosystem |
| Backend | Supabase (Auth + Postgres + Storage) | Single provider, RLS for multi-tenancy, fast onboarding |
| Block editor | Plate.js | First-class shadcn integration via `@plate` registry; granular plugin system suits custom data-aware blocks |
| Auth provider | Supabase Auth | Bundled with backend; RLS integration |
| CSV parser | `papaparse` | De facto standard, handles edge cases |
| Per-trade P&L math | Weighted average | Right for performance review; FIFO is for taxes (out of scope) |
| Round-trip rule | Flat → flat per symbol | Matches user's preferred mental model |
| Collection storage | JSONB rows in generic `collection_rows` table | Universal primitive; trading collections share the same model as user-created |
| Auto-creation on signup | None | Workspace is empty; templates and connections create content |
| Settings | One settings area with 4 sub-pages (account, profile, appearance, connections) | Standard SaaS shape, room to grow |
| Theming | shadcn-native: `next-themes` for mode, CSS variable swaps via `data-accent` for accent | Cheap, in-keeping with shadcn idioms |
| Ownership column naming | `owner_id` + `owner_type` (always `'user'` in v1) | Forward-compatible for v2 teams without column rename |
| Soft delete | `deleted_at` columns on `pages` and `collections` | Trash/Restore feature ships in v2 with no migration |
| Hot analytics queries | Direct queries with indexes (no materialized views in v1) | YAGNI; revisit if metrics show need |
| Multi-currency | `currency` field stores `{ amount, currency_code }`; aggregations group by code in v1 | Honest representation; FX conversion is v2 |
| Timezone | UTC in storage; display converts to `profiles.timezone` | Standard pattern; avoids painful migrations |
| Source timezone for connections | Per-connection setting (default `America/New_York` for IBKR) | Different brokers run different tzs |

## Appendix B — Glossary

- **Page** — a top-level item in the sidebar; either a dashboard or a collection
- **Dashboard** — a page that contains a Plate document
- **Collection** — a typed table (schema + rows) shown via a list view
- **Block** — an element in a Plate document (text, heading, image, Card, Chart, Table, Row, etc.)
- **View** — a saved configuration (sort, filters, visible fields) for a collection; v1 only `list` type
- **Connection** — an importer that produces collections from external data; v1 ships one (`ibkr-activity-statement`)
- **Template** — a saved page recipe applied via `+ New page → Apply template`
- **Pipeline** — a named transform applied during a connection's `postProcess` step (v1: `Fills → Trades` aggregator)
- **Round-trip** — one trade, defined as the period from when a user goes from flat to a position and back to flat on a single symbol
- **System collection / system field** — created and managed by a connection; user can hide via views and add adjacent user-fields, but cannot delete or rename
