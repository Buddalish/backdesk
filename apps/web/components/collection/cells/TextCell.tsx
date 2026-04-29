"use client";
import { useState } from "react";
import { Input } from "@workspace/ui/components/input";

export function TextCell({
  value, onSave,
}: {
  value: string | null;
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left w-full min-h-[1.5rem] truncate"
      >
        {v || <span className="text-muted-foreground italic">empty</span>}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); if (v !== (value ?? "")) onSave(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
    />
  );
}
