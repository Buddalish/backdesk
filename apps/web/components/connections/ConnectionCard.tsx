"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@workspace/ui/components/table";
import { format } from "date-fns";
import { ImportSheet } from "./ImportSheet";
import { Button } from "@workspace/ui/components/button";
import type { Connection } from "@/lib/connections/types";

type ImportHistoryRow = {
  filename: string | null;
  imported_at: string;
  rows_added: number;
  status: string;
  error_message: string | null;
};

export function ConnectionCard({
  connection,
  history,
  isConnected,
}: {
  connection: Connection<unknown>;
  history: ImportHistoryRow[];
  isConnected: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{connection.displayName}</CardTitle>
            <CardDescription>{connection.description}</CardDescription>
          </div>
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Not yet imported"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <ImportSheet defaultConnectionId={connection.id}>
            <Button size="sm">Import now</Button>
          </ImportSheet>
        </div>
        {history.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{h.filename ?? "—"}</TableCell>
                  <TableCell className="text-sm">{format(new Date(h.imported_at), "PPp")}</TableCell>
                  <TableCell className="text-sm tabular-nums">{h.rows_added}</TableCell>
                  <TableCell>
                    <Badge variant={h.status === "parsed" ? "default" : h.status === "partial" ? "secondary" : "destructive"}>
                      {h.status}
                    </Badge>
                    {h.error_message && <span className="text-xs text-muted-foreground ml-2">{h.error_message}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
