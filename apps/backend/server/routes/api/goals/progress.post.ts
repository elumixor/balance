import { z } from "zod";
import { goalsLogger } from "~/lib/goals/access";
import { goalSourceField, progressEntrySchema } from "~/lib/goals/schemas";
import { GoalService } from "~/lib/goals/service";
import { ApiError } from "~/lib/http/api-error";
import { parseInstant } from "~/lib/http/schemas";

/** One upload's worth; an app with more sends another batch. */
const MAX_ENTRIES = 500;

/**
 * What an app says happened toward its goals, a batch at a time. Idempotent by `source` and
 * `externalId`. A goals key posts under its own source; any other caller names one. Answers with
 * where every touched goal now stands, so the app can say so without a second request. See
 * `docs/goals.md` for the contract.
 */
export default goalsLogger(
  { body: { source: goalSourceField.optional(), entries: z.array(progressEntrySchema).max(MAX_ENTRIES) } },
  async ({ body, user, source }) => {
    const from = source ?? body.source;
    if (!from) throw new ApiError("source: required unless the request holds a goals key");
    const service = new GoalService(user.id);
    const saved = await service.log(
      from,
      body.entries.map((entry, index) => ({ ...entry, at: parseInstant(entry.at, `entries[${index}].at`) })),
    );
    const touched = new Set(body.entries.map((entry) => entry.goal));
    const goals = (await service.list()).filter((goal) => touched.has(goal.id) || touched.has(goal.key));
    return { ok: true as const, saved, goals };
  },
);
