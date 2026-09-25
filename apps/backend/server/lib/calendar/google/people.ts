import type { ProviderAccountService } from "~/lib/calendar/provider-accounts";
import type { ExternalPerson } from "~/lib/calendar/types";

const BASE_URL = "https://people.googleapis.com/v1";
const PAGE_SIZE = 500;

/**
 * The address book, and the addresses Google itself has written down from the mail that has been
 * sent. "Other contacts" is the one that matters: nobody keeps a contact card for the colleague
 * they email daily, and that is exactly the person a guest list is about to name.
 */
export const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
export const OTHER_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.other.readonly";

/**
 * Whether a stored grant covers the address book at all. A grant made before this feature existed
 * does not, and reconnecting is the only way to widen it — which nothing here asks anybody to do,
 * because the guest lists of past events answer the same question without a new scope.
 */
export function hasContactsScope(scopes: string | null): boolean {
  const granted = (scopes ?? "").split(/\s+/);
  return granted.includes(CONTACTS_SCOPE) || granted.includes(OTHER_CONTACTS_SCOPE);
}

interface PeopleResponse {
  connections?: GooglePerson[];
  otherContacts?: GooglePerson[];
  nextPageToken?: string;
}

interface GooglePerson {
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
  photos?: { url?: string; default?: boolean }[];
}

/**
 * Reading one account's contacts. Deliberately not a `GoogleRequest`: that class is the Calendar
 * API's transport, with the retries and the error sentences a calendar write needs, and none of
 * that applies to a list of names nothing on screen is waiting for. A refusal here — the scope
 * missing, the People API switched off in the Cloud project — is an empty address book, never a
 * failure: a suggestion that doesn't appear costs somebody a few keystrokes, and that is all.
 */
export class GooglePeople {
  constructor(
    private readonly accounts: ProviderAccountService,
    private readonly accountId: string,
  ) {}

  async list(): Promise<ExternalPerson[]> {
    const [saved, seen] = await Promise.all([
      this.#fetch(
        `/people/me/connections?personFields=names,emailAddresses,photos&pageSize=${PAGE_SIZE}`,
        "connections",
      ),
      this.#fetch(`/otherContacts?readMask=names,emailAddresses,photos&pageSize=${PAGE_SIZE}`, "otherContacts"),
    ]);
    return [...saved, ...seen];
  }

  async #fetch(path: string, field: "connections" | "otherContacts"): Promise<ExternalPerson[]> {
    try {
      const token = await this.accounts.accessToken(this.accountId);
      const response = await fetch(`${BASE_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) return [];
      const body = (await response.json()) as PeopleResponse;
      return (body[field] ?? []).flatMap(toPerson);
    } catch {
      return [];
    }
  }
}

function toPerson(person: GooglePerson): ExternalPerson[] {
  const email = person.emailAddresses?.[0]?.value;
  if (!email) return [];
  // Google's own silhouette is flagged `default`; only a real picture is worth carrying over.
  const photo = person.photos?.find((one) => one.url && !one.default)?.url ?? null;
  return [{ email, name: person.names?.[0]?.displayName ?? null, lastSeen: null, photo }];
}
