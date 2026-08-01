import { useFocusEffect } from "expo-router";
import { Check, Plus, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { WeekRing, type RingSegment } from "../../components/ring/week-ring";
import { ColorPicker } from "../../components/week/color-picker";
import {
  Divider,
  Field,
  GUTTER,
  IconButton,
  ListItemIn,
  LoadError,
  Screen,
  ScreenTitle,
  Skeleton,
  Text,
  Touchable,
} from "../../components/ui";
import { formatHoursAndMinutes } from "../../lib/format";
import { archiveCategory, createCategory, getCategories, updateCategory } from "../../lib/queries";
import type { Category } from "../../lib/types";
import { useTheme } from "../../theme";
import { restColor, swatchPalette } from "../../theme/colors";

const WEEK_HOURS = 168;

type Draft = {
  key: string;
  id: string | null;
  name: string;
  color: string;
  hours: number;
  saved?: { name: string; color: string; hours: number };
};

function nextColor(used: string[]) {
  return swatchPalette.find((c) => !used.includes(c)) ?? swatchPalette[used.length % swatchPalette.length];
}

export default function WeekScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCategories(await getCategories());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your week.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!categories) return;
    setDrafts(
      categories
        .filter((c) => !c.isBuffer)
        .map((c) => ({
          key: c.id,
          id: c.id,
          name: c.name,
          color: c.color,
          hours: c.targetHoursPerWeek,
          saved: { name: c.name, color: c.color, hours: c.targetHoursPerWeek },
        })),
    );
  }, [categories]);

  const restHours = Math.max(0, WEEK_HOURS - drafts.reduce((sum, d) => sum + d.hours, 0));

  const segments: RingSegment[] = [
    ...drafts.map((d) => ({ id: d.key, label: d.name || "Untitled", color: d.color, value: d.hours })),
    { id: "__rest__", label: "Rest + Buffer", color: restColor, value: restHours },
  ];

  // Changes save themselves a moment after you stop moving things.
  useEffect(() => {
    if (saving) return;
    if (drafts.some((d) => !d.name.trim())) return;
    const changed = drafts.filter(
      (d) => !d.saved || d.saved.name !== d.name || d.saved.color !== d.color || d.saved.hours !== d.hours,
    );
    if (changed.length === 0) return;

    const timeout = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        for (const draft of changed) {
          const payload = { name: draft.name, color: draft.color, targetHoursPerWeek: draft.hours };
          if (draft.id) await updateCategory(draft.id, payload);
          else await createCategory(payload);
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your plan");
      } finally {
        setSaving(false);
      }
    }, 700);

    return () => clearTimeout(timeout);
  }, [drafts, saving, load]);

  const dirty = useMemo(
    () =>
      drafts.some(
        (d) => !d.saved || d.saved.name !== d.name || d.saved.color !== d.color || d.saved.hours !== d.hours,
      ),
    [drafts],
  );

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function splitSlice(index: number) {
    const used = drafts.map((d) => d.color);
    if (index >= drafts.length) {
      setDrafts([
        { key: `new-${drafts.length}-${restHours}`, id: null, name: "", color: nextColor(used), hours: restHours / 2 },
      ]);
      return;
    }
    const target = drafts[index];
    const half = Math.round((target.hours / 2) * 10) / 10;
    setDrafts((prev) => [
      ...prev.slice(0, index),
      { ...target, hours: half },
      {
        key: `new-${index}-${prev.length}`,
        id: null,
        name: "",
        color: nextColor([...used, target.color]),
        hours: Math.round((target.hours - half) * 10) / 10,
      },
      ...prev.slice(index + 1),
    ]);
  }

  async function removeDraft(draft: Draft) {
    if (!draft.id) {
      setDrafts((prev) => prev.filter((d) => d.key !== draft.key));
      return;
    }
    setDrafts((prev) => prev.filter((d) => d.key !== draft.key));
    await archiveCategory(draft.id);
    await load();
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenTitle
          title="Week"
          subtitle="168 hours. Decide where they go before they go."
          trailing={<AccountMenu />}
        />

        {loadError && !categories ? (
          <LoadError message={loadError} onRetry={load} />
        ) : !categories ? (
          <View style={{ alignItems: "center", gap: spacing.lg, marginTop: spacing.lg }}>
            <Skeleton width={232} height={232} radius={116} />
            <Skeleton width="80%" height={16} />
          </View>
        ) : (
          <>
            <View style={{ alignItems: "center", marginTop: spacing.sm }}>
              <View onStartShouldSetResponder={() => true}>
                <WeekRing
                  segments={segments}
                  onChange={(values) =>
                    setDrafts((prev) => prev.map((d, i) => ({ ...d, hours: values[i] ?? d.hours })))
                  }
                  onSplit={splitSlice}
                  centerValue={`${Math.round(WEEK_HOURS - restHours)}h`}
                  centerLabel="claimed of 168h"
                />
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                justifyContent: "center",
                marginTop: spacing.md,
                minHeight: 20,
              }}
            >
              {error ? (
                <Text role="micro" tone="danger">
                  {error}
                </Text>
              ) : saving || dirty ? (
                <Text role="micro" tone="faint">
                  Saving…
                </Text>
              ) : (
                <>
                  <Check size={12} color={colors.textFaint} />
                  <Text role="micro" tone="faint">
                    Saved
                  </Text>
                </>
              )}
            </View>

            <View style={{ marginTop: spacing.lg }}>
              {drafts.map((draft, i) => (
                <ListItemIn key={draft.key} index={i}>
                  {i > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <ColorPicker
                      color={draft.color}
                      taken={drafts.map((d) => d.color)}
                      onChange={(color) => updateDraft(draft.key, { color })}
                    />
                    <Field
                      variant="inline"
                      value={draft.name}
                      onChangeText={(name) => updateDraft(draft.key, { name })}
                      placeholder="Category name"
                      autoCapitalize="sentences"
                      style={{ flex: 1 }}
                    />
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Field
                        variant="inline"
                        mono
                        align="right"
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${draft.name || "New category"} hours`}
                        value={String(draft.hours)}
                        onChangeText={(value) => {
                          const hours = Number(value);
                          if (!Number.isNaN(hours)) updateDraft(draft.key, { hours });
                        }}
                        style={{ width: 44 }}
                      />
                      <Text role="data" tone="faint">
                        h
                      </Text>
                    </View>
                    <IconButton
                      label={`Remove ${draft.name || "category"}`}
                      tone="plain"
                      onPress={() => removeDraft(draft)}
                    >
                      <X size={15} color={colors.textFaint} />
                    </IconButton>
                  </View>
                </ListItemIn>
              ))}

              <Divider />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingVertical: spacing.md,
                }}
              >
                <View style={{ width: 30, alignItems: "center" }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: restColor }} />
                </View>
                <Text role="body" tone="muted" style={{ flex: 1 }}>
                  Rest + Buffer
                </Text>
                <Text role="data" tone="muted">
                  {formatHoursAndMinutes(restHours)}
                </Text>
              </View>

              <Divider />
              <Touchable
                onPress={() => splitSlice(drafts.length === 0 ? 0 : drafts.length - 1)}
                scaleTo={1}
                accessibilityRole="button"
                accessibilityLabel="Split off a category"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingVertical: spacing.md,
                }}
              >
                <View style={{ width: 30, alignItems: "center" }}>
                  <Plus size={16} color={colors.textMuted} />
                </View>
                <Text role="label" tone="muted">
                  Split off a category
                </Text>
              </Touchable>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
