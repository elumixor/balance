import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { archiveActivity, createActivity, getActivities, getCategories, updateActivity } from "../../lib/queries";
import type { Activity, Category } from "../../lib/types";
import type { ActivityDraft } from "./activity-editor";

/** Owns the Activities screen's data loading and create/update/archive mutations. */
export function useActivitiesData() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextActivities, nextCategories] = await Promise.all([getActivities(), getCategories()]);
      setActivities(nextActivities);
      setCategories(nextCategories);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your activities.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const planned = useMemo(() => categories.filter((c) => !c.isBuffer), [categories]);

  async function save(id: string | "new", draft: ActivityDraft) {
    if (id === "new") await createActivity(draft);
    else await updateActivity(id, draft);
    setEditing(null);
    await load();
  }

  function archive(activity: Activity) {
    Alert.alert("Archive this activity?", `"${activity.name}" disappears from the list. Past entries stay.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          setEditing(null);
          await archiveActivity(activity.id);
          await load();
        },
      },
    ]);
  }

  return { activities, categoryById, planned, editing, setEditing, loadError, load, save, archive };
}
