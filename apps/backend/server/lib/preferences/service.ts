import { eq, type SQL, sql } from "drizzle-orm";
import { db } from "~/db";
import { userPreferences } from "~/db/schema";
import { merge } from "./migrate";
import type { Preferences, PreferencesPatch } from "./schema";

type Section = keyof PreferencesPatch;

/**
 * The app's own preferences, kept per account rather than per device.
 *
 * Only the macOS app can act on most of these — a browser tab has nowhere to put a reminder card
 * — but the settings panel shows them everywhere, so setting them on a phone has to reach the Mac
 * that will use them. That is the whole reason they aren't in `localStorage`.
 */
export class PreferencesService {
  constructor(private readonly userId: string) {}

  /**
   * Always a whole answer. A row written by an older build is missing whatever was added since,
   * and a screen that has to cope with half a preference is a screen with two ideas of the
   * default in it.
   */
  async get(): Promise<Preferences> {
    const row = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, this.userId) });
    return merge(row?.data);
  }

  /**
   * A patch of a patch: one section at a time, one setting at a time, both partial.
   *
   * Merged in the database rather than read here and written back: two devices flipping two
   * switches in the same second must both land, and a merge done in this process writes the one
   * that read first over the one that wrote first. `||` on jsonb is shallow, so each named
   * section is merged onto the stored section, and the result onto the row.
   */
  async update(patch: PreferencesPatch): Promise<Preferences> {
    const sections = (Object.keys(patch) as Section[]).filter((key) => patch[key] !== undefined);
    if (sections.length === 0) return this.get();

    const [row] = await db
      .insert(userPreferences)
      .values({ userId: this.userId, data: Object.fromEntries(sections.map((key) => [key, patch[key]])) })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          data: sql.join(
            [sql`${userPreferences.data}`, ...sections.map((key) => mergedSection(key, patch))],
            sql` || `,
          ),
          updatedAt: new Date(),
        },
      })
      .returning();
    return merge(row.data);
  }
}

/** `{ section: stored || patch }`, ready to be `||`-ed onto the row. */
function mergedSection(key: Section, patch: PreferencesPatch): SQL {
  const stored = sql`coalesce(${userPreferences.data} -> ${key}, '{}'::jsonb)`;
  // One feed's stamp at a time: a phone writing sleep must not forget another device's feed, so
  // the map inside is merged too rather than replaced with the one key the patch carries.
  if (key === "integrations") {
    const synced = JSON.stringify(patch.integrations?.synced ?? {});
    const map = sql`coalesce(${stored} -> 'synced', '{}'::jsonb) || ${synced}::jsonb`;
    return sql`jsonb_build_object(${key}::text, jsonb_build_object('synced', ${map}))`;
  }
  return sql`jsonb_build_object(${key}::text, ${stored} || ${JSON.stringify(patch[key])}::jsonb)`;
}
