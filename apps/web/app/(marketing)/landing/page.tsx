import Link from "next/link";
import { Button } from "@workspace/ui/components/button";

export default function MarketingHome() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold">Backdesk</h1>
      <p className="text-lg text-muted-foreground max-w-md">
        A workspace for your data. Pages of blocks, collections, connections.
      </p>
      <div className="flex gap-3">
        <Button asChild><Link href="/sign-up">Create account</Link></Button>
        <Button asChild variant="outline"><Link href="/sign-in">Sign in</Link></Button>
      </div>
    </div>
  );
}
