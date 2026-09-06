import { api, callApi, unwrapOk } from "$lib/core/api";
import type { IntegrationStatus } from "$lib/integrations/types";

export const getIntegrations = () =>
  callApi(api.integrations.$get()).then((r) => unwrapOk(r).integrations as IntegrationStatus[]);

export const startGoogleConnect = (mode: "app" | "web", origin: string) =>
  callApi(api.integrations.google.start.$post({ mode, origin })).then((r) => unwrapOk(r).url);

/** What an integration on this device observed for the occurrences it is linked to — see `integrations.svelte.ts`. */
export const saveIntegrationRecords = (input: {
  source: string;
  records: { calendarId: string; externalEventId: string; data: Record<string, unknown> }[];
}) => callApi(api.integrations.records.$post(input)).then(unwrapOk);
