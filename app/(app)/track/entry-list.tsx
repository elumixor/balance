"use client";

import { useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EntryFormDialog } from "./entry-form-dialog";
import { deleteEntry } from "./actions";
import { formatDuration } from "./format";
import { PencilIcon, Trash2Icon } from "lucide-react";

type ActivityRef = { id: string; name: string };

export type EntryRow = {
  id: string;
  activityId: string;
  activityName: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  note: string | null;
};

export function EntryList({
  entries,
  activities,
}: {
  entries: EntryRow[];
  activities: ActivityRef[];
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No entries logged yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Activity</TableHead>
          <TableHead>Start</TableHead>
          <TableHead>End</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Note</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <EntryRowItem key={entry.id} entry={entry} activities={activities} />
        ))}
      </TableBody>
    </Table>
  );
}

function EntryRowItem({ entry, activities }: { entry: EntryRow; activities: ActivityRef[] }) {
  const [isPending, startTransition] = useTransition();

  const start = new Date(entry.startedAt);
  const end = entry.endedAt ? new Date(entry.endedAt) : null;
  const duration = end ? formatDuration(end.getTime() - start.getTime()) : "running…";

  return (
    <TableRow>
      <TableCell className="font-medium">{entry.activityName}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {start.toLocaleString()}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {end ? end.toLocaleString() : "—"}
      </TableCell>
      <TableCell className="font-mono tabular-nums">{duration}</TableCell>
      <TableCell className="max-w-48 truncate text-muted-foreground">{entry.note ?? "—"}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1.5">
          {end && (
            <EntryFormDialog
              activities={activities}
              entry={{
                id: entry.id,
                activityId: entry.activityId,
                startedAt: start,
                endedAt: end,
                note: entry.note,
              }}
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PencilIcon />
                  <span className="sr-only">Edit</span>
                </Button>
              }
            />
          )}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="icon-sm">
                  <Trash2Icon />
                  <span className="sr-only">Delete</span>
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the logged entry for &ldquo;{entry.activityName}
                  &rdquo;. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPending}
                  onClick={() => startTransition(() => deleteEntry(entry.id))}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
