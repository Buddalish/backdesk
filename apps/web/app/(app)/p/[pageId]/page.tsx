import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/pages/PageHeader";
import { EmptyDashboard } from "@/components/empty/EmptyDashboard";

export default async function DashboardPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("id, title, emoji, page_type")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!page || page.page_type !== "dashboard") notFound();

  return (
    <div className="max-w-3xl mx-auto py-8">
      <PageHeader pageId={page.id} initialTitle={page.title} emoji={page.emoji} />
      <EmptyDashboard pageId={page.id} />
    </div>
  );
}
