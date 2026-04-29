"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
