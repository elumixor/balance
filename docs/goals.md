# Goals: what is being kept, and what is next

A goal is something a person means to keep doing, with a number to reach every day or every week:
twenty minutes of meditation, three runs. The person names it once. After that the apps where the
thing is actually done post what happened, and Balance answers three questions for any of them:
where does each goal stand, how long is the streak, and what is the one thing to do next.

The module stands on its own inside Balance: three tables, the routes under `/api/goals`, this
document. It borrows the account, the database and the deployment, and its one thread to the rest
of the app is an optional `sphereId` saying which sphere a goal belongs with. Any app can be a
client: the first is a meditation app, the next can be somebody else's.

## Data model

Three tables (`apps/backend/server/db/schema/goals.ts`).

`goals`, what was set:

| Column          | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `key`           | The name an app hard-codes: `meditation`. A slug, unique per account.       |
| `title`         | What a person calls it.                                                     |
| `kind`          | What sort of practice it is: `meditation`, `reading`. A slug, for the app.  |
| `metric`        | The key in an entry's `metrics` the target is measured on: `minutes`.       |
| `aggregate`     | How a period's entries become one number: `sum` (default), `max`, `count`.  |
| `cadence`       | `daily` (default) or `weekly`. A week starts on Monday.                     |
| `time_zone`     | The IANA zone a day of this goal is a day in.                               |
| `levels`        | The ladder, easiest first: `[{ target, label? }]`, each target higher.      |
| `advance_after` | Periods met in a row on a rung before the goal steps up. Default 3.         |
| `ease_after`    | Periods missed in a row before it steps down. Default 2.                    |
| `starts_on`     | The first day that counts, `YYYY-MM-DD` in the goal's zone. Default today.  |
| `sphere_id`     | The sphere it belongs with, or null.                                        |
| `archived`      | An archived goal is kept with its history and left out of every answer.     |

`goal_progress`, what an app said happened:

| Column        | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `goal_id`     | The goal it counts toward.                                                     |
| `at`          | When it happened.                                                              |
| `metrics`     | A flat JSON object: numbers, strings, booleans or null. See below.             |
| `source`      | The app that said so.                                                          |
| `external_id` | The app's own id for the entry.                                                |

`(user_id, source, external_id)` is unique: that is the idempotency key.

`goal_tokens`, the keys apps hold: a name, the `source` written on everything the key posts, its
`scopes`, and a hash of the secret.

Nothing else is stored. The level a goal stands on, its streak and its nudge are replayed from the
entries on every read, so last week's sittings uploaded late change last week's answer.

### Metrics

`metrics` is whatever the practice measures. The one key that matters to the rules is the goal's
own `metric`; everything else is detail kept beside it for the app that wrote it. A meditation
sitting:

```json
{ "minutes": 25, "technique": "anapana", "distractions": 4, "posture": "seiza", "guided": false }
```

With `metric: "minutes"` and `aggregate: "sum"`, the 25 counts toward the day and the rest is
returned as it was sent. An entry whose `metrics` has no number under the goal's metric counts
only toward a `count` goal.

## Rules

All of them are in `apps/backend/server/lib/goals/ladder.ts`, pure.

**A period** is a day or a Monday-to-Sunday week in the goal's zone. Its value is the aggregate of
the entries that fall in it, and it is met when the value reaches the target of the rung in force.

**The streak** is the number of periods met in a row, across rungs. The period still running never
breaks it: it joins the streak once it is met, and until then `streak.atRisk` is true if there is
a streak to keep. `streak.best` is the longest run so far.

**The ladder.** A goal starts on the first rung. Met `advanceAfter` periods in a row on one rung,
it steps up and the count starts again. Missed `easeAfter` periods in a row, it steps down, never
below the first rung. A goal with one rung never moves. `next.advanceIn` is how many more met
periods, the current one included, until the step up, and null on the top rung.

**Next up** (`GoalService.next`) is one goal: of those the current period has not met, the one
whose period closes soonest, and between two of those the longer streak. When every goal is met,
`next` is null.

**The nudge** is the sentence that asks for it, on every goal and on the next-up answer:
"10 minutes today makes it 4 days in a row.", "5 minutes more today makes it 3 days in a row and
steps you up to 20 minutes.", "Done for today: 4 days in a row." It is arithmetic, so it is there
whenever an app asks, and it never names a miss.

## Keys

Three kinds of caller reach `/api/goals` (`lib/goals/access.ts`):

- **A goals key**, `balance_goals_…`, minted on the Goals screen under Apps or with
  `POST /api/goals/tokens`. It reaches goals and nothing else in the account, and only as far as
  its scopes go. It is shown once, stored as a hash, and revoked by deleting it.
- **An assistant key**, `balance_mcp_…`, which is the whole account already and passes every scope.
- **A signed-in session**, the same.

| Scope      | Lets a key                                           |
| ---------- | ---------------------------------------------------- |
| `read`     | Read goals, the next-up answer, streaks and entries. |
| `progress` | Post progress.                                       |
| `manage`   | Make, change and remove goals.                       |

