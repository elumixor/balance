# Activity: what actually happened

The calendar says what a week was meant to be. Activity events say what it was: where the person
was, when they slept, when they were travelling, as their devices observed it. Balance stores the
observations, works out which sphere each stretch of time belongs to, and draws the result as a
thin coloured thread down the left edge of each day column on the calendar.

Nothing here is typed in by a person. A device posts observations; the person only ever corrects
one.

## Data model

One table, `activity_events` (`apps/backend/server/db/schema/activity.ts`):

| Column        | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `user_id`     | Whose observation it is.                                                         |
| `source`      | Who observed it: `paigram`, or `paigram:location` for one feed of several.       |
| `external_id` | The source's own id for the observation.                                         |
| `kind`        | `location`, `sleep`, `travel` or `activity`.                                     |
| `start_at`    | When it began.                                                                   |
| `end_at`      | When it ended (or the latest moment known, for a stay still going on).           |
| `place`       | `{ label?, latitude?, longitude?, locationId?, wifi? }`, as much as was known.   |
| `sphere_id`   | The sphere these hours are, when the source or the person said so. Else null.    |
| `attribution` | Who set `sphere_id`: `source` or `manual`.                                       |
| `confidence`  | 0 to 1. Below 0.5 the observation is listed but claims no hours.                 |
| `raw`         | Whatever else the source sent. Stored, never read.                               |

`(user_id, source, external_id)` is unique: that is the idempotency key. Calendar events are never
stored here; they are read live from Google, as everywhere else in the app.

Saved places (Settings → Places) can name a sphere: "time here counts as Health". That lives on
the place in the account's preferences (`preferences.travel.locations[].sphereId`).

## Ingest contract (for Paigram iOS)

`POST https://balance.desk.atmagaming.com/mobile/activity`

**Auth.** `Authorization: Bearer balance_mcp_…`, a key minted in Settings → Assistants. It is long
lived and never rotates, which is what a background uploader needs. A live Clerk session token
also works, so the app's own screens can call the same route.

**Body.**

```json
{
  "source": "paigram",
  "events": [
    {
      "externalId": "visit-2026-11-24T07:58:12Z-home",
      "kind": "location",
      "start": "2026-11-24T07:58:12Z",
      "end": "2026-11-24T09:41:00Z",
      "place": { "label": "Home", "latitude": 50.0833, "longitude": 14.4667, "wifi": "Zizkov-5G" },
      "confidence": 0.9
    },
    {
      "externalId": "sleep-2026-11-23",
      "kind": "sleep",
      "start": "2026-11-23T22:47:00Z",
      "end": "2026-11-24T06:52:00Z",
      "raw": { "stages": { "deep": 74, "rem": 98 } }
    },
    {
      "externalId": "trip-2026-11-24T16:00:00Z",
      "kind": "travel",
      "start": "2026-11-24T16:00:00Z",
      "end": "2026-11-24T16:40:00Z",
      "sphereId": "27c8788f-c2b7-4af6-8e8c-c0a3ab6874d7"
    }
  ]
}
```

| Field        | Rules                                                                                   |
| ------------ | --------------------------------------------------------------------------------------- |
| `source`     | `^[a-z][a-z0-9-]{1,40}(:[a-z][a-z0-9-]{1,40})?$`. `calendar` is refused.                 |
| `events`     | At most 500 per request. Send more as further batches.                                  |
| `externalId` | 1 to 200 characters, stable for the same observation across uploads.                    |
| `kind`       | `location` (a visit or Wi-Fi stay), `sleep`, `travel`, `activity` (a workout, a walk).   |
| `start/end`  | ISO 8601 instants with an offset or `Z`. `end` must be after `start`.                   |
| `place`      | Optional. `label` ≤ 120 chars, `latitude`/`longitude` in range, `locationId` = the id of a saved place when the device already matched one, `wifi` = the network name. |
| `sphereId`   | Optional. A sphere id of this account (`list_spheres` over MCP). Unknown ids are refused. |
| `confidence` | Optional, 0 to 1, default 1.                                                            |
| `raw`        | Optional object, stored as is.                                                          |

**Answer.** `200 { "ok": true, "saved": <n> }`. A malformed event fails the whole batch with `400`
naming the field; nothing from that batch is written.

**Idempotency.** Posting the same `source` + `externalId` again replaces the row. Retrying a batch
after a dropped reply is therefore free, and a stay that is still going on grows by posting it again
with the same id and a later `end`. If the same id appears twice in one batch, the last one wins. A
sphere the person set by hand survives any re-post.

**What to send from iOS.**

- Location: one event per visit (`CLVisit`, or a significant-change stay), `externalId` from the
  arrival time and place. Post the open visit with `end` = now and re-post it as it grows.
- Wi-Fi: fold into the location event as `place.wifi`; a network with no location fix is a
  `location` event with only `wifi` and `label`.
- Sleep: one event per night from HealthKit's asleep samples, `externalId` = `sleep-<wake date>`.

## Attribution rules

Worked out on every read (`apps/backend/server/lib/activity/attribution.ts`, pure), never stored, so
refiling a block or giving a place a sphere changes past weeks at once.

For each moment, four answers can be heard. The highest-ranked one wins:

1. **manual**: the person corrected the observation (`PATCH /mobile/activity/:id`).
2. **source**: the device posted a `sphereId` with confidence ≥ 0.5.
3. **calendar**: a block that counts toward hours was running. Overlapping blocks share the time
   equally and split it by their weights, the same rule the ring uses.
4. **place**: the observation was at a saved place that names a sphere. Matched by `locationId`,
   then within 150 m of the place's pin, then by label (case-insensitive).

Two observations at the same rank: the shorter one wins (the gym visit inside a day at home), and
equal lengths share. Observed time nothing could place is counted as `unattributedHours`. A part's
hours also count toward its parent sphere. Nothing after now is attributed.

## Read API

All under `/mobile/activity`, with the same auth as ingest.

- `GET /mobile/activity?from=<iso>&to=<iso>`: the timeline. `events` lists every observation and
  every calendar block that has begun, each with the sphere it claims and its `basis`. `segments`
  is the lane: `{ start, end, sphereId, basis }`, one sphere per stretch, already settled. This is
  what the calendar draws.
- `GET /mobile/activity/hours?today=YYYY-MM-DD&timeZone=<IANA>`: for the week containing `today`,
  each sphere's `targetHours`, `plannedHours` (what the calendar holds, past and ahead) and
  `actualHours` (observed so far), plus `unattributedHours`.
- `PATCH /mobile/activity/:id` with `{ "sphereId": "<uuid>" | null }`: the person's own answer for
  one observation; `null` hands it back to the rules.

Over MCP the same reads are `list_activity` and `actual_vs_plan`.
