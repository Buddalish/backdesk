"use client";
import { useState } from "react";
import { Input } from "@workspace/ui/components/input";

export function NumberCell({
  value, onSave,
}: {
  value: number | null;
  onSave: (value: number | null) => void;
}) {
  const [v, setV] = useState(value === null ? "" : String(value));
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-right tabular-nums w-full min-h-[1.5rem]"
      >
        {value === null ? <span className="text-muted-foreground italic">empty</span> : value.toLocaleString()}
      </button>
    );
  }

  return (
    <Input
      type="number"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = v === "" ? null : Number(v);
        if (n !== value) onSave(n);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
    />
  );
}
