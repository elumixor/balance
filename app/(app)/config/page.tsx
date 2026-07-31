import { getActivitiesForUser, getCategoriesForUser } from "@/lib/categories-service";
import { getOrCreateDbUser } from "@/lib/current-user";
import { ConfigTabs } from "./config-tabs";

export default async function ConfigPage() {
  const user = await getOrCreateDbUser();

  const [categoryRows, activityRows] = await Promise.all([
    getCategoriesForUser(user.id),
    getActivitiesForUser(user.id),
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
