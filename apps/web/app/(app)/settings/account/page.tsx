import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "@/components/settings/AccountForm";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Account</h1>
      <AccountForm email={user.email ?? ""} />
    </div>
  );
}
