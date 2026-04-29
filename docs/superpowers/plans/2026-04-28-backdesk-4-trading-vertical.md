# Backdesk Plan 4: Trading Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the trading vertical on top of the generic platform. IBKR Activity Statement importer (parser + round-trip aggregator) produces `Fills` and `Trades` collections. Three opinionated templates (Performance Dashboard, Daily Journal, Weekly Review). After this plan, a user can import a real IBKR CSV and immediately see populated dashboards.

**Architecture:** The IBKR connection implements the `Connection` interface (parse + postProcess). Parser handles the multi-section Activity Statement format. Aggregator collapses fills into round-trip trades using flat→flat-per-symbol logic with a position-flip handler. Aggregator output upserts into the `Trades` collection on stable identity `(owner, symbol, opened_at, side, opening_fill_id)`. Templates are TypeScript modules that produce a Plate document or collection schema, instantiated by a Server Action.

**Tech Stack:** `papaparse` for CSV, `date-fns-tz` for timezone-aware date parsing.

**Pre-execution refinement:** Before starting, re-read spec [Sections 6 (CSV import + aggregation), 12 (Templates and connections), 15 (Development & seed data)](../specs/2026-04-28-backdesk-v1-design.md). Verify the Plate plugin keys (`card`, `chart`, `data-table`, `data-row`) match what's actually registered in `EditorKit` from Plan 3. If any drifted, update the templates in Tasks 13–15 to match.

---

## File structure created in this plan

```
apps/web/
├── lib/connections/
│   ├── types.ts                         -- (modified) full Connection interface
│   ├── index.ts                         -- registry
│   └── ibkr-activity-statement/
│       ├── connection.ts                -- the Connection impl
│       ├── parser.ts                    -- CSV → fill records
│       ├── parser.test.ts
│       ├── aggregator.ts                -- fills → trades
│       └── aggregator.test.ts
├── lib/templates/
│   ├── types.ts                         -- Template + helpers
│   ├── index.ts                         -- registry
│   ├── trading-performance-dashboard.ts
│   ├── trading-daily-journal.ts
│   └── trading-weekly-review.ts
├── actions/
│   ├── import.ts                        -- runImport (parse + postProcess + audit row)
│   └── templates.ts                     -- applyTemplate
├── components/
│   ├── connections/
│   │   ├── ImportSheet.tsx              -- shared import dialog
│   │   └── ConnectionCard.tsx           -- settings → connections card
│   ├── sidebar/NewPageMenu.tsx          -- (modified) enable Apply template + Import data
│   └── collection/CollectionHeader.tsx  -- (modified) wire up Import button slot
└── app/(app)/settings/connections/page.tsx

supabase/migrations/
└── 20260430000001_connection_imports.sql

seed/
├── sample-activity-statement.csv
└── seed.ts                              -- pnpm seed
```

---

### Task 1: Migration — connection_imports

**Files:** `supabase/migrations/20260430000001_connection_imports.sql`

- [ ] **Step 1: Write**

```sql
CREATE TABLE connection_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL DEFAULT 'user',
  owner_id UUID NOT NULL,
  connection TEXT NOT NULL,
  filename TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_added INT NOT NULL DEFAULT 0,
  rows_skipped_duplicate INT NOT NULL DEFAULT 0,
  rows_skipped_unsupported INT NOT NULL DEFAULT 0,
  pipeline_rows_created INT NOT NULL DEFAULT 0,
  pipeline_rows_updated INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('parsed','failed','partial')),
  error_message TEXT
);

ALTER TABLE connection_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY connection_imports_owner ON connection_imports FOR ALL
  USING (owner_type = 'user' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());
```

- [ ] **Step 2: Apply + commit**

```bash
supabase db reset && pnpm db:types
git add supabase/migrations apps/web/lib/supabase/types.ts
git commit -m "feat(db): connection_imports audit table"
```

---

### Task 2: Connection types

**Files:** `apps/web/lib/connections/types.ts`

- [ ] **Step 1: Write**

```ts
// apps/web/lib/connections/types.ts
import type { ZodType } from "zod";

export type RawRow = Record<string, unknown>;

export type CollectionFieldSpec = {
  name: string;
  type: "text" | "number" | "currency" | "date" | "datetime" | "select" | "multi_select" | "checkbox";
  options?: Array<{ value: string; label: string; color?: string }>;
  config?: Record<string, unknown>;
  is_system?: boolean;
};

export type ConnectionCollectionSpec = {
  name: string;            // e.g., 'Fills', 'Trades'
  fields: CollectionFieldSpec[];
};

export type ParseResult = {
  rowsByCollection: Record<string, RawRow[]>;   // keyed by collection name
  metadata: {
    rowCount: number;
    rowsSkipped: number;
  };
};

export type Connection<S = unknown> = {
  id: string;
  displayName: string;
  description: string;
  settingsSchema: ZodType<S>;
  defaultSettings: S;
  producedCollections: ConnectionCollectionSpec[];
  canParse(file: File): Promise<boolean>;
  parse(file: File, settings: S): Promise<ParseResult>;
  postProcess?(ctx: { ownerType: string; ownerId: string }):
    Promise<{ rowsCreated: number; rowsUpdated: number }>;
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/connections/types.ts
git commit -m "feat(connections): connection interface types"
```

---

### Task 3: IBKR Activity Statement parser

**Files:**
- Create: `apps/web/lib/connections/ibkr-activity-statement/parser.ts`
- Create: `apps/web/lib/connections/ibkr-activity-statement/parser.test.ts`

- [ ] **Step 1: Install date-fns-tz**

```bash
pnpm --filter web add date-fns-tz
```

- [ ] **Step 2: Write failing tests**

```ts
// apps/web/lib/connections/ibkr-activity-statement/parser.test.ts
import { describe, it, expect } from "vitest";
import { parseActivityStatement } from "./parser";

const SAMPLE_CSV = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,TradeID
Trades,Data,Order,Stocks,USD,AAPL,"2025-04-15, 09:30:00",100,182.45,-1.00,0
Trades,Data,Execution,Stocks,USD,AAPL,"2025-04-15, 09:30:01",100,182.45,-1.00,12345
Trades,Data,Execution,Stocks,USD,AAPL,"2025-04-15, 14:00:01",-100,184.10,-1.00,12346
Trades,SubTotal,,Stocks,USD,AAPL,,,0,165.00,-2.00,
Trades,Total,,,USD,,,,,165.00,-2.00,
Open Positions,Header,Asset Category,Symbol,Quantity
Open Positions,Data,Stocks,AAPL,0
`;

