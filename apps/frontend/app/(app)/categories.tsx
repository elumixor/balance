import { Check, Plus } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { WeekRing } from "../../components/ring/week-ring";
import { Divider, GUTTER, LoadError, Screen, ScreenTitle, Skeleton, Text, Touchable } from "../../components/ui";
import { CategoryDraftRow } from "../../components/week/category-draft-row";
import { useCategoryDrafts, WEEK_HOURS } from "../../components/week/use-category-drafts";
import { formatHoursAndMinutes } from "../../lib/format";
import { useTheme } from "../../theme";
import { restColor } from "../../theme/colors";

export default function WeekScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    categories,
    drafts,
    saving,
    error,
    loadError,
    dirty,
    restHours,
    segments,
    load,
    updateDraft,
    setAllHours,
    splitSlice,
    removeDraft,
  } = useCategoryDrafts();

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
                  onChange={setAllHours}
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
                <CategoryDraftRow
                  key={draft.key}
                  draft={draft}
                  index={i}
                  taken={drafts.map((d) => d.color)}
                  onChange={(patch) => updateDraft(draft.key, patch)}
                  onRemove={() => removeDraft(draft)}
                />
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
