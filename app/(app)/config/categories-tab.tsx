"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { archiveCategory } from "./actions";
import { AllocationIndicator } from "./allocation-indicator";
import { ArchiveButton } from "./archive-button";
import { CategoryDialog } from "./category-dialog";
import type { CategoryRow } from "./types";

export function CategoriesTab({ categories }: { categories: CategoryRow[] }) {
  const totalHours = categories.reduce((sum, c) => sum + Number(c.targetHoursPerWeek), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Weekly allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationIndicator totalHours={totalHours} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"}
        </h2>
        <CategoryDialog
          allCategories={categories}
          trigger={
            <Button size="sm">
              <PlusIcon /> New category
            </Button>
          }
        />
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No categories yet. Create one to start allocating your time.
                </TableCell>
              </TableRow>
            )}
            {categories.map((category) => {
              const hours = Number(category.targetHoursPerWeek);
              return (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {hours}h/wk <span className="text-muted-foreground">({((hours / 168) * 100).toFixed(1)}%)</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={category.trackingMode === "consistency" ? "outline" : "secondary"}>
                      {category.trackingMode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {category.isProductiveLoad && <Badge variant="default">productive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <CategoryDialog
                        category={category}
                        allCategories={categories}
                        trigger={
                          <Button variant="ghost" size="icon-sm">
                            <span className="sr-only">Edit {category.name}</span>
                            <PencilIcon />
                          </Button>
                        }
                      />
                      <ArchiveButton
                        itemName={category.name}
                        onArchive={() => archiveCategory(category.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
