"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: { code: "UNAUTHENTICATED", message: "Sign in." } };

  const admin = createAdminClient();

  // User-owned tables use bare `owner_id UUID NOT NULL` with no FK to auth.users,
  // so cascade from auth.admin.deleteUser does NOT reach them — we must delete explicitly.
  const errors: string[] = [];

  // 1. Delete collections — collection_fields, collection_rows, and collection_views all
  //    have `REFERENCES collections(id) ON DELETE CASCADE`, so they are handled automatically.
  const { error: collectionsErr } = await admin
    .from("collections")
    .delete()
    .eq("owner_type", "user")
    .eq("owner_id", user.id);
  if (collectionsErr) errors.push(`collections: ${collectionsErr.message}`);

  // 2. Delete pages — they are owned directly (owner_id); the FK from pages.collection_id
  //    would only cascade if the collection were deleted first, but pages own dashboards too.
  const { error: pagesErr } = await admin
    .from("pages")
    .delete()
    .eq("owner_type", "user")
    .eq("owner_id", user.id);
  if (pagesErr) errors.push(`pages: ${pagesErr.message}`);

  // 3. Delete connection_imports (bare owner_id, no cascading FK).
  const { error: importsErr } = await admin
    .from("connection_imports")
    .delete()
    .eq("owner_type", "user")
    .eq("owner_id", user.id);
  if (importsErr) errors.push(`connection_imports: ${importsErr.message}`);

  // 4. Storage cleanup — avatars bucket.
  const { data: avatarFiles } = await admin.storage.from("avatars").list(user.id);
  if (avatarFiles?.length) {
    const { error: avatarErr } = await admin.storage
      .from("avatars")
      .remove(avatarFiles.map((f) => `${user.id}/${f.name}`));
    if (avatarErr) errors.push(`avatars storage: ${avatarErr.message}`);
  }

  // 5. Storage cleanup — attachments bucket.
  const { data: attachmentFiles } = await admin.storage.from("attachments").list(user.id);
  if (attachmentFiles?.length) {
    const { error: attachErr } = await admin.storage
      .from("attachments")
      .remove(attachmentFiles.map((f) => `${user.id}/${f.name}`));
    if (attachErr) errors.push(`attachments storage: ${attachErr.message}`);
  }

  // 6. Finally delete the auth user — profiles.user_id cascades automatically.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    errors.push(`auth.deleteUser: ${authErr.message}`);
    return {
      ok: false as const,
      error: { code: "DELETE_FAILED", message: errors.join("; ") },
    };
  }

  if (errors.length > 0) {
    return {
      ok: false as const,
      error: {
        code: "PARTIAL_DELETE",
        message: `Account deleted but some data may remain: ${errors.join("; ")}`,
      },
    };
  }

  return { ok: true as const, data: {} };
}
