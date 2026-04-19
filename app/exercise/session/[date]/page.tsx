import Link from "next/link";

import { getSession } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatWeight(weight: number | null | undefined) {
  return typeof weight === "number" ? `${weight.toFixed(1)} kg` : "—";
}

export default async function SessionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const response = await getSession(date);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/exercise" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session: {date}</CardTitle>
          <CardDescription>All exercises logged for this training date.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercise</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Sets</TableHead>
                  <TableHead>Reps</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.data.length > 0 ? (
                  response.data.map((entry) => (
                    <TableRow key={`${entry.exercise}-${entry.file}`}>
                      <TableCell className="font-medium">{entry.exercise ?? "—"}</TableCell>
                      <TableCell>{formatWeight(entry.weight)}</TableCell>
                      <TableCell>{entry.sets ?? "—"}</TableCell>
                      <TableCell>{entry.reps ?? "—"}</TableCell>
                      <TableCell>{entry.difficulty || "—"}</TableCell>
                      <TableCell>{entry.session || "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No exercises found for this date.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
