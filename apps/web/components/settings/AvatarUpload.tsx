"use client";
import { useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { createClient } from "@/lib/supabase/browser";
import { updateProfile } from "@/actions/settings";
import { toast } from "sonner";

export function AvatarUpload({
  initialUrl,
  displayName,
}: {
  initialUrl: string | null;
  displayName: string;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in.");
        return;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { data: signed } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      setUrl(signed?.signedUrl ?? null);
      const result = await updateProfile({ avatar_path: path });
      if (!result.ok) toast.error(result.error.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {url && <AvatarImage src={url} alt="" />}
        <AvatarFallback>
          {displayName.slice(0, 2).toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading…" : "Change avatar"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
