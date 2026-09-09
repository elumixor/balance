import { and, eq } from "drizzle-orm";
import { type ZodRawShape, z } from "zod";
import { db } from "~/db";
import { goals, practices, projects, stages } from "~/db/schema";
import type { DbUser } from "~/lib/auth/service";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { qualifyCalendarId, splitCalendarId } from "~/lib/calendar/ids";
import { EventMappingService } from "~/lib/calendar/mappings-service";
import { CategoryService } from "~/lib/categories/service";
import { parseInstant, parseInstantRange } from "~/lib/http/schemas";
import { dayIn } from "~/lib/planning/days";
import { PlanningService } from "~/lib/planning/service";
import { PreferencesService } from "~/lib/preferences/service";
import { ProjectProgressService } from "~/lib/projects/progress-service";
import { StatsService } from "~/lib/stats/stats-service";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/**
 * What an assistant can do with the account, as tools.
 *
 * Written against the same services the routes call, never against the HTTP API — an MCP call is
 * already inside the process, and going out through fetch would mean a second copy of auth. The
 * shapes are deliberately smaller than the app's DTOs: a model reads what it is given, and a week
 * of full calendar events is thousands of tokens of fields nobody asked about.
 *
 * `readOnly` is the hint a client shows before it runs one, so the four that write say so.
 */
export interface McpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly readOnly: boolean;
  run(args: Record<string, unknown>, user: DbUser): Promise<unknown>;
}

function tool<S extends ZodRawShape>(definition: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  readOnly?: boolean;
  run(args: { [K in keyof S]: z.infer<S[K]> }, user: DbUser): Promise<unknown>;
}): McpTool {
  return {
    ...definition,
    readOnly: definition.readOnly ?? true,
    run: (args, user) => definition.run(args as never, user),
  };
}

/** The zone the account last said it was in — a planning day is a day in a place. */
async function zoneOf(user: DbUser, given?: string) {
  if (given) return given;
  const preferences = await new PreferencesService(user.id).get();
  return preferences.sessions.timeZone;
}

/** A window given as either two instants or "the next N days", which is how a model asks. */
const rangeSchema = {
  from: z.string().optional().describe("Start of the window, ISO 8601. Defaults to now."),
  to: z.string().optional().describe("End of the window, ISO 8601. Defaults to `days` after `from`."),
  days: z.number().int().min(1).max(62).optional().describe("Window length in days when `to` is absent. Default 7."),
};

const DEFAULT_RANGE_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

function windowOf(args: { from?: string; to?: string; days?: number }) {
  const start = args.from ? parseInstant(args.from, "from") : new Date();
  const end = args.to
    ? parseInstant(args.to, "to")
    : new Date(start.getTime() + (args.days ?? DEFAULT_RANGE_DAYS) * MS_PER_DAY);
  return parseInstantRange(start.toISOString(), end.toISOString());
}

const hours = (from: Date, to: Date) => Math.round(((to.getTime() - from.getTime()) / MS_PER_HOUR) * 100) / 100;

const purposeSchema = {
  activityId: z.string().optional().describe("An activity, which carries its own split of spheres."),
  categoryId: z.string().optional().describe("A sphere, when the block counts wholly toward one."),
  projectId: z.string().optional(),
  practiceId: z.string().optional(),
  taskId: z.string().optional(),
};

/** A sphere is written as the whole of the block's weights; the buffer takes whatever is left. */
const weightsOf = (categoryId?: string) => (categoryId ? [{ categoryId, weightPercent: 100 }] : undefined);

