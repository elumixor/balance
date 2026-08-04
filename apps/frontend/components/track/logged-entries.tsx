import Plus from "lucide-react-native/icons/plus";
import { View } from "react-native";
import { formatDayHeading } from "../../lib/format";
import type { Activity, Entry } from "../../lib/types";
import { useTheme } from "../../theme";
import { Divider, EmptyState, ListItemIn, Panel, SectionHeader, Text, Touchable } from "../ui";
import type { Split } from "../ui/split-bar";
import { type EntryDraft, EntryEditor } from "./entry-editor";
import { EntryRow } from "./entry-row";
import type { TrackDay } from "./use-track-data";

interface Props {
  days: TrackDay[];
  activities: Activity[];
  editing: string | "new" | null;
  splitsFor: (activityId: string) => Split[];
  onToggleEdit: (entryId: string) => void;
  onStartNew: () => void;
  onCancelEdit: () => void;
  onSave: (entryId: string | "new", draft: EntryDraft) => Promise<void>;
  onDelete: (entry: Entry) => void;
}

/** The Track screen's "Logged" section: entries grouped by day, plus the add-entry affordance. */
export function LoggedEntries({
  days,
  activities,
  editing,
  splitsFor,
  onToggleEdit,
  onStartNew,
  onCancelEdit,
  onSave,
  onDelete,
}: Props) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ marginTop: spacing.xl }}>
      <SectionHeader title="Logged" />

      {days.length === 0 ? (
        <EmptyState title="No entries yet." hint="Start a timer, or add one by hand below." />
      ) : (
        days.map((day) => (
          <View key={day.key} style={{ marginBottom: spacing.md }}>
            <Text role="micro" tone="faint" style={{ marginBottom: 2 }}>
              {formatDayHeading(day.date)}
            </Text>
            {day.items.map((entry, i) => (
              <ListItemIn key={entry.id} index={i}>
                {i > 0 ? <Divider /> : null}
                <EntryRow
                  entry={entry}
                  splits={splitsFor(entry.activityId)}
                  expanded={editing === entry.id}
                  onToggle={() => onToggleEdit(entry.id)}
                  onDelete={() => onDelete(entry)}
                />
                {editing === entry.id ? (
                  <Panel style={{ marginBottom: spacing.md }}>
                    <EntryEditor
                      entry={entry}
                      activities={activities}
                      onCancel={onCancelEdit}
                      onSave={(draft) => onSave(entry.id, draft)}
                    />
                  </Panel>
                ) : null}
              </ListItemIn>
            ))}
          </View>
        ))
      )}

      {editing === "new" ? (
        <Panel style={{ paddingVertical: 0 }}>
          <EntryEditor
            entry={null}
            activities={activities}
            onCancel={onCancelEdit}
            onSave={(draft) => onSave("new", draft)}
          />
        </Panel>
      ) : (
        <Touchable
          onPress={onStartNew}
          disabled={activities.length === 0}
          scaleTo={1}
          accessibilityRole="button"
          accessibilityLabel="Add an entry by hand"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            paddingVertical: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <Plus size={16} color={colors.textMuted} />
          <Text role="label" tone="muted">
            Add an entry
          </Text>
        </Touchable>
      )}
    </View>
  );
}
