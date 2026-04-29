// apps/web/lib/collections/collection.ts
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Field, Filter, Row, Sort } from "./types";

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
