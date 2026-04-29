// apps/web/app/api/aggregate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Collection, type AggregateMetric } from "@/lib/collections/collection";

type Body = {
  collectionId: string;
  metric: AggregateMetric;
  groupBy?: string[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Body;
  if (!body.collectionId) return NextResponse.json({ error: "collectionId required" }, { status: 400 });

  try {
    const collection = await Collection.load(body.collectionId);
    const result = await collection.aggregate({ metric: body.metric, groupBy: body.groupBy });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
