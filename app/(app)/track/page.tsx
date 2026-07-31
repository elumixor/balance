import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTrackData } from "./actions";
import { NowTracking } from "./now-tracking";
import { StartTimer } from "./start-timer";
import { EntryFormDialog } from "./entry-form-dialog";
import { EntryList, type EntryRow } from "./entry-list";

export default async function TrackPage() {
  const { runningEntry, activities, recentEntries, recentActivities, frequentActivities } =
    await getTrackData();

  const entryRows: EntryRow[] = recentEntries.map((e) => ({
    id: e.id,
    activityId: e.activityId,
    activityName: e.activity.name,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    note: e.note,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Track</h1>
        <p className="text-sm text-muted-foreground">
          Start a timer, or log a finished session manually.
        </p>
      </div>

      {runningEntry && (
        <NowTracking
          activityName={runningEntry.activity.name}
          startedAt={runningEntry.startedAt.toISOString()}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{runningEntry ? "Switch activity" : "Start a timer"}</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activities yet — create one in Config first.
              </p>
            ) : (
              <StartTimer
                recentActivities={recentActivities}
                frequentActivities={frequentActivities}
                allActivities={activities}
                hasRunning={!!runningEntry}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Log a finished entry</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Already did something and forgot to start the timer? Add it manually.
            </p>
            <EntryFormDialog activities={activities} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
        </CardHeader>
        <CardContent>
          <EntryList entries={entryRows} activities={activities} />
        </CardContent>
      </Card>
    </div>
  );
}
