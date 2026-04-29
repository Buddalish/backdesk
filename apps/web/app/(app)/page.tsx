import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Backdesk</CardTitle>
          <CardDescription>
            Pages are how you organize your work. Create a dashboard for visualizations, a collection
            for structured data, or import data from a connection. (Page creation ships in Plan 2.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once you've added a page, it'll show up in the sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
