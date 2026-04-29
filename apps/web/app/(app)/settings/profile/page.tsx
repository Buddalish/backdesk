import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/settings/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, avatar_path")
    .eq("user_id", user.id)
    .single();

  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_path, 60 * 60 * 24 * 7);
    avatarUrl = signed?.signedUrl ?? null;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <ProfileForm
        initialName={profile?.display_name ?? ""}
        initialTimezone={profile?.timezone ?? "UTC"}
        avatarUrl={avatarUrl}
      />
    </div>
  );
}
