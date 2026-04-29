import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
      <h1 className="text-3xl font-semibold mb-6">
        {page.emoji && <span className="mr-2">{page.emoji}</span>}
        {page.title}
      </h1>
      <EmptyDashboard pageId={page.id} />
    </div>
  );
}
