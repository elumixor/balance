import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { archiveCategory, createCategory, getCategories, updateCategory } from "../../lib/queries";
import type { Category } from "../../lib/types";
import { restColor, swatchPalette } from "../../theme/colors";
import type { RingSegment } from "../ring/week-ring";

export const WEEK_HOURS = 168;
const AUTOSAVE_DELAY_MS = 700;

export type Draft = {
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

function isDirty(draft: Draft) {
  return (
    !draft.saved ||
    draft.saved.name !== draft.name ||
    draft.saved.color !== draft.color ||
    draft.saved.hours !== draft.hours
  );
}

/**
 * Owns the Week screen's editable category-plan state: loading, per-row drafts, debounced
 * autosave, and the split/remove/reorder mutations the ring and row list drive.
 */
export function useCategoryDrafts() {
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
    const changed = drafts.filter(isDirty);
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
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [drafts, saving, load]);

  const dirty = useMemo(() => drafts.some(isDirty), [drafts]);

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function setAllHours(values: number[]) {
    setDrafts((prev) => prev.map((d, i) => ({ ...d, hours: values[i] ?? d.hours })));
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

  return {
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
  };
}
