"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { changePageEmoji } from "@/actions/pages";

// emoji-mart's Picker is browser-only — load via next/dynamic with ssr: false.
const Picker = dynamic(
  () => import("@emoji-mart/react").then((m) => m.default),
  { ssr: false }
);

export function PageEmojiPicker({
  pageId,
  current,
}: {
  pageId: string;
  current: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="text-3xl hover:bg-muted rounded p-1 transition leading-none"
        aria-label="Change page emoji"
      >
        {current ?? "📄"}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto border-0 bg-transparent shadow-none">
        <Picker
          data={data}
          onEmojiSelect={(e: { native: string }) => {
            void changePageEmoji({ pageId, emoji: e.native });
            setOpen(false);
          }}
          theme="auto"
        />
      </PopoverContent>
    </Popover>
  );
}
