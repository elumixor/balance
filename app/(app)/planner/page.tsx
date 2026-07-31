import Link from "next/link";
import { eq } from "drizzle-orm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/current-user";
import { PlannerForm } from "./planner-form";

export default async function PlannerPage() {
  const user = await getOrCreateDbUser();
  const userCategories = await db.query.categories.findMany({
    where: eq(categories.userId, user.id),
  });

  const hasActiveCategories = userCategories.some((c) => !c.archived);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI Planner</h1>
        <p className="text-sm text-muted-foreground">
          Describe what you want to focus on and get suggested changes to your category targets, backed by your
          recent history.
        </p>
      </div>

      {!hasActiveCategories ? (
        <Alert>
          <AlertTitle>No categories yet</AlertTitle>
          <AlertDescription>
            You need at least one category before the planner can suggest anything. Head over to{" "}
            <Link href="/config">Config</Link> to set some up.
          </AlertDescription>
        </Alert>
      ) : (
        <PlannerForm />
      )}
    </div>
  );
}