export const mcpTools: McpTool[] = [
  tool({
    name: "list_spheres",
    title: "List spheres",
    description:
      "The spheres (categories) on the ring, with how many hours a week each is meant to get. " +
      "Every other tool that takes a `categoryId` takes one of these ids.",
    inputSchema: {},
    async run(_args, user) {
      const rows = await new CategoryService(user.id).list();
      return {
        spheres: rows.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          targetHoursPerWeek: Number(c.targetHoursPerWeek),
        })),
      };
    },
  }),

  tool({
    name: "get_balance",
    title: "Get balance",
    description:
      "How the hours actually fell against their targets, for one day, week or month — the ring " +
      "the Statistics screen draws, plus the six periods behind it as a trend.",
    inputSchema: {
      period: z.enum(["day", "week", "month"]).describe("Which period to measure."),
      date: z.string().optional().describe("Any instant inside the period, ISO 8601. Defaults to now."),
    },
    run: (args, user) => new StatsService(user.id).stats(args),
  }),

  tool({
    name: "list_events",
    title: "List calendar events",
    description:
      "What is on the calendar in a window, with what each block counts as. Answers with " +
      "`connected: false` rather than failing when no calendar is linked yet.",
    inputSchema: rangeSchema,
    async run(args, user) {
      const { start, end } = windowOf(args);
      const range = await new CalendarEventsService(user.id).resolve(start, end);
      return {
        connected: range.connected,
        needsReconnect: range.needsReconnect,
        writeCalendarId: range.writeCalendarId,
        events: range.events.map((e) => ({
          id: e.id,
          // Qualified with the account, because "primary" means a different calendar in each —
          // and it is this string the write tools take back.
          calendarId: qualifyCalendarId(e.accountId, e.calendarId),
          title: e.title,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
          allDay: e.allDay,
          hours: e.countsTowardHours ? hours(e.start, e.end) : 0,
          location: e.location ?? null,
          activity: e.mapping?.activityName ?? null,
          weights: e.weights,
          projectId: e.mapping?.projectId ?? null,
          movable: e.movable,
          seriesId: e.seriesId ?? null,
        })),
      };
    },
  }),

  tool({
    name: "create_event",
    title: "Create a calendar block",
    description:
      "Writes a real event to the calendar, categorised in the same breath. Times are instants, " +
      "so say them with an offset — a naked local time means UTC.",
    readOnly: false,
    inputSchema: {
      title: z.string().trim().min(1),
      start: z.string().describe("ISO 8601 instant."),
      end: z.string().describe("ISO 8601 instant, after `start`."),
      description: z.string().optional(),
      location: z.string().optional(),
      allDay: z.boolean().optional(),
      calendarId: z.string().optional().describe("Defaults to the calendar new blocks land in."),
      ...purposeSchema,
    },
    async run(args, user) {
      const { start, end } = parseInstantRange(args.start, args.end, ["start", "end"]);
      const created = await new CalendarEventsService(user.id).create({
        ...args,
        weights: weightsOf(args.categoryId),
        start,
        end,
      });
      return {
        id: created.id,
        calendarId: qualifyCalendarId(created.accountId, created.calendarId),
        title: created.title,
      };
    },
  }),

  tool({
    name: "update_event",
    title: "Move or retitle a block",
    description:
      "Changes an event that is already on the calendar. Only what is given is changed. An event " +
      "whose `movable` is false takes no time or title change.",
    readOnly: false,
    inputSchema: {
      id: z.string().min(1).describe("The event id from `list_events`."),
      calendarId: z.string().min(1).describe("The event's `calendarId` from `list_events`."),
      title: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      timeZone: z.string().optional(),
    },
    async run(args, user) {
      const updated = await new CalendarEventsService(user.id).update(args.calendarId, args.id, {
        title: args.title,
        description: args.description,
        location: args.location,
        start: args.start ? parseInstant(args.start, "start") : undefined,
        end: args.end ? parseInstant(args.end, "end") : undefined,
        timeZone: args.timeZone,
      });
      return {
        id: updated.id,
        title: updated.title,
        start: updated.start.toISOString(),
        end: updated.end.toISOString(),
      };
    },
  }),

  tool({
    name: "delete_event",
    title: "Delete a block",
    description:
      "Removes one occurrence, or the whole series when `series` is true. A series is the one " +
      "thing the app cannot put back, so ask before using `series`.",
    readOnly: false,
    inputSchema: {
      id: z.string().min(1),
      calendarId: z.string().min(1),
      series: z.boolean().optional().describe("Delete every occurrence rather than this one."),
      seriesId: z.string().optional().describe("Required when `series` is true."),
    },
    async run(args, user) {
      const series =
        args.series && args.seriesId
          ? { seriesId: args.seriesId, scope: "all" as const, occurrenceStart: new Date() }
          : undefined;
      await new CalendarEventsService(user.id).delete(args.calendarId, args.id, series);
      return { ok: true };
    },
  }),

  tool({
    name: "categorize_event",
    title: "Say what a block counts as",
    description:
      "Maps an event that is already on the calendar to a sphere, an activity or a project — how " +
      "a grey week is reconciled after the fact. `scope: series` covers every occurrence.",
    readOnly: false,
    inputSchema: {
      id: z.string().min(1).describe("The event id from `list_events`."),
      calendarId: z.string().min(1),
      scope: z.enum(["instance", "series"]).default("instance"),
      ...purposeSchema,
    },
    async run(args, user) {
      const mapping = await new EventMappingService(user.id).upsert({
        calendarId: splitCalendarId(args.calendarId).calendarId,
        externalEventId: args.id,
        scope: args.scope,
        activityId: args.activityId ?? null,
        weights: weightsOf(args.categoryId),
        projectId: args.projectId ?? null,
        practiceId: args.practiceId ?? null,
        taskId: args.taskId ?? null,
      });
      return { mapping };
    },
  }),

  tool({
    name: "get_timer",
    title: "What is being tracked",
    description: "The timer that is running right now, or null.",
    inputSchema: {},
    async run(_args, user) {
      return { active: await new TrackingSessionsService(user.id).current() };
    },
  }),

  tool({
    name: "start_timer",
    title: "Start tracking",
    description:
      "Starts a timer against a sphere, writing the event it will become. Needs a connected " +
      "calendar. Leave `durationMinutes` out for one that runs until it is stopped.",
    readOnly: false,
    inputSchema: {
      categoryId: z.string().min(1).describe("A sphere id from `list_spheres`."),
      title: z.string().trim().optional(),
      durationMinutes: z.number().int().positive().optional(),
    },
    async run(args, user) {
      return { active: await new TrackingSessionsService(user.id).start(args) };
    },
  }),

  tool({
    name: "stop_timer",
    title: "Stop tracking",
    description: "Stops whatever is running. Stopping nothing is not an error.",
    readOnly: false,
    async run(_args, user) {
      const result = await new TrackingSessionsService(user.id).stop();
      return { stopped: result?.stopped ?? null, candidates: result?.candidates ?? [] };
    },
    inputSchema: {},
  }),

  tool({
    name: "get_session",
    title: "Read a planning session",
    description:
      "One planning sitting, whole: what went well, how full the day is, what committing it pays, " +
      "and the words written for it. This is the ritual the rest of the app exists for.",
    inputSchema: {
      slot: z.enum(["evening", "morning", "weekly"]).describe("Which sitting."),
      timeZone: z.string().optional().describe("IANA zone. Defaults to the account's own."),
    },
    async run(args, user) {
      return new PlanningService(user.id).summary({ slot: args.slot, timeZone: await zoneOf(user, args.timeZone) });
    },
  }),

  tool({
    name: "get_stars",
    title: "Read the star record",
    description: "Rank, streaks, what each rule has paid, and the last four weeks as a strip.",
    inputSchema: { timeZone: z.string().optional() },
    async run(args, user) {
      return new PlanningService(user.id).progress({ timeZone: await zoneOf(user, args.timeZone) });
    },
  }),

  tool({
    name: "list_projects",
    title: "List projects and practices",
    description:
      "What the hours are for: goals, the projects under them with their open stage and its gate, " +
      "and the practices that never complete. Pass `progress` for the counts behind each gate.",
    inputSchema: {
      progress: z.boolean().optional().describe("Also count what the calendar says each has had."),
      timeZone: z.string().optional(),
    },
    async run(args, user) {
      const [goalRows, projectRows, stageRows, practiceRows] = await Promise.all([
        db.query.goals.findMany({ where: and(eq(goals.userId, user.id), eq(goals.archived, false)) }),
        db.query.projects.findMany({ where: and(eq(projects.userId, user.id), eq(projects.archived, false)) }),
        db.query.stages.findMany({ where: eq(stages.userId, user.id) }),
        db.query.practices.findMany({ where: and(eq(practices.userId, user.id), eq(practices.archived, false)) }),
      ]);
      const zone = await zoneOf(user, args.timeZone);
      const progress = args.progress ? await new ProjectProgressService(user.id, zone, dayIn(zone)).compute() : null;
      return {
        goals: goalRows.map((g) => ({
          id: g.id,
          statement: g.statement,
          categoryId: g.categoryId,
          horizon: g.horizon,
        })),
        projects: projectRows.map((p) => ({
          id: p.id,
          name: p.name,
          categoryId: p.categoryId,
          goalId: p.goalId,
          status: p.status,
          hoursPerWeek: Number(p.hoursPerWeek),
          deadline: p.deadline,
          stages: stageRows
            .filter((s) => s.projectId === p.id)
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((s) => ({
              id: s.id,
              name: s.name,
              sentence: s.sentence,
              startedOn: s.startedOn,
              decideOn: s.decideOn,
            })),
          progress: progress?.projects[p.id] ?? null,
        })),
        practices: practiceRows.map((p) => ({
          id: p.id,
          name: p.name,
          categoryId: p.categoryId,
          unit: p.unit,
          targetPerWeek: Number(p.targetPerWeek),
          progress: progress?.practices[p.id] ?? null,
        })),
      };
    },
  }),
];
