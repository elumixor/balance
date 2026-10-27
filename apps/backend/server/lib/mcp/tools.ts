import { and, eq } from "drizzle-orm";
import { type ZodRawShape, z } from "zod";
import { db } from "~/db";
import { practices } from "~/db/schema";
import type { DbUser } from "~/lib/auth/service";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { qualifyCalendarId, splitCalendarId } from "~/lib/calendar/ids";
import { EventMappingService } from "~/lib/calendar/mappings-service";
import type { ConferenceInput } from "~/lib/calendar/types";
import { CategoryService } from "~/lib/categories/service";
import { parseInstant, parseInstantRange, urnField } from "~/lib/http/schemas";
import { dayIn } from "~/lib/planning/days";
import { PlanningService } from "~/lib/planning/service";
import { PracticeProgressService } from "~/lib/practices/progress-service";
import { PreferencesService } from "~/lib/preferences/service";
import { StatsService } from "~/lib/stats/stats-service";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";
import { ZoomService } from "~/lib/zoom/service";

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
/** The same ceiling the app's own notes field has. */
const MAX_NOTES_LENGTH = 10_000;

/**
 * A call the model already has a link to — a Zoom or Teams room somebody pasted. Written into the
 * event's own conference block rather than its notes, so every guest's calendar draws a join
 * button for it the way it does for a Meet.
 */
const callSchema = z.object({
  url: z.string().url().describe("The join URL."),
  name: z.string().optional().describe('What to call it — "Zoom Meeting".'),
  meetingCode: z.string().optional().describe("The meeting id as its provider writes it."),
  notes: z.string().max(1024).optional().describe("A passcode or a dial-in, if the link needs one."),
});

const ZOOM_DESCRIPTION =
  "Make a real Zoom room for this meeting in the connected Zoom account and put its link on the " +
  "event. Needs Zoom connected in Settings; `get_conferencing` says whether it is.";

const CALL_DESCRIPTION =
  "A call that already exists elsewhere, by its join link — use it for Zoom, Teams or anything " +
  "Google cannot make itself. `meet` makes a Google Meet instead; the two are the same slot, so " +
  "pass one or the other.";

const NOTES_DESCRIPTION =
  "Your own notes about the meeting, kept in Balance and never written to the calendar, so no " +
  "guest of the event can read them.";

/** One slot, four answers: Google's own call, a room made in Zoom, somebody else's, or none. */
function conferenceOf(args: {
  meet?: boolean;
  zoom?: boolean;
  call?: z.infer<typeof callSchema>;
}): ConferenceInput | undefined {
  if (args.call) return args.call;
  if (args.zoom) return "zoom";
  if (args.meet === undefined) return undefined;
  return args.meet ? "create" : "remove";
}

const URN_DESCRIPTION =
  "The Kip task this block is for, as its URN — `kip:page/<id>`. Projects and tasks live in Kip; " +
  "Balance only keeps the link.";

/**
 * Notes and the linked task ride on this app's record of the event, one occurrence at a time —
 * see `set_notes`. Only what was given is written, and only that is said back: a null in the
 * answer would read as "there is none".
 */
async function annotateEvent(
  user: DbUser,
  qualifiedCalendarId: string,
  eventId: string,
  fields: { notes?: string | null; urn?: string | null },
) {
  if (fields.notes === undefined && fields.urn === undefined) return {};
  const mapping = await new EventMappingService(user.id).annotate(
    { calendarId: splitCalendarId(qualifiedCalendarId).calendarId, externalEventId: eventId, scope: "instance" },
    fields,
  );
  return {
    ...(fields.notes === undefined ? {} : { notes: mapping.notes }),
    ...(fields.urn === undefined ? {} : { urn: mapping.urn }),
  };
}
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
  practiceId: z.string().optional().describe("A practice from `list_practices` the block kept."),
  urn: urnField.optional().describe(URN_DESCRIPTION),
};

/** A sphere is written as the whole of the block's weights; the buffer takes whatever is left. */
const weightsOf = (categoryId?: string) => (categoryId ? [{ categoryId, weightPercent: 100 }] : undefined);

/**
 * A guest is an address, and optionally an optional one. A model is given both spellings because
 * it usually has only an address to hand, and writing `["a@b.com"]` should not need an object.
 */
const guestSchema = z.union([
  z.string().trim().min(3),
  z.object({ email: z.string().trim().min(3), optional: z.boolean().optional() }),
]);

const guestsOf = (guests?: readonly z.infer<typeof guestSchema>[]) =>
  guests?.map((g) =>
    typeof g === "string" ? { email: g, optional: false } : { email: g.email, optional: g.optional ?? false },
  );

const GUESTS_DESCRIPTION =
  "Email addresses to invite. Google sends each of them the invitation as the event is written.";

