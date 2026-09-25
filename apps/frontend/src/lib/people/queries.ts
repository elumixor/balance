import { api, callApi } from "$lib/core/api";

/** Fills the list from the guest lists of recent events; the rows themselves arrive through sync. */
export const seedPeople = () => callApi(api.people.seed.$post({})).then((r) => r.added);

/** A name and a picture for an address — the address book's, or Gravatar's, or read off the address. */
export const lookupPerson = (email: string) => callApi(api.people.lookup.$post({ email }));