A key made without naming scopes holds `read` and `progress`. A key cannot mint or revoke keys:
the token routes take a signed-in session only.

Send it as `Authorization: Bearer <key>`. A missing or revoked key is `401`, a key without the
scope a route needs is `403`, a refused body is `400` naming the field, and every error is
`{ "error": "…" }`.

## API

Base: `https://balance.desk.atmagaming.com/api/goals`.

### `POST /progress` (scope `progress`)

```json
{
  "entries": [
    {
      "goal": "meditation",
      "externalId": "sitting-2026-11-25-0700",
      "at": "2026-11-25T07:00:00+01:00",
      "metrics": { "minutes": 25, "technique": "anapana", "distractions": 4 }
    }
  ]
}
```

- `goal` is the goal's `key` or its id. An unknown one refuses the whole batch with a `400`.
- `at` is an instant: ISO 8601 with an offset.
- Up to 500 entries a batch.
- A goals key posts under its own `source`. Any other caller adds a top-level `source`.
- Posting the same `externalId` again replaces the entry, so a retry is free and a correction is
  the same request with new numbers.

Answer: `{ "ok": true, "saved": 1, "goals": [ … ] }`, where `goals` is every goal the batch
touched as it now stands, in the shape below. An app can show the streak without a second request.

### `GET /` (scope `read`)

`{ "goals": [ … ] }`, every live goal:

```json
{
  "id": "…",
  "key": "meditation",
  "title": "Meditation",
  "kind": "meditation",
  "metric": "minutes",
  "aggregate": "sum",
  "cadence": "daily",
  "timeZone": "Europe/Prague",
  "levels": [{ "target": 10 }, { "target": 15 }, { "target": 20, "label": "Twenty" }],
  "advanceAfter": 3,
  "easeAfter": 2,
  "startsOn": "2026-11-20",
  "sphereId": null,
  "level": 1,
  "target": 15,
  "label": null,
  "period": { "start": "2026-11-25", "endsAt": "2026-11-25T23:00:00.000Z", "value": 10, "remaining": 5, "met": false },
  "streak": { "current": 4, "best": 4, "atRisk": true },
  "next": { "level": 1, "target": 15, "advanceIn": 2 },
  "nudge": "5 minutes more today makes it 5 days in a row.",
  "lastAt": "2026-11-25T06:00:00.000Z"
}
```

`level` is an index into `levels`. `next` is the rung the following period will be measured on as
things stand.

### `GET /next` (scope `read`)

`{ "next": <goal or null>, "nudge": "…", "open": 2 }`. `open` is how many goals this period has
not met yet. This is the one call a reminder needs.

### `GET /streaks` (scope `read`)

`{ "streaks": [{ "goalId", "key", "title", "cadence", "current", "best", "atRisk", "lastAt" }] }`.

### `GET /progress` (scope `read`)

The entries themselves, newest first. Query: `goal` (key or id), `from`, `to` (instants), `limit`
(default 50, at most 500). Answer: `{ "entries": [{ "id", "goalId", "at", "metrics", "source", "externalId" }] }`.

### `POST /`, `PATCH /:id`, `DELETE /:id` (scope `manage`)

`POST` takes `key`, `title`, `kind`, `metric`, `timeZone`, `levels`, and optionally `aggregate`,
`cadence`, `advanceAfter`, `easeAfter`, `startsOn`, `sphereId`. A `key` already taken is a `409`.
`PATCH` takes any of them except `key` and `startsOn`, plus `archived`; a changed ladder is
replayed over everything already posted. Both answer `{ "goal": … }`. `DELETE` takes the goal and
every entry posted toward it.

```sh
curl -X POST https://balance.desk.atmagaming.com/api/goals \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"key":"meditation","title":"Meditation","kind":"meditation","metric":"minutes",
       "timeZone":"Europe/Prague","levels":[{"target":10},{"target":15},{"target":20}]}'
```

### `GET /tokens`, `POST /tokens`, `DELETE /tokens/:id` (signed-in session)

`POST` takes `{ "name", "source", "scopes"? }` and answers `{ "token": "balance_goals_…", "key": { "id", "name", "source", "scopes", … } }`.
The token is in that answer and nowhere afterwards.

## MCP tools

An assistant connected at `/mcp` has the same three answers (`lib/mcp/tools.ts`), calling
`GoalService` directly:

- `list_goals`: every goal and where it stands.
- `log_progress`: one entry, `{ goal, metrics, at?, externalId? }`, posted under the source
  `assistant`. Answers with the goal as it now stands.
- `next_goal`: the next-up answer.

## The screen

`/goals` in the app is quiet on purpose. It shows the next-up sentence, each goal with this
period's progress, its rung and its streak, a short form for a new goal, and the keys apps hold.
Progress is not typed in there.

## What is not here yet

Nothing pushes the nudge: an app or an assistant asks for it. A goal's hours do not count toward
its sphere's ring yet; `sphereId` only records the link.
