"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createManualEntry, updateEntry } from "./actions";
import { toDatetimeLocal } from "./format";
import { PlusIcon } from "lucide-react";

type ActivityRef = { id: string; name: string };

export type EditableEntry = {
  id: string;
  activityId: string;
  startedAt: Date | string;
  endedAt: Date | string;
  note: string | null;
};

export function EntryFormDialog({
  activities,
  entry,
  trigger,
}: {
  activities: ActivityRef[];
  /** When provided, the dialog edits this entry instead of creating a new one. */
  entry?: EditableEntry;
  /** Custom trigger element; defaults to a "Log entry" button when omitted. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [activityId, setActivityId] = useState(entry?.activityId ?? "");
  const [startedAt, setStartedAt] = useState(
    entry ? toDatetimeLocal(new Date(entry.startedAt)) : "",
  );
  const [endedAt, setEndedAt] = useState(entry ? toDatetimeLocal(new Date(entry.endedAt)) : "");
  const [note, setNote] = useState(entry?.note ?? "");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setActivityId(entry?.activityId ?? "");
      setStartedAt(entry ? toDatetimeLocal(new Date(entry.startedAt)) : "");
      setEndedAt(entry ? toDatetimeLocal(new Date(entry.endedAt)) : "");
      setNote(entry?.note ?? "");
      setError(null);
    }
    setOpen(nextOpen);
  };

  const submit = () => {
    setError(null);
    if (!activityId || !startedAt || !endedAt) {
      setError("Please fill in activity, start and end time.");
      return;
    }
    startTransition(async () => {
      try {
        const payload = { activityId, startedAt, endedAt, note };
        if (entry) {
          await updateEntry(entry.id, payload);
        } else {
          await createManualEntry(payload);
        }
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button variant="outline" size="sm">
              <PlusIcon />
              Log entry
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit entry" : "Log a finished entry"}</DialogTitle>
          <DialogDescription>
            {entry
              ? "Update this logged time entry."
              : "Add a manually-logged, already-finished activity."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity">Activity</Label>
            <Select value={activityId} onValueChange={(v) => setActivityId(v ?? "")}>
              <SelectTrigger id="activity" className="w-full">
                <SelectValue placeholder="Choose an activity…" />
              </SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startedAt">Start</Label>
              <Input
                id="startedAt"
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endedAt">End</Label>
              <Input
                id="endedAt"
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth remembering about this session…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {entry ? "Save changes" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
