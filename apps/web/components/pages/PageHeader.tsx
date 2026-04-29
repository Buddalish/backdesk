"use client";
import { useState, useTransition } from "react";
import { renamePage } from "@/actions/pages";
import { toast } from "sonner";

export function PageHeader({
  pageId,
  initialTitle,
  emoji,
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
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-3xl font-semibold"
        >
          {title}
        </button>
      )}
    </div>
  );
}
