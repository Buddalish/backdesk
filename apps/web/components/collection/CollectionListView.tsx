"use client";
import { useState, useTransition } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CollectionHeader } from "./CollectionHeader";
import { EmptyCollection } from "./EmptyCollection";
import { renderCell } from "./cells";
import { addRow, updateRowField } from "@/actions/collections";
import type { Field, Row } from "@/lib/collections/types";

export function CollectionListView({
  page, collection, view, initialRows,
}: {
  page: { id: string; title: string; emoji: string | null };
  collection: { id: string; name: string; fields: Field[] };
  view: { id: string; config: { sort?: unknown; filters?: unknown; visibleFields?: string[] } };
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [, startTransition] = useTransition();
  const visible = view?.config?.visibleFields?.length
    ? collection.fields.filter((f) => view.config.visibleFields!.includes(f.id))
    : collection.fields;

  function handleAddRow() {
    startTransition(async () => {
      const result = await addRow({ collectionId: collection.id, data: {} });
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

      {rows.length === 0 && visible.length === 0 ? (
        <EmptyCollection onAddRow={handleAddRow} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {visible.map((f) => <TableHead key={f.id}>{f.name}</TableHead>)}
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => { window.prompt("Add field — use AddFieldButton in Task 17"); }}>
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
                    {renderCell(f, row.data[f.id] ?? null, async (v) => {
                      setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, data: { ...r.data, [f.id]: v } } : r));
                      const result = await updateRowField({ rowId: row.id, fieldId: f.id, value: v });
                      if (!result.ok) toast.error(result.error.message);
                    })}
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