/**
 * Google replaces a guest list rather than merging into it, so adding somebody means reading the
 * event first and writing everyone back — the organizer included, or handing the event over is
 * what the write would mean.
 */
async function withGuests(
  service: CalendarEventsService,
  calendarId: string,
  eventId: string,
  added: readonly z.infer<typeof guestSchema>[],
) {
  const event = await service.get(calendarId, eventId);
  const current = event.attendees.flatMap((a) =>
    a.email && !a.resource ? [{ email: a.email, optional: a.optional }] : [],
  );
  const known = new Set(current.map((a) => a.email.toLowerCase()));
  const organizer = event.organizer?.email;
  if (organizer && !known.has(organizer.toLowerCase())) {
    current.unshift({ email: organizer, optional: false });
    known.add(organizer.toLowerCase());
  }
  for (const guest of guestsOf(added) ?? []) {
    if (known.has(guest.email.toLowerCase())) continue;
    known.add(guest.email.toLowerCase());
    current.push(guest);
  }
  return current;
}

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
          conferenceUrl: e.conferenceUrl,
          // This app's own record of the meeting, which no guest of it can see.
          notes: e.mapping?.notes ?? null,
          activity: e.mapping?.activityName ?? null,
          weights: e.weights,
          urn: e.mapping?.urn ?? null,
          movable: e.movable,
          seriesId: e.seriesId ?? null,
          organizer: e.organizer?.email ?? null,
          // The addresses, because `update_event`'s `attendees` replaces the whole list: adding
          // somebody means writing back everyone who was already on it.
          attendees: e.attendees
            .filter((a) => !a.resource && a.email)
            .map((a) => ({ email: a.email, name: a.name, response: a.response, optional: a.optional })),
        })),
      };
    },
  }),

  tool({
    name: "create_event",
    title: "Create a calendar block",
    description:
      "Writes a real event to the calendar, categorised in the same breath: invites whoever is " +
      "named in `attendees`, gives it a Google Meet link when `meet` is true, and keeps `notes` " +
      "where only you can read them. Times are instants, so say them with an offset — a naked " +
      "local time means UTC.",
    readOnly: false,
    inputSchema: {
      title: z.string().trim().min(1),
      start: z.string().describe("ISO 8601 instant."),
      end: z.string().describe("ISO 8601 instant, after `start`."),
      description: z.string().optional(),
      location: z.string().optional(),
      allDay: z.boolean().optional(),
      calendarId: z.string().optional().describe("Defaults to the calendar new blocks land in."),
      attendees: z.array(guestSchema).optional().describe(GUESTS_DESCRIPTION),
      meet: z.boolean().optional().describe("Give the event a Google Meet link of its own."),
      zoom: z.boolean().optional().describe(ZOOM_DESCRIPTION),
      call: callSchema.optional().describe(CALL_DESCRIPTION),
      notes: z.string().max(MAX_NOTES_LENGTH).optional().describe(NOTES_DESCRIPTION),
      ...purposeSchema,
    },
    async run(args, user) {
      const { start, end } = parseInstantRange(args.start, args.end, ["start", "end"]);
      const created = await new CalendarEventsService(user.id).create({
        ...args,
        weights: weightsOf(args.categoryId),
        attendees: guestsOf(args.attendees),
        conference: conferenceOf(args),
        start,
        end,
      });
      const calendarId = qualifyCalendarId(created.accountId, created.calendarId);
      const notes = await annotateEvent(user, calendarId, created.id, { notes: args.notes });
      return {
        id: created.id,
        calendarId,
        title: created.title,
        attendees: created.attendees.flatMap((a) => (a.email ? [a.email] : [])),
        conferenceUrl: created.conferenceUrl,
        urn: created.mapping?.urn ?? null,
        ...notes,
      };
    },
  }),

  tool({
    name: "update_event",
    title: "Move or retitle a block",
    description:
      "Changes an event that is already on the calendar, including who is coming, whether it has a " +
      "Google Meet call, and your own private notes about it. Only what is given is changed. An " +
      "event whose `movable` is false takes no time or title change — but still takes notes.",
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
      addAttendees: z
        .array(guestSchema)
        .optional()
        .describe(`Guests to add, keeping everyone already invited. ${GUESTS_DESCRIPTION}`),
      attendees: z
        .array(guestSchema)
        .optional()
        .describe(
          `The whole guest list, replacing the event's own — whoever is left out is uninvited. Prefer \`addAttendees\` to invite somebody. ${GUESTS_DESCRIPTION}`,
        ),
      meet: z.boolean().optional().describe("True adds a Google Meet link, false takes the call off."),
      zoom: z.boolean().optional().describe(`${ZOOM_DESCRIPTION} It replaces whatever call is on the event.`),
      call: callSchema.optional().describe(`${CALL_DESCRIPTION} It replaces whatever call is on the event.`),
      notes: z
        .string()
        .max(MAX_NOTES_LENGTH)
        .nullable()
        .optional()
        .describe(`${NOTES_DESCRIPTION} Null clears them; use \`set_notes\` to write them on a whole series.`),
      urn: urnField.nullable().optional().describe(`${URN_DESCRIPTION} Null unlinks it.`),
    },
    async run(args, user) {
      const service = new CalendarEventsService(user.id);
      const attendees = args.addAttendees?.length
        ? await withGuests(service, args.calendarId, args.id, args.addAttendees)
        : guestsOf(args.attendees);
      const updated = await service.update(args.calendarId, args.id, {
        title: args.title,
        description: args.description,
        location: args.location,
        start: args.start ? parseInstant(args.start, "start") : undefined,
        end: args.end ? parseInstant(args.end, "end") : undefined,
        timeZone: args.timeZone,
        attendees,
        conference: conferenceOf(args),
      });
      const annotated = await annotateEvent(user, args.calendarId, args.id, { notes: args.notes, urn: args.urn });
      return {
        id: updated.id,
        title: updated.title,
        start: updated.start.toISOString(),
        end: updated.end.toISOString(),
        attendees: updated.attendees.flatMap((a) => (a.email ? [a.email] : [])),
        conferenceUrl: updated.conferenceUrl,
        ...annotated,
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
      "Maps an event that is already on the calendar to a sphere or an activity, and optionally links " +
      "the Kip task it was for — how a grey week is reconciled after the fact. `scope: series` covers " +
      "every occurrence.",
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
        practiceId: args.practiceId ?? null,
        urn: args.urn,
      });
      return { mapping };
    },
  }),

  tool({
    name: "get_conferencing",
    title: "What calls can be made",
    description:
      "Which kinds of call this account can put on an event: a Google Meet always, a Zoom room " +
      "only once Zoom is connected. Read it before offering to make one.",
    inputSchema: {},
    async run(_args, user) {
      const zoom = await new ZoomService(user.id).status();
      return {
        meet: true,
        zoom: zoom.available && zoom.connected && !zoom.needsReconnect,
        zoomAccount: zoom.accountEmail || null,
        // What to say when somebody asks for a Zoom room and there isn't one to be had.
        zoomUnavailableBecause: zoom.available
          ? zoom.connected
            ? zoom.needsReconnect
              ? "the Zoom connection expired and has to be made again in Settings"
              : null
            : "Zoom isn't connected yet — connect it in Settings"
          : "this deployment has no Zoom app set up",
        // Any other call can still be put on an event by its link, with `call`.
        pasteAnyLink: true,
      };
    },
  }),

  tool({
    name: "set_notes",
    title: "Write private notes on an event",
    description:
      "The person's own notes about a meeting — what to prepare, what was said, what to do next. " +
      "They are kept in Balance and never written to the calendar, so no guest of the event can " +
      "read them. Passing null clears them. `scope: series` writes them once for every occurrence.",
    readOnly: false,
    inputSchema: {
      id: z.string().min(1).describe("The event id from `list_events`."),
      calendarId: z.string().min(1),
      scope: z.enum(["instance", "series"]).default("instance"),
      notes: z.string().max(MAX_NOTES_LENGTH).nullable().describe("The whole note, replacing whatever was there."),
    },
    async run(args, user) {
      const mapping = await new EventMappingService(user.id).annotate(
        {
          calendarId: splitCalendarId(args.calendarId).calendarId,
          externalEventId: args.id,
          scope: args.scope,
        },
        { notes: args.notes },
      );
      return { notes: mapping.notes };
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
    name: "list_practices",
    title: "List practices",
    description:
      "The practices that never complete — sleep, the gym — each with what it asks for a week. " +
      "Pass `progress` for what the calendar says each has actually had. Projects and tasks are " +
      "not in Balance: they live in Kip.",
    inputSchema: {
      progress: z.boolean().optional().describe("Also count what the calendar says each has had."),
      timeZone: z.string().optional(),
    },
    async run(args, user) {
      const rows = await db.query.practices.findMany({
        where: and(eq(practices.userId, user.id), eq(practices.archived, false)),
      });
      const zone = await zoneOf(user, args.timeZone);
      const progress = args.progress ? await new PracticeProgressService(user.id, zone, dayIn(zone)).compute() : null;
      return {
        practices: rows.map((practice) => ({
          id: practice.id,
          name: practice.name,
          categoryId: practice.categoryId,
          unit: practice.unit,
          targetPerWeek: Number(practice.targetPerWeek),
          progress: progress?.practices[practice.id] ?? null,
        })),
      };
    },
  }),
];
