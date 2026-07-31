import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, categories } from "@/db/schema";
import { syncBufferCategory } from "@/lib/buffer-category";
import { getOrCreateDbUser } from "@/lib/current-user";
import { ConfigTabs } from "./config-tabs";

export default async function ConfigPage() {
  const user = await getOrCreateDbUser();
  await syncBufferCategory(user.id);

  const [categoryRows, activityRows] = await Promise.all([
    db.query.categories.findMany({
      where: and(eq(categories.userId, user.id), eq(categories.archived, false)),
      orderBy: asc(categories.createdAt),
    }),
    db.query.activities.findMany({
      where: and(eq(activities.userId, user.id), eq(activities.archived, false)),
      orderBy: asc(activities.createdAt),
      with: { weights: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Define the categories your time should flow into, and the activities that fund them.
        </p>
      </div>
      <ConfigTabs categories={categoryRows} activities={activityRows} />
    </div>
  );
}
