import { useMemo, useState } from "react";
import { View } from "react-native";
import type { Activity, Category } from "../../lib/types";
import { useTheme } from "../../theme";
import { restColor } from "../../theme/colors";
import { WeekRing, type RingSegment } from "../ring/week-ring";
import { Button } from "../ui/button";
import { Field, LabelledField } from "../ui/field";
import { Dot } from "../ui/split-bar";
import { Text } from "../ui/text";

export interface ActivityDraft {
  name: string;
  weights: { categoryId: string; weightPercent: number }[];
}

/**
 * An activity is a recipe: one hour of it feeds several categories. The ring is
 * that hour, and the leftover is time the activity doesn't claim for anything.
 */
export function ActivityEditor({
  activity,
  categories,
  onCancel,
  onSave,
}: {
  activity: Activity | null;
  categories: Category[];
  onCancel: () => void;
  onSave: (draft: ActivityDraft) => Promise<void>;
}) {
  const { spacing } = useTheme();
  const [name, setName] = useState(activity?.name ?? "");
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const category of categories) initial[category.id] = 0;
    for (const weight of activity?.weights ?? []) {
      if (weight.categoryId in initial) initial[weight.categoryId] = weight.weightPercent;
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const claimed = useMemo(
    () => categories.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0),
    [categories, weights],
  );
  const free = Math.max(0, 100 - claimed);

  const segments: RingSegment[] = [
    ...categories.map((c) => ({ id: c.id, label: c.name, color: c.color, value: weights[c.id] ?? 0 })),
    { id: "__free__", label: "Unclaimed", color: restColor, value: free },
  ];

  function setWeight(categoryId: string, value: number) {
    setWeights((prev) => ({ ...prev, [categoryId]: Math.max(0, Math.round(value)) }));
  }

  async function submit() {
    if (!name.trim()) return setError("Give it a name");
    if (claimed > 100) return setError("Shares add up to more than one hour");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        weights: categories
          .map((c) => ({ categoryId: c.id, weightPercent: Math.round(weights[c.id] ?? 0) }))
          .filter((w) => w.weightPercent > 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this activity");
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: spacing.lg, paddingVertical: spacing.md }}>
      <LabelledField label="Name">
        <Field value={name} onChangeText={setName} placeholder="Activity name" autoCapitalize="sentences" />
      </LabelledField>

      {categories.length === 0 ? (
        <Text role="label" tone="muted">
          Plan at least one category on the Week tab first.
        </Text>
      ) : (
        <>
          <View style={{ alignItems: "center" }}>
            <View onStartShouldSetResponder={() => true}>
              <WeekRing
                segments={segments}
                onChange={(values) => {
                  const next: Record<string, number> = {};
                  categories.forEach((c, i) => {
                    next[c.id] = Math.round(values[i] ?? weights[c.id] ?? 0);
                  });
                  setWeights(next);
                }}
                size={188}
                thickness={22}
                unit="%"
                centerValue={`${Math.round(claimed)}%`}
                centerLabel="of an hour claimed"
              />
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            {categories.map((category) => (
              <View key={category.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Dot color={category.color} size={9} />
                <Text role="body" style={{ flex: 1 }} numberOfLines={1}>
                  {category.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Field
                    variant="inline"
                    mono
                    align="right"
                    keyboardType="numeric"
                    accessibilityLabel={`${category.name} share`}
                    value={String(weights[category.id] ?? 0)}
                    onChangeText={(value) => {
                      const number = Number(value);
                      if (!Number.isNaN(number)) setWeight(category.id, number);
                    }}
                    style={{ width: 44 }}
                  />
                  <Text role="data" tone="faint">
                    %
                  </Text>
                </View>
              </View>
            ))}
            {free > 0 ? (
              <Text role="micro" tone="faint">
                {free}% stays unclaimed — time that counts as your own.
              </Text>
            ) : null}
          </View>
        </>
      )}

      {error ? (
        <Text role="label" tone="danger">
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label="Save"
          onPress={submit}
          loading={saving}
          disabled={categories.length === 0}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
