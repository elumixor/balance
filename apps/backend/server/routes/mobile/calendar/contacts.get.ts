import { setResponseHeader } from "h3";
import { CalendarContactsService } from "~/lib/calendar/contacts-service";
import { authed } from "~/lib/http/authed";

/**
 * Everyone the account already knows an address for, so the guest field suggests rather than
 * waits to be typed into in full. Fetched once a session and filtered on the device — a request
 * per keystroke would be a Google pass per keystroke.
 */
export default authed(async ({ event, user }) => {
  const people = await new CalendarContactsService(user.id).list();

  // Somebody's address book behind a bearer token: no shared cache may ever hold it.
  setResponseHeader(event, "cache-control", "private, no-store");
  return {
    people: people.map((person) => ({
      email: person.email,
      name: person.name,
      count: person.count,
      lastSeen: person.lastSeen?.toISOString() ?? null,
      contact: person.contact,
    })),
  };
});
