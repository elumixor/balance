# @balance/synced

Optimistic writes, one queue, one rule:

```
what you see = what the server said + what it hasn't acknowledged yet
```

Every screen in this app used to draw its own change immediately, keep a copy on the device, send
it, and then reconcile whatever came back — separately, and slightly differently each time. This
is that, written once.

## The rule

The view is recomputed from the confirmed records with the pending writes replayed over the top,
every time either half moves. Two things follow, and they're the reason this exists:

- **A response can't clobber an edit.** The edit is re-applied after the response lands, so a pull
  arriving mid-keystroke doesn't need a `dirty` flag to guard it.
- **A rejection needs no rollback.** The write stops being replayed, and the row is server truth
  again on the next frame.

Writes carry an id the client makes up, so a retry after a dropped connection is free — the server
recognises the id and doesn't send the email, or make the calendar event, twice.

## Client

```ts
const client = syncedClient({
  models: { categories: model<Category>()({}) },
  transport: (request) => api.sync.$post(request),
  storage: localStorageAdapter,
  signals: runeSignals,
});
await client.hydrate();

const categories = client.models.categories;
categories.all;                                   // reactive, ordered
categories.create({ name: "Deep work", ... });    // on screen before the request exists
categories.update(id, { name: "Focus" });         // patches, not whole records
categories.delete(id);

const one = categories.get(id);
if (one) one.name = "Focus";                      // same thing, written the way it reads
```

Reactivity and storage are adapters (`Signals`, `SyncedStorage`) so the core is plain TypeScript:
Svelte's `$state` on the app side, `localStorage` on the web, Capacitor `Preferences` on device,
nothing at all in the tests.

### Undo

Undo isn't a rollback — the server has usually applied the write already, and on a mailbox or a
calendar it certainly has. So it's a new write in the opposite direction, worked out when the
original was made:

```ts
client.transaction(() => {          // one press of undo, however many writes
  categories.update(id, { name });
  categories.update(id, { color });
});
client.undo();
client.redo();
```

### Actions

Not every write is a field changing. An action is a write whose meaning belongs to the server —
answering an invitation, archiving a Gmail thread, moving a Notion page — with the client saying
only what the screen should show meanwhile, and what undoing it means:

```ts
model<Event>()({
  actions: {
    rsvp: {
      optimistic: (event, payload: { response: Response }) => ({ response: payload.response }),
      invert: (event, _payload) => ({ kind: "action", model: "events", id: event.id,
                                      name: "rsvp", payload: { response: event.response } }),
    },
  },
});
```

## Server

A model says what its records look like, where they live, and what can be done to one. "Where they
live" is an interface, not a table: `pull`, `read`, `create`, `update`, `remove`. Back it with
Drizzle, with the Google Calendar API, with anything that can answer "what changed since".

```ts
const categories = syncedModel({
  name: "categories",
  schema: categorySchema,
  store: drizzleCategories,
  writable: (category) => !category.isBuffer,     // server-managed rows refuse client writes
  actions: { archive: action(z.object({}), archiveCategory) },
});

const sync = new SyncServer([categories], mutationLog);
```

`SyncServer.handle` applies the batch in order, remembers the mutation ids it has carried out, and
answers with everything that changed. A write it will never accept comes back named and reasoned,
and the rest of the batch still lands. A write that failed for a reason a retry could fix isn't
rejected — it throws, and the client tries the whole request again with its queue intact.

## Tests

`bun test` — optimism, rejection, a response landing mid-edit, lost replies, offline bursts,
restarts, tombstones, undo and redo.
