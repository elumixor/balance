import { api, callApi } from "$lib/core/api";
import type { IntegrationStatus } from "$lib/integrations/types";

export const getIntegrations = () =>
  callApi(api.integrations.$get()).then((r) => r.integrations as IntegrationStatus[]);

export const startGoogleConnect = (mode: "app" | "web", origin: string) =>
  callApi(api.integrations.google.start.$post({ mode, origin })).then((r) => r.url);

/** What an integration on this device observed for the occurrences it is linked to — see `integrations.svelte.ts`. */
export const saveIntegrationRecords = (input: {
  source: string;
  records: { calendarId: string; externalEventId: string; data: Record<string, unknown> }[];
}) => callApi(api.integrations.records.$post(input));