describe("parseActivityStatement", () => {
  it("extracts executions only", () => {
    const file = new File([SAMPLE_CSV], "activity.csv", { type: "text/csv" });
    return parseActivityStatement(file, { sourceTimezone: "America/New_York" }).then((result) => {
      expect(result.fills).toHaveLength(2);
      expect(result.fills[0]).toMatchObject({
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        price: 182.45,
        currency: "USD",
        source_external_id: "12345",
      });
      expect(result.fills[1]).toMatchObject({ side: "SELL", source_external_id: "12346" });
      // executed_at should be UTC ISO
      expect(result.fills[0].executed_at).toMatch(/T13:30:01\.000Z|T14:30:01\.000Z/); // EDT vs EST
    });
  });

  it("returns NO_TRADES_SECTION error when missing", async () => {
    const file = new File(["Statement,Header,...\nStatement,Data,...\n"], "broken.csv", { type: "text/csv" });
    await expect(parseActivityStatement(file, { sourceTimezone: "America/New_York" }))
      .rejects.toThrow(/NO_TRADES_SECTION/);
  });

  it("skips non-stock rows and counts them", async () => {
    const csv = SAMPLE_CSV.replace("Stocks,USD,AAPL", "Options,USD,AAPL  240419C00170000");
    const file = new File([csv], "options.csv", { type: "text/csv" });
    const r = await parseActivityStatement(file, { sourceTimezone: "America/New_York" });
    expect(r.skippedNonStock).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run (expect failure)**

```bash
pnpm --filter web exec vitest run lib/connections/ibkr-activity-statement/parser.test.ts
```

- [ ] **Step 4: Implement**

```ts
// apps/web/lib/connections/ibkr-activity-statement/parser.ts
import Papa from "papaparse";
import { fromZonedTime } from "date-fns-tz";

export type ParsedFill = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  executed_at: string;     // UTC ISO
  source_external_id: string; // IBKR TradeID
};

export type ParseSettings = { sourceTimezone: string };

export async function parseActivityStatement(
  file: File,
  settings: ParseSettings,
): Promise<{ fills: ParsedFill[]; skippedNonStock: number }> {
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data;

  // Find the Trades section header
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === "Trades" && r[1] === "Header") { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error("NO_TRADES_SECTION");

  const header = rows[headerIdx];
  const col = (name: string) => header.indexOf(name);
  const idx = {
    discriminator: col("DataDiscriminator"),
    assetCategory: col("Asset Category"),
    currency: col("Currency"),
    symbol: col("Symbol"),
    dateTime: col("Date/Time"),
    quantity: col("Quantity"),
    price: col("T. Price"),
    fee: col("Comm/Fee"),
    tradeId: col("TradeID"),
  };
  // Required columns
  for (const [k, v] of Object.entries(idx)) {
    if (v < 0) throw new Error(`MISSING_COLUMN: ${k}`);
  }

  const fills: ParsedFill[] = [];
  let skippedNonStock = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] !== "Trades") break;
    if (r[1] === "Header") continue;
    if (r[1] !== "Data") continue;
    if (r[idx.discriminator] !== "Execution") continue;
    if (r[idx.assetCategory] !== "Stocks") { skippedNonStock++; continue; }

    const qty = Number(r[idx.quantity]);
    if (Number.isNaN(qty)) throw new Error(`INVALID_QUANTITY: row ${i+1}`);

    const localDate = parseIBKRDate(r[idx.dateTime]);
    const utcDate = fromZonedTime(localDate, settings.sourceTimezone);

    fills.push({
      symbol: r[idx.symbol],
      side: qty > 0 ? "BUY" : "SELL",
      quantity: Math.abs(qty),
      price: Number(r[idx.price]),
      fees: Math.abs(Number(r[idx.fee])),
      currency: r[idx.currency],
      executed_at: utcDate.toISOString(),
      source_external_id: r[idx.tradeId],
    });
  }

  return { fills, skippedNonStock };
}

function parseIBKRDate(input: string): Date {
  // Format: "2025-04-15, 09:32:14"
  const m = /^(\d{4})-(\d{2})-(\d{2}),\s*(\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if (!m) throw new Error(`UNRECOGNIZED_DATE: ${input}`);
  const [, y, mo, d, h, mi, s] = m;
  // Treat as local in source timezone — caller converts to UTC
  return new Date(Number(y), Number(mo)-1, Number(d), Number(h), Number(mi), Number(s));
}
```

- [ ] **Step 5: Run tests (expect pass)**

```bash
pnpm --filter web exec vitest run lib/connections/ibkr-activity-statement/parser.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/connections pnpm-lock.yaml
git commit -m "feat(connections): IBKR Activity Statement parser with timezone-aware date handling"
```

---

### Task 4: Round-trip aggregator

**Files:**
- Create: `apps/web/lib/connections/ibkr-activity-statement/aggregator.ts`
- Create: `apps/web/lib/connections/ibkr-activity-statement/aggregator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/lib/connections/ibkr-activity-statement/aggregator.test.ts
import { describe, it, expect } from "vitest";
import { aggregateFillsToTrades } from "./aggregator";
import type { ParsedFill } from "./parser";

function fill(over: Partial<ParsedFill>): ParsedFill {
  return {
    symbol: "AAPL", side: "BUY", quantity: 100, price: 100, fees: 1, currency: "USD",
    executed_at: "2025-01-01T10:00:00.000Z", source_external_id: "x", ...over,
  };
}

describe("aggregateFillsToTrades", () => {
  it("simple long round-trip", () => {
    const trades = aggregateFillsToTrades([
      fill({ side: "BUY",  quantity: 100, price: 100, executed_at: "2025-01-01T10:00:00.000Z", source_external_id: "1" }),
      fill({ side: "SELL", quantity: 100, price: 110, executed_at: "2025-01-01T15:00:00.000Z", source_external_id: "2" }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: "AAPL", side: "LONG", total_quantity: 100,
      avg_entry_price: 100, avg_exit_price: 110,
      gross_pnl: 1000, net_pnl: 998,
      currency_code: "USD", opening_fill_id: "1",
    });
  });

  it("scale-in then full close", () => {
    const trades = aggregateFillsToTrades([
      fill({ side: "BUY", quantity: 50, price: 100, executed_at: "2025-01-01T10:00:00.000Z", source_external_id: "1" }),
      fill({ side: "BUY", quantity: 50, price: 102, executed_at: "2025-01-01T11:00:00.000Z", source_external_id: "2" }),
      fill({ side: "SELL", quantity: 100, price: 110, executed_at: "2025-01-01T15:00:00.000Z", source_external_id: "3" }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].avg_entry_price).toBe(101);
    expect(trades[0].gross_pnl).toBe(900); // (110-101)*100
  });

  it("position flip (long → short in one fill)", () => {
    const trades = aggregateFillsToTrades([
      fill({ side: "BUY",  quantity: 100, price: 100, executed_at: "2025-01-01T10:00:00.000Z", source_external_id: "1" }),
      fill({ side: "SELL", quantity: 200, price: 110, executed_at: "2025-01-01T11:00:00.000Z", source_external_id: "2" }),
      fill({ side: "BUY",  quantity: 100, price: 105, executed_at: "2025-01-01T12:00:00.000Z", source_external_id: "3" }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0].side).toBe("LONG");
    expect(trades[0].gross_pnl).toBe(1000);
    expect(trades[1].side).toBe("SHORT");
    expect(trades[1].gross_pnl).toBe(500); // (110-105)*100
  });

  it("short round-trip", () => {
    const trades = aggregateFillsToTrades([
      fill({ side: "SELL", quantity: 100, price: 110, executed_at: "2025-01-01T10:00:00.000Z", source_external_id: "1" }),
      fill({ side: "BUY",  quantity: 100, price: 100, executed_at: "2025-01-01T11:00:00.000Z", source_external_id: "2" }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe("SHORT");
    expect(trades[0].gross_pnl).toBe(1000);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// apps/web/lib/connections/ibkr-activity-statement/aggregator.ts
import type { ParsedFill } from "./parser";

export type AggregatedTrade = {
  symbol: string;
  side: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string;
  hold_duration_seconds: number;
  total_quantity: number;
  avg_entry_price: number;
  avg_exit_price: number;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  currency_code: string;
  opening_fill_id: string;
};

const EPSILON = 1e-6;

type WorkingTrade = {
  symbol: string;
  side: "LONG" | "SHORT";
  opened_at: string;
  fills: { side: "BUY" | "SELL"; quantity: number; price: number; fees: number; executed_at: string; id: string }[];
};

export function aggregateFillsToTrades(fills: ParsedFill[]): AggregatedTrade[] {
  // Group by symbol, then process chronologically
  const bySymbol = new Map<string, ParsedFill[]>();
  for (const f of fills) {
    if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, []);
    bySymbol.get(f.symbol)!.push(f);
  }
  for (const [, list] of bySymbol) {
    list.sort((a, b) => a.executed_at.localeCompare(b.executed_at));
  }

  const out: AggregatedTrade[] = [];
  for (const [symbol, list] of bySymbol) {
    let position = 0;
    let current: WorkingTrade | null = null;
    let currency = "USD";

    function open(side: "LONG" | "SHORT", openFill: ParsedFill) {
      current = {
        symbol,
        side,
        opened_at: openFill.executed_at,
        fills: [{ side: openFill.side, quantity: openFill.quantity, price: openFill.price, fees: openFill.fees, executed_at: openFill.executed_at, id: openFill.source_external_id }],
      };
      currency = openFill.currency;
    }

    function close(closingFill: { quantity: number; price: number; fees: number; side: "BUY"|"SELL"; executed_at: string; id: string }) {
      if (!current) return;
      current.fills.push(closingFill);
      out.push(finalizeTrade(current, currency));
      current = null;
    }

    function signedQty(f: { side: "BUY"|"SELL"; quantity: number }) {
      return f.side === "BUY" ? f.quantity : -f.quantity;
    }

    for (const f of list) {
      if (Math.abs(position) < EPSILON) {
        open(f.side === "BUY" ? "LONG" : "SHORT", f);
        position = signedQty(f);
        continue;
      }

      const sameDir = (position > 0 && f.side === "BUY") || (position < 0 && f.side === "SELL");
      if (sameDir) {
        // scale-in
        current!.fills.push({ side: f.side, quantity: f.quantity, price: f.price, fees: f.fees, executed_at: f.executed_at, id: f.source_external_id });
        position += signedQty(f);
        continue;
      }

      const newPos = position + signedQty(f);
      if (Math.abs(newPos) < EPSILON) {
        // exact close
        close({ side: f.side, quantity: f.quantity, price: f.price, fees: f.fees, executed_at: f.executed_at, id: f.source_external_id });
        position = 0;
      } else if (Math.sign(newPos) === Math.sign(position)) {
        // partial close, still in same direction
        current!.fills.push({ side: f.side, quantity: f.quantity, price: f.price, fees: f.fees, executed_at: f.executed_at, id: f.source_external_id });
        position = newPos;
      } else {
        // FLIP — split fill into closing portion and opening portion
        const closingQty = Math.abs(position);
        const leftoverQty = Math.abs(newPos);
        // Pro-rate fees by qty
        const totalQty = closingQty + leftoverQty;
        const closeFees = f.fees * (closingQty / totalQty);
        const openFees = f.fees * (leftoverQty / totalQty);
        close({
          side: f.side, quantity: closingQty, price: f.price, fees: closeFees,
          executed_at: f.executed_at, id: `${f.source_external_id}_close`,
        });
        // Open new opposite trade
        open(
          f.side === "BUY" ? "LONG" : "SHORT",
          { ...f, quantity: leftoverQty, fees: openFees, source_external_id: `${f.source_external_id}_open` },
        );
        position = signedQty({ side: f.side, quantity: leftoverQty });
      }
    }
  }

  out.sort((a, b) => a.closed_at.localeCompare(b.closed_at));
  return out;
}

function finalizeTrade(t: WorkingTrade, currency: string): AggregatedTrade {
  const isLong = t.side === "LONG";
  const opens = t.fills.filter((f) => (isLong ? f.side === "BUY" : f.side === "SELL"));
  const closes = t.fills.filter((f) => (isLong ? f.side === "SELL" : f.side === "BUY"));

  const openQty = opens.reduce((a, f) => a + f.quantity, 0);
  const closeQty = closes.reduce((a, f) => a + f.quantity, 0);
  const totalQty = Math.min(openQty, closeQty); // they should match within EPSILON

  const avgEntry = opens.reduce((a, f) => a + f.price * f.quantity, 0) / openQty;
  const avgExit = closes.reduce((a, f) => a + f.price * f.quantity, 0) / closeQty;

  const grossPnl = (avgExit - avgEntry) * totalQty * (isLong ? 1 : -1);
  const fees = t.fills.reduce((a, f) => a + f.fees, 0);
  const netPnl = grossPnl - fees;

  const closedAt = closes[closes.length - 1].executed_at;
  const openedAt = t.opened_at;
  const hold = (new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 1000;

  return {
    symbol: t.symbol,
    side: t.side,
    opened_at: openedAt,
    closed_at: closedAt,
    hold_duration_seconds: Math.round(hold),
    total_quantity: totalQty,
    avg_entry_price: avgEntry,
    avg_exit_price: avgExit,
    gross_pnl: grossPnl,
    fees,
    net_pnl: netPnl,
    currency_code: currency,
    opening_fill_id: t.fills[0].id,
  };
}
```

- [ ] **Step 3: Run tests (expect pass)**

```bash
pnpm --filter web exec vitest run lib/connections/ibkr-activity-statement/aggregator.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/connections/ibkr-activity-statement
git commit -m "feat(connections): round-trip aggregator with flip handling and tests"
```

---

### Task 5: IBKR Connection (canParse, parse, postProcess)

**Files:**
- Create: `apps/web/lib/connections/ibkr-activity-statement/connection.ts`
- Create: `apps/web/lib/connections/index.ts`
- Modify: existing `apps/web/lib/connections/types.ts` if needed

- [ ] **Step 1: Define system field schemas**

```ts
// apps/web/lib/connections/ibkr-activity-statement/connection.ts
import { z } from "zod";
import type { Connection, ConnectionCollectionSpec } from "../types";
import { parseActivityStatement } from "./parser";
import { aggregateFillsToTrades } from "./aggregator";

const FILLS_FIELDS: ConnectionCollectionSpec["fields"] = [
  { name: "Symbol", type: "text", is_system: true },
  { name: "Side", type: "select", options: [{ value: "BUY", label: "Buy" }, { value: "SELL", label: "Sell" }], is_system: true },
  { name: "Quantity", type: "number", is_system: true },
  { name: "Price", type: "currency", is_system: true },
  { name: "Fees", type: "currency", is_system: true },
  { name: "Executed at", type: "datetime", is_system: true },
];

const TRADES_FIELDS: ConnectionCollectionSpec["fields"] = [
  { name: "Symbol", type: "text", is_system: true },
  { name: "Side", type: "select", options: [{ value: "LONG", label: "Long" }, { value: "SHORT", label: "Short" }], is_system: true },
  { name: "Opened at", type: "datetime", is_system: true },
  { name: "Closed at", type: "datetime", is_system: true },
  { name: "Hold duration (s)", type: "number", is_system: true },
  { name: "Quantity", type: "number", is_system: true },
  { name: "Avg entry price", type: "currency", is_system: true },
  { name: "Avg exit price", type: "currency", is_system: true },
  { name: "Gross P&L", type: "currency", is_system: true },
  { name: "Fees", type: "currency", is_system: true },
  { name: "Net P&L", type: "currency", is_system: true },
  { name: "Currency", type: "text", is_system: true },
];

const SettingsSchema = z.object({ sourceTimezone: z.string() });
type Settings = z.infer<typeof SettingsSchema>;

export const ibkrActivityStatement: Connection<Settings> = {
  id: "ibkr-activity-statement",
  displayName: "Interactive Brokers — Activity Statement",
  description: "Import your IBKR Activity Statement CSV. Produces Fills and Trades collections.",
  settingsSchema: SettingsSchema,
  defaultSettings: { sourceTimezone: "America/New_York" },
  producedCollections: [
    { name: "Fills", fields: FILLS_FIELDS },
    { name: "Trades", fields: TRADES_FIELDS },
  ],

  async canParse(file: File) {
    // Cheap check: read first 8KB, look for "Trades,Header"
    const head = await file.slice(0, 8192).text();
    return head.includes("Trades,Header");
  },

  async parse(file, settings) {
    const result = await parseActivityStatement(file, settings);
    const fillsRows = result.fills.map((f) => ({
      Symbol: f.symbol,
      Side: f.side,
      Quantity: f.quantity,
      Price: { amount: f.price, currency_code: f.currency },
      Fees: { amount: f.fees, currency_code: f.currency },
      "Executed at": f.executed_at,
      __external_id: f.source_external_id,
    }));
    return {
      rowsByCollection: { Fills: fillsRows },
      metadata: { rowCount: fillsRows.length, rowsSkipped: result.skippedNonStock },
    };
  },

  // postProcess: read all Fills rows, aggregate to Trades, upsert
  // Implementation lives in actions/import.ts because it needs DB access
};
```

- [ ] **Step 2: Add registry**

```ts
// apps/web/lib/connections/index.ts
import { ibkrActivityStatement } from "./ibkr-activity-statement/connection";
import type { Connection } from "./types";

export const connections: Connection<any>[] = [
  ibkrActivityStatement as unknown as Connection<unknown>,
];

export function findConnection(id: string): Connection<any> | undefined {
  return connections.find((c) => c.id === id);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/connections
git commit -m "feat(connections): IBKR Connection definition and registry"
```

---

### Task 6: `runImport` Server Action — orchestrates parse + write + aggregate

**Files:** `apps/web/actions/import.ts`

- [ ] **Step 1: Write**

```ts
// apps/web/actions/import.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findConnection } from "@/lib/connections";
import { parseActivityStatement } from "@/lib/connections/ibkr-activity-statement/parser";
import { aggregateFillsToTrades } from "@/lib/connections/ibkr-activity-statement/aggregator";

const Result = <T>(data: T) => ({ ok: true as const, data });
const Err = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

const RunImportSchema = z.object({
  connectionId: z.string(),
  fileName: z.string(),
  fileBase64: z.string(), // file contents — we send via FormData in practice; this schema kept for clarity
  settings: z.record(z.unknown()).default({}),
});

// In real wiring this takes a FormData (with the file). Demo schema above is illustrative.
export async function runImport(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");

  const file = formData.get("file");
  const connectionId = String(formData.get("connectionId") ?? "");
  const settingsRaw = String(formData.get("settings") ?? "{}");
  if (!(file instanceof File)) return Err("NO_FILE", "Pick a file.");

  const conn = findConnection(connectionId);
  if (!conn) return Err("UNKNOWN_CONNECTION", `Connection ${connectionId} not found.`);

  const settings = conn.settingsSchema.parse(JSON.parse(settingsRaw || "{}"));

  if (!(await conn.canParse(file))) {
    return Err("UNRECOGNIZED_FILE", `This file doesn't look like a ${conn.displayName} export.`);
  }

  let parsed;
  try {
    parsed = await conn.parse(file, settings);
  } catch (e: any) {
    await recordImport(supabase, user.id, conn.id, file.name, "failed", String(e?.message ?? e));
    return Err("PARSE_FAILED", String(e?.message ?? e));
  }

  // Ensure Fills + Trades collections exist (system, managed_by_connection)
  const collectionIds = await ensureSystemCollections(supabase, user.id, conn);

  // Build a fieldId map for the Fills collection
  const fillsCollId = collectionIds["Fills"];
  const tradesCollId = collectionIds["Trades"];
  const fillsFieldsByName = await loadFieldsByName(supabase, fillsCollId);
  const tradesFieldsByName = await loadFieldsByName(supabase, tradesCollId);

  // Insert fills
  const fillsRows = (parsed.rowsByCollection["Fills"] ?? []).map((r: any) => ({
    owner_type: "user",
    owner_id: user.id,
    collection_id: fillsCollId,
    data: mapRowToData(r, fillsFieldsByName),
    source: `connection:${conn.id}`,
    source_external_id: r.__external_id,
  }));
  const { error: fillsErr, count: fillsAdded } = await supabase
    .from("collection_rows")
    .upsert(fillsRows, { onConflict: "owner_type,owner_id,collection_id,source_external_id", ignoreDuplicates: true, count: "exact" });
  if (fillsErr) {
    await recordImport(supabase, user.id, conn.id, file.name, "failed", fillsErr.message);
    return Err("FILL_INSERT_FAILED", fillsErr.message);
  }

  // Aggregate trades
  const allParsedFills = (parsed.rowsByCollection["Fills"] ?? []).map((r: any) => ({
    symbol: r.Symbol, side: r.Side,
    quantity: r.Quantity,
    price: r.Price.amount,
    fees: r.Fees.amount,
    currency: r.Price.currency_code,
    executed_at: r["Executed at"],
    source_external_id: r.__external_id,
  }));

  // Pull existing fills for this user+symbols so we re-aggregate the full history.
  // NOTE: `data` is keyed by field UUID, not by field name — use the resolved IDs.
  const symbolFid = fillsFieldsByName["Symbol"];
  const sideFid = fillsFieldsByName["Side"];
  const qtyFid = fillsFieldsByName["Quantity"];
  const priceFid = fillsFieldsByName["Price"];
  const feesFid = fillsFieldsByName["Fees"];
  const executedAtFid = fillsFieldsByName["Executed at"];

  const symbols = Array.from(new Set(allParsedFills.map((f) => f.symbol)));
  const { data: dbFills } = await supabase
    .from("collection_rows")
    .select("data, source_external_id")
    .eq("collection_id", fillsCollId)
    .in(`data->>${symbolFid}`, symbols);

  const existingFills = (dbFills ?? []).map((row: any) => ({
    symbol: row.data[symbolFid],
    side: row.data[sideFid],
    quantity: row.data[qtyFid],
    price: row.data[priceFid].amount,
    fees: row.data[feesFid].amount,
    currency: row.data[priceFid].currency_code,
    executed_at: row.data[executedAtFid],
    source_external_id: row.source_external_id,
  }));

  // Use a Set to dedupe by source_external_id (in case freshly inserted rows aren't visible yet)
  const seen = new Set<string>();
  const merged = [...existingFills, ...allParsedFills].filter((f) => {
    if (seen.has(f.source_external_id)) return false;
    seen.add(f.source_external_id); return true;
  });

  const trades = aggregateFillsToTrades(merged as any);

  // Build trade rows and upsert by stable identity (we use source_external_id = symbol|opened_at|side|opening_fill_id)
  const tradeRows = trades.map((t) => ({
    owner_type: "user",
    owner_id: user.id,
    collection_id: tradesCollId,
    data: {
      [tradesFieldsByName["Symbol"]]: t.symbol,
      [tradesFieldsByName["Side"]]: t.side,
      [tradesFieldsByName["Opened at"]]: t.opened_at,
      [tradesFieldsByName["Closed at"]]: t.closed_at,
      [tradesFieldsByName["Hold duration (s)"]]: t.hold_duration_seconds,
      [tradesFieldsByName["Quantity"]]: t.total_quantity,
      [tradesFieldsByName["Avg entry price"]]: { amount: t.avg_entry_price, currency_code: t.currency_code },
      [tradesFieldsByName["Avg exit price"]]: { amount: t.avg_exit_price, currency_code: t.currency_code },
      [tradesFieldsByName["Gross P&L"]]: { amount: t.gross_pnl, currency_code: t.currency_code },
      [tradesFieldsByName["Fees"]]: { amount: t.fees, currency_code: t.currency_code },
      [tradesFieldsByName["Net P&L"]]: { amount: t.net_pnl, currency_code: t.currency_code },
      [tradesFieldsByName["Currency"]]: t.currency_code,
    },
    source: `connection:${conn.id}`,
    source_external_id: `${t.symbol}|${t.opened_at}|${t.side}|${t.opening_fill_id}`,
  }));

  const { error: tradesErr, count: tradesAdded } = await supabase
    .from("collection_rows")
    .upsert(tradeRows, { onConflict: "owner_type,owner_id,collection_id,source_external_id", count: "exact" });
  if (tradesErr) {
    await recordImport(supabase, user.id, conn.id, file.name, "partial", tradesErr.message);
    return Err("TRADES_UPSERT_FAILED", tradesErr.message);
  }

  await recordImport(supabase, user.id, conn.id, file.name, "parsed", null,
    { fills_added: fillsAdded ?? 0, rows_skipped_unsupported: parsed.metadata.rowsSkipped, pipeline_rows_created: tradesAdded ?? 0 });

  revalidatePath("/", "layout");
  return Result({ fillsCollId, tradesCollId, fillsAdded: fillsAdded ?? 0, tradesAdded: tradesAdded ?? 0 });
}

// --- helpers ---

async function ensureSystemCollections(supabase: any, userId: string, conn: any): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const spec of conn.producedCollections) {
    // Find or create the collection
    let { data: existing } = await supabase
      .from("collections")
      .select("id")
      .eq("owner_type", "user")
      .eq("owner_id", userId)
      .eq("managed_by_connection", conn.id)
      .eq("name", spec.name)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) {
      const { data: created } = await supabase.from("collections").insert({
        owner_type: "user", owner_id: userId, name: spec.name,
        is_system: true, managed_by_connection: conn.id,
      }).select("id").single();
      existing = created;

      // Insert system fields
      const fieldsRows = spec.fields.map((f: any, idx: number) => ({
        owner_type: "user", owner_id: userId, collection_id: created.id,
        name: f.name, type: f.type, options: f.options ?? [], config: f.config ?? {},
        is_system: true, sort_index: (idx + 1) * 1000,
      }));
      await supabase.from("collection_fields").insert(fieldsRows);

      // Default view
      await supabase.from("collection_views").insert({
        owner_type: "user", owner_id: userId, collection_id: created.id,
        name: "Default view", type: "list", config: { sort: [], filters: [], visibleFields: [] }, is_default: true,
      });

      // Page (only on first ensure — same applies to subsequent connection produces)
      const { data: lastPage } = await supabase.from("pages")
        .select("sort_index").eq("owner_type", "user").eq("owner_id", userId)
        .is("deleted_at", null).order("sort_index", { ascending: false }).limit(1).maybeSingle();
      const sort_index = (lastPage?.sort_index ?? 0) + 1000;
      await supabase.from("pages").insert({
        owner_type: "user", owner_id: userId,
        title: spec.name, page_type: "collection", collection_id: created.id, sort_index,
      });
    }
    result[spec.name] = existing.id;
  }
  return result;
}

