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
    startTransition(() => { void reorderPages({ pageIds: next.map((p) => p.id) }); });
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
