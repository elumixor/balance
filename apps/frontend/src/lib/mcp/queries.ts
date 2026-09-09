import { api, callApi } from "$lib/core/api";

/** A key that has been made, without its secret — that exists once, in the answer to `createKey`. */
export interface McpKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export const listMcpKeys = () => callApi(api.mcp.keys.$get()).then((r) => r.keys as McpKey[]);

export const createMcpKey = (name: string) =>
  callApi(api.mcp.keys.$post({ name })).then((r) => r as { token: string; key: McpKey });

export const revokeMcpKey = (id: string) => callApi(api.mcp.keys(id).$delete());