async function loadFieldsByName(supabase: any, collectionId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from("collection_fields").select("id, name").eq("collection_id", collectionId);
  return Object.fromEntries((data ?? []).map((f: any) => [f.name, f.id]));
}

function mapRowToData(row: any, fieldsByName: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, id] of Object.entries(fieldsByName)) {
    if (name in row) out[id] = row[name];
  }
  return out;
}

async function recordImport(
  supabase: any, userId: string, connId: string, filename: string, status: string,
  errorMessage: string | null,
  counts: Partial<{ fills_added: number; rows_skipped_duplicate: number; rows_skipped_unsupported: number; pipeline_rows_created: number; pipeline_rows_updated: number }> = {},
) {
  await supabase.from("connection_imports").insert({
    owner_type: "user", owner_id: userId, connection: connId, filename, status, error_message: errorMessage,
    rows_added: counts.fills_added ?? 0,
    rows_skipped_duplicate: counts.rows_skipped_duplicate ?? 0,
    rows_skipped_unsupported: counts.rows_skipped_unsupported ?? 0,
    pipeline_rows_created: counts.pipeline_rows_created ?? 0,
    pipeline_rows_updated: counts.pipeline_rows_updated ?? 0,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/actions/import.ts
git commit -m "feat(actions): runImport orchestrates parse + ensure collections + aggregate"
```

---

### Task 7: ImportSheet UI

**Files:** `apps/web/components/connections/ImportSheet.tsx`

- [ ] **Step 1: Write**

```tsx
// apps/web/components/connections/ImportSheet.tsx
"use client";
import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { toast } from "sonner";
import { runImport } from "@/actions/import";
import { connections } from "@/lib/connections";
import { useRouter } from "next/navigation";

export function ImportSheet({ defaultConnectionId, children }: { defaultConnectionId?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(defaultConnectionId ?? connections[0].id);
  const [tz, setTz] = useState("America/New_York");
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("connectionId", connectionId);
    fd.set("file", file);
    fd.set("settings", JSON.stringify({ sourceTimezone: tz }));
    startTransition(async () => {
      const result = await runImport(fd);
      if (!result.ok) { toast.error(result.error.message); return; }
      toast.success(`Imported ${result.data.fillsAdded} fills, created ${result.data.tradesAdded} trades.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>Import data</SheetTitle></SheetHeader>
        <FieldGroup className="py-4">
          <Field>
            <FieldLabel>Connection</FieldLabel>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Source timezone</FieldLabel>
            <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/New_York" />
          </Field>
          <Field>
            <FieldLabel>CSV file</FieldLabel>
            <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button onClick={submit} disabled={!file || isPending}>
            {isPending ? "Importing…" : "Import"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/connections/ImportSheet.tsx
git commit -m "feat(connections): ImportSheet for connection-driven file uploads"
```

---

### Task 8: Wire Import button on collection pages + NewPageMenu

**Files:**
- Modify: `apps/web/components/collection/CollectionListView.tsx`
- Modify: `apps/web/components/sidebar/NewPageMenu.tsx`

- [ ] **Step 1: Add Import button to collection page**

In `CollectionListView.tsx`, modify the header to render an Import button for collections produced by a connection:

```tsx
import { ImportSheet } from "@/components/connections/ImportSheet";
import { Upload } from "lucide-react";

// Inside the JSX, in the header row, replace the existing button row:
<div className="flex gap-2 mb-3">
  {/* existing Sort + Filter buttons */}
  {(collection as any).managed_by_connection && (
    <ImportSheet defaultConnectionId={(collection as any).managed_by_connection}>
      <Button variant="outline" size="sm">
        <Upload data-icon="inline-start" /> Import
      </Button>
    </ImportSheet>
  )}
</div>
```

> **Note:** `managed_by_connection` is on the `collections` row but not currently passed to the view. Update the page query in `apps/web/app/(app)/c/[pageId]/page.tsx` to fetch it and forward.

- [ ] **Step 2: Update NewPageMenu — enable Import data submenu**

Replace the disabled "Importers ship in Plan 4" item with a real menu:

```tsx
import { ImportSheet } from "@/components/connections/ImportSheet";
import { connections } from "@/lib/connections";

// Inside the menu:
<DropdownMenuLabel>Connections</DropdownMenuLabel>
{connections.map((c) => (
  <ImportSheet key={c.id} defaultConnectionId={c.id}>
    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
      Import — {c.displayName}
    </DropdownMenuItem>
  </ImportSheet>
))}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components
git commit -m "feat(connections): Import button on collections + + New page → Import data"
```

---

### Task 9: Templates infrastructure

**Files:**
- Create: `apps/web/lib/templates/types.ts`
- Create: `apps/web/lib/templates/index.ts`

- [ ] **Step 1: Write Template types**

```ts
// apps/web/lib/templates/types.ts
export type CollectionRequirement = { name: string; managed_by_connection: string };

export type PageTemplate =
  | {
      id: string;
      name: string;
      description: string;
      emoji?: string;
      pageType: "dashboard";
      // Plate document with placeholder block IDs to be substituted on instantiate
      document: any;
      requiresCollections: CollectionRequirement[];
    }
  | {
      id: string;
      name: string;
      description: string;
      emoji?: string;
      pageType: "collection";
      collection: { name: string; fields: Array<{ name: string; type: string }> };
      requiresCollections?: never;
    };
```

- [ ] **Step 2: Write registry**

```ts
// apps/web/lib/templates/index.ts
import type { PageTemplate } from "./types";
import { performanceDashboard } from "./trading-performance-dashboard";
import { dailyJournal } from "./trading-daily-journal";
import { weeklyReview } from "./trading-weekly-review";

export const templates: PageTemplate[] = [
  performanceDashboard,
  dailyJournal,
  weeklyReview,
];
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/templates
git commit -m "feat(templates): registry skeleton"
```

---

### Task 10: Trading Performance Dashboard template

**Files:** `apps/web/lib/templates/trading-performance-dashboard.ts`

- [ ] **Step 1: Write**

```ts
// apps/web/lib/templates/trading-performance-dashboard.ts
import type { PageTemplate } from "./types";

export const performanceDashboard: PageTemplate = {
  id: "trading-performance-dashboard",
  name: "Performance Dashboard",
  description: "KPIs, equity curve, P&L by symbol, recent trades — for IBKR-imported Trades.",
  emoji: "📊",
  pageType: "dashboard",
  requiresCollections: [{ name: "Trades", managed_by_connection: "ibkr-activity-statement" }],
  document: [
    { type: "h1", children: [{ text: "Performance Dashboard" }] },
    { type: "p", children: [{ text: "Top-line numbers, then breakdowns." }] },
    {
      type: "card",
      children: [{ text: "" }],
      props: {
        // collectionId injected at instantiate time when we know the user's Trades collection ID
        collectionId: "__TRADES__",
        metric: { kind: "sum", fieldId: "__TRADES_NETPNL__" },
        format: "currency",
        dateRange: "all",
      },
    },
    {
      type: "card",
      children: [{ text: "" }],
      props: { collectionId: "__TRADES__", metric: { kind: "count" }, format: "number", dateRange: "all" },
    },
    { type: "h2", children: [{ text: "Equity curve" }] },
    {
      type: "chart",
      children: [{ text: "" }],
      props: {
        collectionId: "__TRADES__",
        chartType: "line",
        metric: { kind: "sum", fieldId: "__TRADES_NETPNL__" },
        groupByFieldId: "__TRADES_CLOSEDAT__",
        title: "Net P&L by close date",
      },
    },
    { type: "h2", children: [{ text: "P&L by symbol" }] },
    {
      type: "chart",
      children: [{ text: "" }],
      props: {
        collectionId: "__TRADES__",
        chartType: "bar",
        metric: { kind: "sum", fieldId: "__TRADES_NETPNL__" },
        groupByFieldId: "__TRADES_SYMBOL__",
        title: "Net P&L by symbol",
      },
    },
    { type: "h2", children: [{ text: "Recent trades" }] },
    {
      type: "data-table",
      children: [{ text: "" }],
      props: { collectionId: "__TRADES__", visibleFields: [], pageSize: 25, title: "Recent trades" },
    },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/templates/trading-performance-dashboard.ts
git commit -m "feat(templates): Performance Dashboard"
```

---

### Task 11: Daily Journal + Weekly Review templates

**Files:**
- `apps/web/lib/templates/trading-daily-journal.ts`
- `apps/web/lib/templates/trading-weekly-review.ts`

- [ ] **Step 1: Daily Journal**

```ts
// apps/web/lib/templates/trading-daily-journal.ts
import type { PageTemplate } from "./types";

export const dailyJournal: PageTemplate = {
  id: "trading-daily-journal",
  name: "Daily Journal",
  description: "Free-form daily entry plus a quick stats card and today's trades.",
  emoji: "📓",
  pageType: "dashboard",
  requiresCollections: [{ name: "Trades", managed_by_connection: "ibkr-activity-statement" }],
  document: [
    { type: "h1", children: [{ text: "Daily Journal" }] },
    { type: "p", children: [{ text: "How was today? What worked, what didn't?" }] },
    { type: "h2", children: [{ text: "Today's trades" }] },
    {
      type: "data-table",
      children: [{ text: "" }],
      props: { collectionId: "__TRADES__", visibleFields: [], pageSize: 50 },
    },
    { type: "h2", children: [{ text: "Notes" }] },
    { type: "p", children: [{ text: "" }] },
  ],
};
```

- [ ] **Step 2: Weekly Review**

```ts
// apps/web/lib/templates/trading-weekly-review.ts
import type { PageTemplate } from "./types";

export const weeklyReview: PageTemplate = {
  id: "trading-weekly-review",
  name: "Weekly Review",
  description: "Recap of the trading week with KPIs and reflection prompts.",
  emoji: "📅",
  pageType: "dashboard",
  requiresCollections: [{ name: "Trades", managed_by_connection: "ibkr-activity-statement" }],
  document: [
    { type: "h1", children: [{ text: "Weekly Review" }] },
    { type: "h2", children: [{ text: "How did I do this week?" }] },
    {
      type: "card",
      children: [{ text: "" }],
      props: { collectionId: "__TRADES__", metric: { kind: "sum", fieldId: "__TRADES_NETPNL__" }, format: "currency", dateRange: "7d" },
    },
    {
      type: "card",
      children: [{ text: "" }],
      props: { collectionId: "__TRADES__", metric: { kind: "count" }, format: "number", dateRange: "7d" },
    },
    { type: "h2", children: [{ text: "What worked?" }] },
    { type: "p", children: [{ text: "" }] },
    { type: "h2", children: [{ text: "What didn't work?" }] },
    { type: "p", children: [{ text: "" }] },
    { type: "h2", children: [{ text: "Plan for next week" }] },
    { type: "p", children: [{ text: "" }] },
  ],
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/templates
git commit -m "feat(templates): Daily Journal and Weekly Review"
```

---

### Task 12: `applyTemplate` Server Action (with placeholder substitution)

**Files:** `apps/web/actions/templates.ts`

- [ ] **Step 1: Write**

```ts
// apps/web/actions/templates.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { templates } from "@/lib/templates";

const Result = <T>(data: T) => ({ ok: true as const, data });
const Err = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

const ApplyTemplateSchema = z.object({ templateId: z.string() });

export async function applyTemplate(input: z.infer<typeof ApplyTemplateSchema>) {
  const parsed = ApplyTemplateSchema.safeParse(input);
  if (!parsed.success) return Err("INVALID_INPUT", parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Err("UNAUTHENTICATED", "Sign in.");

  const tpl = templates.find((t) => t.id === parsed.data.templateId);
  if (!tpl) return Err("UNKNOWN_TEMPLATE", "Template not found.");

  if (tpl.pageType !== "dashboard") return Err("NOT_IMPLEMENTED", "Only dashboard templates in v1.");

  // Resolve required collections; if missing → error
  const subs: Record<string, string> = {};
  for (const req of tpl.requiresCollections) {
    const { data } = await supabase
      .from("collections")
      .select("id, name")
      .eq("owner_type", "user").eq("owner_id", user.id)
      .eq("managed_by_connection", req.managed_by_connection)
      .eq("name", req.name)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return Err("MISSING_COLLECTION", `This template needs the ${req.name} collection — import data first.`);
    subs[`__${req.name.toUpperCase()}__`] = data.id;
    // Also resolve some standard field placeholders for trading templates
    if (req.name === "Trades") {
      const { data: fields } = await supabase
        .from("collection_fields").select("id, name").eq("collection_id", data.id);
      const byName = (n: string) => fields?.find((f) => f.name === n)?.id ?? "";
      subs["__TRADES__"] = data.id;
      subs["__TRADES_NETPNL__"] = byName("Net P&L");
      subs["__TRADES_SYMBOL__"] = byName("Symbol");
      subs["__TRADES_CLOSEDAT__"] = byName("Closed at");
    }
  }

  const document = substitutePlaceholders(tpl.document, subs);

  // Compute next sort_index
  const { data: lastPage } = await supabase.from("pages")
    .select("sort_index").eq("owner_type", "user").eq("owner_id", user.id)
    .is("deleted_at", null).order("sort_index", { ascending: false }).limit(1).maybeSingle();
  const sort_index = (lastPage?.sort_index ?? 0) + 1000;

  const { data: page, error } = await supabase.from("pages").insert({
    owner_type: "user", owner_id: user.id,
    title: tpl.name, emoji: tpl.emoji ?? null,
    page_type: "dashboard", document, sort_index,
  }).select("id").single();
  if (error) return Err("CREATE_FAILED", error.message);

  revalidatePath("/", "layout");
  return Result({ id: page.id });
}

function substitutePlaceholders(value: any, subs: Record<string, string>): any {
  if (typeof value === "string") {
    return subs[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => substitutePlaceholders(v, subs));
  }
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substitutePlaceholders(v, subs);
    }
    return out;
  }
  return value;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/actions/templates.ts
git commit -m "feat(actions): applyTemplate with placeholder substitution"
```

---

### Task 13: Wire Apply template into NewPageMenu

**Files:** `apps/web/components/sidebar/NewPageMenu.tsx`

- [ ] **Step 1: Replace the disabled "Templates ship in Plan 4" item**

```tsx
import { templates } from "@/lib/templates";
import { applyTemplate } from "@/actions/templates";

// Inside the menu:
<DropdownMenuLabel>From template</DropdownMenuLabel>
{templates.map((t) => (
  <DropdownMenuItem
    key={t.id}
    onClick={() => startTransition(async () => {
      const result = await applyTemplate({ templateId: t.id });
      if (!result.ok) { toast.error(result.error.message); return; }
      router.push(`/p/${result.data.id}`);
    })}
  >
    {t.emoji} {t.name}
  </DropdownMenuItem>
))}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/sidebar/NewPageMenu.tsx
git commit -m "feat(sidebar): + New page → Apply template wired up"
```

---

### Task 14: Settings → Connections page

**Files:**
- Create: `apps/web/app/(app)/settings/layout.tsx`
- Create: `apps/web/app/(app)/settings/connections/page.tsx`
- Create: `apps/web/components/connections/ConnectionCard.tsx`

- [ ] **Step 1: Settings layout (sidebar nav)**

```tsx
// apps/web/app/(app)/settings/layout.tsx
import Link from "next/link";

const tabs = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/connections", label: "Connections" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-8 max-w-5xl mx-auto py-8">
      <nav className="flex flex-col gap-1">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="px-3 py-2 rounded text-sm hover:bg-muted">
            {t.label}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: ConnectionCard**

```tsx
// apps/web/components/connections/ConnectionCard.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@workspace/ui/components/table";
import { format } from "date-fns";
import { ImportSheet } from "./ImportSheet";
import { Button } from "@workspace/ui/components/button";
import type { Connection } from "@/lib/connections/types";

export function ConnectionCard({
  connection, history, isConnected,
}: {
  connection: Connection<any>;
  history: Array<{ filename: string; imported_at: string; rows_added: number; status: string; error_message: string | null }>;
  isConnected: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{connection.displayName}</CardTitle>
            <CardDescription>{connection.description}</CardDescription>
          </div>
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Not yet imported"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <ImportSheet defaultConnectionId={connection.id}>
            <Button size="sm">Import now</Button>
          </ImportSheet>
        </div>
        {history.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{h.filename}</TableCell>
                  <TableCell className="text-sm">{format(new Date(h.imported_at), "PPp")}</TableCell>
                  <TableCell className="text-sm tabular-nums">{h.rows_added}</TableCell>
                  <TableCell>
                    <Badge variant={h.status === "parsed" ? "default" : h.status === "partial" ? "secondary" : "destructive"}>
                      {h.status}
                    </Badge>
                    {h.error_message && <span className="text-xs text-muted-foreground ml-2">{h.error_message}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Connections page**

```tsx
// apps/web/app/(app)/settings/connections/page.tsx
import { connections } from "@/lib/connections";
import { createClient } from "@/lib/supabase/server";
import { ConnectionCard } from "@/components/connections/ConnectionCard";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: history } = await supabase
    .from("connection_imports")
    .select("connection, filename, imported_at, rows_added, status, error_message")
    .eq("owner_type", "user").eq("owner_id", user!.id)
    .order("imported_at", { ascending: false });

  const byConn = (id: string) => (history ?? []).filter((h) => h.connection === id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold mb-2">Connections</h1>
      <p className="text-sm text-muted-foreground mb-6">Sources that produce collections in your workspace.</p>
      {connections.map((c) => (
        <ConnectionCard
          key={c.id}
          connection={c}
          history={byConn(c.id) as any}
          isConnected={byConn(c.id).some((h) => h.status === "parsed")}
        />
      ))}
      <p className="text-sm text-muted-foreground mt-8">More connectors coming soon — Schwab, Fidelity, Plaid, generic CSV.</p>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/settings apps/web/components/connections/ConnectionCard.tsx
git commit -m "feat(settings): Connections page with cards and import history"
```

---

### Task 15: Seed CSV + script

**Files:**
- Create: `seed/sample-activity-statement.csv`
- Create: `seed/seed.ts`
- Modify: root `package.json`

- [ ] **Step 1: Create the sample CSV**

```csv
Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U1234567
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,TradeID
Trades,Data,Execution,Stocks,USD,AAPL,"2025-02-01, 09:32:14",100,180.50,-1.00,T0001
Trades,Data,Execution,Stocks,USD,AAPL,"2025-02-01, 14:45:00",-100,184.20,-1.00,T0002
Trades,Data,Execution,Stocks,USD,NVDA,"2025-02-03, 10:00:00",50,720.00,-1.00,T0003
Trades,Data,Execution,Stocks,USD,NVDA,"2025-02-04, 11:30:00",-50,745.00,-1.00,T0004
Trades,Data,Execution,Stocks,USD,SPY,"2025-02-05, 09:35:00",-200,495.00,-2.00,T0005
Trades,Data,Execution,Stocks,USD,SPY,"2025-02-05, 15:50:00",200,491.00,-2.00,T0006
Trades,Data,Execution,Stocks,USD,TSLA,"2025-02-06, 09:45:00",30,200.00,-1.00,T0007
Trades,Data,Execution,Stocks,USD,TSLA,"2025-02-06, 13:00:00",-30,196.00,-1.00,T0008
Trades,Data,Execution,Stocks,USD,MSFT,"2025-02-10, 10:00:00",50,400.00,-1.00,T0009
Trades,Data,Execution,Stocks,USD,MSFT,"2025-02-10, 11:00:00",50,402.00,-1.00,T0010
Trades,Data,Execution,Stocks,USD,MSFT,"2025-02-10, 15:00:00",-100,405.00,-2.00,T0011
Trades,Data,Execution,Stocks,USD,AAPL,"2025-02-12, 09:32:14",100,182.00,-1.00,T0012
Trades,Data,Execution,Stocks,USD,AAPL,"2025-02-12, 11:32:14",-200,184.00,-1.00,T0013
Trades,Data,Execution,Stocks,USD,AAPL,"2025-02-12, 13:32:14",100,183.50,-1.00,T0014
Trades,SubTotal,,Stocks,USD,,,,,0,-15.00,
Trades,Total,,,USD,,,,,0,-15.00,
Open Positions,Header,Asset Category,Symbol,Quantity
Open Positions,Data,Stocks,,0
```

> Note row T0013: this is a **flip** (selling 200 when long 100 from T0012 means closing the long and opening a short of 100). T0014 then closes the short. Tests this code path.

- [ ] **Step 2: Write seed script**

```ts
// seed/seed.ts
// Run with: pnpm seed
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL ?? "seed@example.com";
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? "supersecure123";
const RESET = process.argv.includes("--reset");

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  // Find or create the seed user
  let { data: { users } } = await admin.auth.admin.listUsers();
  let user = users.find((u) => u.email === SEED_USER_EMAIL);
  if (!user) {
    const { data } = await admin.auth.admin.createUser({
      email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD, email_confirm: true,
    });
    user = data.user!;
  }

  if (RESET) {
    // Wipe seed user's collection_rows that came from connection imports
    await admin.from("collection_rows").delete()
      .eq("owner_id", user.id).eq("source", "connection:ibkr-activity-statement");
  }

  // Sign in as the user (via password) to call runImport with their JWT — easier path:
  // here we shortcut and call the importer logic directly. We replicate the upsert.
  const csvPath = path.join(__dirname, "sample-activity-statement.csv");
  const csv = fs.readFileSync(csvPath);

  // Use Supabase storage as a transport: we just call the public Server Action via fetch
  // OR: replicate the import logic here. For simplicity, call the action via HTTP.
  // For local dev we recommend manually signing in once and uploading via the UI.
  console.log(`Seed user: ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD}`);
  console.log(`Sign in via http://localhost:3000/sign-in and import:`);
  console.log(`  ${csvPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> **Note:** A full programmatic import-from-script requires either replicating the importer logic in this script or running an authenticated HTTP request. For v1 we keep `pnpm seed` simple: it creates the seed user and tells you to upload the CSV via the UI. A fully automated seed is a v2 polish item.

- [ ] **Step 3: Add scripts**

```json
// root package.json scripts
{
  "seed": "tsx seed/seed.ts",
  "seed:reset": "tsx seed/seed.ts --reset"
}
```

```bash
pnpm add -D tsx dotenv -w
```

- [ ] **Step 4: Commit**

```bash
git add seed/ package.json pnpm-lock.yaml
git commit -m "chore: seed CSV + helper script"
```

---

### Task 16: E2E — import IBKR CSV → see populated dashboards

**Files:** `tests/e2e/import.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/import.spec.ts
import { test, expect } from "@playwright/test";
import path from "node:path";

test("import IBKR sample CSV → Trades collection populated", async ({ page }) => {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);

  // Go to + New page → Import
  await page.click("button:has-text('New page')");
  await page.click("text=Import — Interactive Brokers");

  // Upload sample
  const file = path.join(__dirname, "../../seed/sample-activity-statement.csv");
  await page.setInputFiles('input[type="file"]', file);
  await page.click("button:has-text('Import')");

  // Wait for the success toast
  await expect(page.locator(".sonner-toast")).toContainText(/Imported \d+ fills/);

  // Sidebar should now show Fills + Trades
  await expect(page.locator("text=Fills")).toBeVisible();
  await expect(page.locator("text=Trades")).toBeVisible();

  // Open Trades, verify rows present
  await page.click("text=Trades");
  await page.waitForURL(/\/c\//);
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
});
```

- [ ] **Step 2: Run + commit**

```bash
supabase start
pnpm test:e2e tests/e2e/import.spec.ts
git add tests/e2e/import.spec.ts
git commit -m "test(e2e): IBKR import populates Trades collection"
git push
gh run watch --repo Alumicraft/backdesk
```

---

## Plan 4 — Done. What you have now

- IBKR Activity Statement CSV import (timezone-aware, dedupe, audit log)
- Round-trip aggregator handling scale-in/out and position flips
- Fills + Trades collections auto-created on first import
- Three trading templates (Performance Dashboard, Daily Journal, Weekly Review)
- + New page → Apply template / Import data
- Settings → Connections page with import history
- E2E for the full happy path

## Pre-execution refinement notes (read before Plan 5)

After executing Plan 4, before starting Plan 5:
1. Verify the trading templates render correctly with real imported data — placeholder substitution may need adjustment based on actual field IDs.
2. If aggregator math felt fragile, write more unit tests before Plan 5 (Plan 5 doesn't touch math but you'll appreciate the safety net).
3. Re-read [Plan 5 file](./2026-04-28-backdesk-5-polish.md). Plan 5 adds Cmd+K, full settings UI, theming, accessibility pass — none of which depend on the aggregator, but they assume Plan 4's connections page exists.
4. Note any UX rough edges from using the app end-to-end — Plan 5's polish tasks may need to be reordered to address them.
