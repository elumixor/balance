"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivitiesTab } from "./activities-tab";
import { CategoriesTab } from "./categories-tab";
import type { ActivityRow, CategoryRow } from "./types";

export function ConfigTabs({
  categories,
  activities,
}: {
  categories: CategoryRow[];
  activities: ActivityRow[];
}) {
  return (
    <Tabs defaultValue="categories">
      <TabsList>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="activities">Activities</TabsTrigger>
      </TabsList>
      <TabsContent value="categories" className="mt-4">
        <CategoriesTab categories={categories} />
      </TabsContent>
      <TabsContent value="activities" className="mt-4">
        <ActivitiesTab activities={activities} categories={categories} />
      </TabsContent>
    </Tabs>
  );
}
