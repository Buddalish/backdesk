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
