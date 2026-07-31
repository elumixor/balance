"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { archiveActivity } from "./actions";
import { ActivityDialog } from "./activity-dialog";
import { ArchiveButton } from "./archive-button";
import type { ActivityRow, CategoryRow } from "./types";

export function ActivitiesTab({
  activities,
  categories,
}: {
  activities: ActivityRow[];
  categories: CategoryRow[];
}) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {activities.length} activit{activities.length === 1 ? "y" : "ies"}
        </h2>
        <ActivityDialog
          categories={categories}
          trigger={
            <Button size="sm">
              <PlusIcon /> New activity
            </Button>
          }
        />
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category split</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No activities yet. Create one and map it to your categories.
                </TableCell>
              </TableRow>
            )}
            {activities.map((activity) => (
              <TableRow key={activity.id}>
                <TableCell className="font-medium">{activity.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {activity.weights.map((w) => {
                      const category = categoryById.get(w.categoryId);
                      return (
                        <Badge key={w.id} variant="outline">
                          {category?.name ?? "unknown"} {w.weightPercent}%
                        </Badge>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <ActivityDialog
                      activity={activity}
                      categories={categories}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <span className="sr-only">Edit {activity.name}</span>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    <ArchiveButton
                      itemName={activity.name}
                      onArchive={() => archiveActivity(activity.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
