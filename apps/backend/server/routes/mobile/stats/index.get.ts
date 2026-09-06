import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { StatsService } from "~/lib/stats/stats-service";

export default authed({ query: { period: z.string(), date: z.string().optional() } }, async ({ query, user }) =>
  new StatsService(user.id).stats(query),
);
