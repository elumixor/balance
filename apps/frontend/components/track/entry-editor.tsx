import { useMemo, useState } from "react";
import { View } from "react-native";
import { formatClock, formatDateInput, formatHoursAndMinutes, parseDateAndClock } from "../../lib/format";
import type { Activity, Entry } from "../../lib/types";
import { useTheme } from "../../theme";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Field, LabelledField } from "../ui/field";
import { Text } from "../ui/text";
import { Touchable } from "../ui/touchable";

export interface EntryDraft {
  activityId: string;
  startedAt: string;
  endedAt: string;
  note: string | null;
}

const NUDGES = [-15, -5, 5, 15];

/**
 * Entries are edited where they live, in the list. Times are two plain fields —
 * a date and a clock — plus nudges, which is faster than a picker for the small
 * corrections people actually make.
 */
export function EntryEditor({
  entry,
  activities,
  onCancel,
  onSave,
}: {
  entry: Entry | null;
  activities: Activity[];
  onCancel: () => void;
  onSave: (draft: EntryDraft) => Promise<void>;
}) {
  const { colors, spacing } = useTheme();
  const start = entry ? new Date(entry.startedAt) : new Date(Date.now() - 30 * 60 * 1000);
  const end = entry?.endedAt ? new Date(entry.endedAt) : new Date();

  const [activityId, setActivityId] = useState(entry?.activityId ?? activities[0]?.id ?? "");
  const [date, setDate] = useState(formatDateInput(start));
  const [startClock, setStartClock] = useState(formatClock(start));
  const [endClock, setEndClock] = useState(formatClock(end));
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    const from = parseDateAndClock(date, startClock);
    const to = parseDateAndClock(date, endClock);
    if (!from || !to) return null;
    // A range that ends before it starts ran past midnight.
    if (to <= from) to.setDate(to.getDate() + 1);
    return { from, to };
  }, [date, startClock, endClock]);

  function nudgeEnd(minutes: number) {
    const to = parseDateAndClock(date, endClock);
    if (!to) return;
    to.setMinutes(to.getMinutes() + minutes);
    setEndClock(formatClock(to));
  }

  async function submit() {
    if (!activityId) return setError("Pick an activity");
    if (!range) return setError("Use YYYY-MM-DD and HH:MM");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        activityId,
        startedAt: range.from.toISOString(),
        endedAt: range.to.toISOString(),
        note: note.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this entry");
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: spacing.lg, paddingVertical: spacing.md }}>
      <LabelledField label="Activity">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 }}>
          {activities.map((activity) => (
            <Chip
              key={activity.id}
              label={activity.name}
              selected={activity.id === activityId}
              onPress={() => setActivityId(activity.id)}
            />
          ))}
        </View>
      </LabelledField>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LabelledField label="Date" style={{ flex: 1.4 }}>
          <Field value={date} onChangeText={setDate} mono placeholder="2026-01-31" />
        </LabelledField>
        <LabelledField label="From" style={{ flex: 1 }}>
          <Field value={startClock} onChangeText={setStartClock} mono align="center" placeholder="09:00" />
        </LabelledField>
        <LabelledField label="To" style={{ flex: 1 }}>
          <Field value={endClock} onChangeText={setEndClock} mono align="center" placeholder="10:30" />
        </LabelledField>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        {NUDGES.map((minutes) => (
          <Touchable
            key={minutes}
            onPress={() => nudgeEnd(minutes)}
            accessibilityRole="button"
            accessibilityLabel={`Change end time by ${minutes} minutes`}
            style={{
              paddingVertical: 5,
              paddingHorizontal: spacing.sm + 2,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text role="dataMicro" tone="muted">
              {minutes > 0 ? `+${minutes}` : minutes}
            </Text>
          </Touchable>
        ))}
        <Text role="dataMicro" tone={range ? "muted" : "danger"} style={{ marginLeft: "auto" }}>
          {range ? formatHoursAndMinutes((range.to.getTime() - range.from.getTime()) / 3_600_000) : "—"}
        </Text>
      </View>

      <LabelledField label="Note">
        <Field value={note} onChangeText={setNote} placeholder="Optional" autoCapitalize="sentences" />
      </LabelledField>

      {error ? (
        <Text role="label" tone="danger">
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
        <Button label="Save" onPress={submit} loading={saving} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
