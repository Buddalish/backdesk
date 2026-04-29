"use client";
import { Button } from "@workspace/ui/components/button";
import { Filter as FilterIcon, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/pages/PageHeader";

export function CollectionHeader({
  pageId,
  title,
  emoji,
  onOpenFilters,
  onOpenSort,
  importSlot,
}: {
  pageId: string;
  title: string;
  emoji: string | null;
  onOpenFilters: () => void;
  onOpenSort: () => void;
  importSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-4 mb-4">
      <PageHeader pageId={pageId} initialTitle={title} emoji={emoji} />
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
