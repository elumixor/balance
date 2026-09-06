import type { StoredPreferences } from "$lib/account/preferences-types";
import { api, apiGet, callApi, unwrapOk } from "$lib/core/api";

/** The name and the picture the sign-in provider holds for this account. */
export const getProfile = () => apiGet<{ name: string; email: string; imageUrl: string }>("/auth/profile");

/** Trades this browser's session for a ticket the macOS app can sign in with — see `/desktop-link`. */
export const createDesktopTicket = () => callApi(api.auth.desktop.ticket.$post()).then((r) => unwrapOk(r).ticket);

export const getPreferences = () => callApi(api.preferences.$get()).then((r) => unwrapOk(r) as StoredPreferences);

/** One section at a time, one setting at a time — the panel has no Save button. */
export const updatePreferences = (patch: {
  reminders?: Partial<StoredPreferences["reminders"]>;
  travel?: Partial<StoredPreferences["travel"]>;
  sessions?: Partial<StoredPreferences["sessions"]>;
  zones?: Partial<StoredPreferences["zones"]>;
  card?: Partial<StoredPreferences["card"]>;
  integrations?: Partial<StoredPreferences["integrations"]>;
}) => callApi(api.preferences.$patch(patch)).then(unwrapOk);
