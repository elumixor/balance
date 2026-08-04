import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { BalanceRing } from "../../components/ring/balance-ring";
import { CategoryRow } from "../../components/stats/category-row";
import { TrendRow } from "../../components/stats/trend-row";
import {
  Divider,
  EmptyState,
  GUTTER,
  ListItemIn,
  LoadError,
  Panel,
  Screen,
  ScreenTitle,
  SectionHeader,
  Segmented,
  SkeletonRows,
  Text,
} from "../../components/ui";
import { formatHoursAndMinutes } from "../../lib/format";
import { getCategories, getStats } from "../../lib/queries";
import type { Category, StatsResponse } from "../../lib/types";
import { useTheme } from "../../theme";

type PeriodKind = "day" | "week" | "month";

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export default function StatsScreen() {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodKind>("week");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (kind: PeriodKind) => {
    setLoading(true);
    try {
      const [stats, cats] = await Promise.all([getStats(kind), getCategories()]);
      setData(stats);
      setCategories(cats);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your balance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period]),
  );

  const bufferIds = useMemo(() => new Set(categories.filter((c) => c.isBuffer).map((c) => c.id)), [categories]);
  // Rest + Buffer is whatever the plan doesn't claim, so weighing it against a
  // target would be meaningless — it stays out of the ring and the list.
  const planned = useMemo(
    () => (data?.categories ?? []).filter((c) => !bufferIds.has(c.categoryId)),
    [data, bufferIds],
  );
  const trends = useMemo(() => (data?.trends ?? []).filter((t) => !bufferIds.has(t.categoryId)), [data, bufferIds]);
  const trackedHours = planned.reduce((sum, c) => sum + c.actualHours, 0);
  const plannedHours = planned.reduce((sum, c) => sum + c.targetHours, 0);

  const hasData = planned.length > 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
      >
        <ScreenTitle title="Balance" trailing={<AccountMenu />} />

        <Segmented options={PERIODS} value={period} onChange={setPeriod} />

        {loadError && !data ? (
          <LoadError message={loadError} onRetry={() => load(period)} />
        ) : loading && !data ? (
          <View style={{ marginTop: spacing.xl }}>
            <SkeletonRows count={5} />
          </View>
        ) : !hasData ? (
          <EmptyState title="Nothing to weigh yet." hint="Plan your week, then track a few hours against it." />
        ) : (
          <>
            <View style={{ alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.md }}>
              <BalanceRing
                slices={planned.map((c) => ({
                  id: c.categoryId,
                  label: c.name,
                  color: c.color,
                  targetHours: c.targetHours,
                  actualHours: c.actualHours,
                }))}
                centerValue={formatHoursAndMinutes(trackedHours)}
                centerLabel={`tracked of ${formatHoursAndMinutes(plannedHours)} planned`}
              />
            </View>

            <View style={{ marginTop: spacing.lg }}>
              {planned.map((stat, i) => (
                <ListItemIn key={stat.categoryId} index={i}>
                  {i > 0 ? <Divider /> : null}
                  <CategoryRow stat={stat} color={stat.color} />
                </ListItemIn>
              ))}
            </View>

            {trends.length > 0 ? (
              <View style={{ marginTop: spacing.xl }}>
                <SectionHeader
                  title={`Last ${data?.trendPeriodCount ?? trends[0].points.length} ${period}s`}
                  trailing={
                    <Text role="micro" tone="faint">
                      line = target
                    </Text>
                  }
                />
                <Panel>
                  {trends.map((trend, i) => (
                    <View key={trend.categoryId}>
                      {i > 0 ? <Divider /> : null}
                      <TrendRow trend={trend} color={trend.color} />
                    </View>
                  ))}
                </Panel>
              </View>
            ) : null}

            <Text role="micro" tone="faint" style={{ marginTop: spacing.lg }}>
              Outer arc is your plan, inner arc is what you actually did.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
