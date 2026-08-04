import { Square } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { formatClock, formatDuration } from "../../lib/format";
import type { Entry } from "../../lib/types";
import { useTheme } from "../../theme";
import { TimerRing } from "../ring/timer-ring";
import { Button } from "../ui/button";
import { Panel } from "../ui/layout";
import type { Split } from "../ui/split-bar";
import { Text } from "../ui/text";

function useElapsed(startedAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return now - new Date(startedAt).getTime();
}

export function RunningCard({
  entry,
  splits,
  onStop,
  stopping,
}: {
  entry: Entry;
  splits: Split[];
  onStop: () => void;
  stopping: boolean;
}) {
  const { spacing } = useTheme();
  const elapsed = useElapsed(entry.startedAt);

  return (
    <Panel style={{ alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xl }}>
      <TimerRing splits={splits} elapsedMs={elapsed} size={186} thickness={12}>
        <Text role="readout" style={{ fontSize: 32, lineHeight: 38, letterSpacing: -1 }}>
          {formatDuration(elapsed)}
        </Text>
        <Text role="micro" tone="muted">
          since {formatClock(new Date(entry.startedAt))}
        </Text>
      </TimerRing>

      <View style={{ alignItems: "center", gap: 2, paddingHorizontal: spacing.md }}>
        <Text role="heading" numberOfLines={1}>
          {entry.activityName}
        </Text>
        {entry.note ? (
          <Text role="label" tone="muted" numberOfLines={2} style={{ textAlign: "center" }}>
            {entry.note}
          </Text>
        ) : null}
      </View>

      <Button
        label="Stop"
        onPress={onStop}
        loading={stopping}
        icon={(color, size) => <Square color={color} size={size - 3} fill={color} />}
        style={{ alignSelf: "stretch" }}
      />
    </Panel>
  );
}
