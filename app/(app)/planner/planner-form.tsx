"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { PlannerResponse } from "@/app/api/planner/route";
import { applyPlannerChanges } from "./actions";

export function PlannerForm() {
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlannerResponse | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<number | null>(null);
  const [isApplying, startApplying] = useTransition();

  async function handleSubmit() {
    if (!request.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(null);

    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      const plan = data as PlannerResponse;
      setResult(plan);
      setSelected(Object.fromEntries(plan.proposedChanges.map((c) => [c.categoryId, true])));
    } catch {
      setError("Failed to reach the planner. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    const changes = result.proposedChanges
      .filter((c) => selected[c.categoryId])
      .map((c) => ({ categoryId: c.categoryId, proposedTargetHours: c.proposedTargetHours }));

    startApplying(async () => {
      const { applied: count } = await applyPlannerChanges(changes);
      setApplied(count);
    });
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>What do you want to plan for?</CardTitle>
          <CardDescription>
            e.g. &quot;next week I want to focus on Atma and ship the level editor, keep the day job at 30h, don&apos;t
            let sleep slip&quot;
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Describe your goals, constraints, and priorities for the upcoming period..."
            rows={5}
            disabled={loading}
          />
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={loading || !request.trim()}>
              {loading ? "Thinking..." : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t generate a plan</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Overall explanation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{result.overallExplanation}</p>
            </CardContent>
          </Card>

          {result.observations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Observations</CardTitle>
                <CardDescription>How your recent actuals compare to your targets</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {result.observations.map((obs, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant={obs.kind === "pattern" ? "default" : "secondary"} className="mt-0.5 shrink-0">
                      {obs.kind === "pattern" ? "Pattern" : "Blip"}
                    </Badge>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">{obs.categoryName}:</span> {obs.text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Proposed changes</CardTitle>
              <CardDescription>Nothing is applied until you select changes and confirm below.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {result.proposedChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">No target changes were proposed this time.</p>
              ) : (
                result.proposedChanges.map((change) => (
                  <label
                    key={change.categoryId}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <Checkbox
                      checked={selected[change.categoryId] ?? false}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => ({ ...prev, [change.categoryId]: checked === true }))
                      }
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{change.categoryName}</span>
                        <span className="text-muted-foreground">
                          {change.currentTargetHours}h → {change.proposedTargetHours}h / week
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{change.rationale}</p>
                    </div>
                  </label>
                ))
              )}

              {result.proposedChanges.length > 0 ? (
                <div className="flex items-center justify-end gap-3 pt-2">
                  {applied !== null ? (
                    <span className="text-sm text-muted-foreground">Applied {applied} change(s).</span>
                  ) : null}
                  <Button onClick={handleApply} disabled={selectedCount === 0 || isApplying}>
                    {isApplying ? "Applying..." : `Apply selected changes (${selectedCount})`}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
