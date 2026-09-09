import { eventHandler, readBody, setResponseStatus } from "h3";
import { mcpOAuth, oauthErrorBody } from "~/lib/mcp/oauth";

/**
 * RFC 7591 dynamic client registration, and deliberately unauthenticated — the client registering
 * is a browser tab somebody is adding a connector from, which has no session and nothing to prove.
 * What it gets is a name and a redirect: permission is a separate question, asked of a person.
 */
export default eventHandler(async (event) => {
  const body = (await readBody(event)) as { redirect_uris?: unknown; client_name?: unknown } | undefined;
  const redirectUris = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];

  try {
    const client = await mcpOAuth.register({
      redirectUris,
      clientName: typeof body?.client_name === "string" ? body.client_name : undefined,
    });
    setResponseStatus(event, 201);
    return client;
  } catch (error) {
    const { status, body: answer } = oauthErrorBody(error);
    setResponseStatus(event, status);
    return answer;
  }
});
