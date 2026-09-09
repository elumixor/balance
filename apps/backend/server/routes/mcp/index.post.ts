import { eventHandler, readBody, setResponseHeader } from "h3";
import { authenticateMcp } from "~/lib/mcp/authenticate";
import { handleMessage } from "~/lib/mcp/protocol";

/**
 * The Model Context Protocol endpoint — one POST, one answer, nothing remembered in between.
 *
 * Stateless on purpose: this runs as a serverless function, where two calls from the same client
 * are two processes, so a session id would be a promise the deployment cannot keep. Everything
 * the server needs is in the request, and the key it carries says whose account it is about.
 *
 * A batch (a JSON array) is answered as a batch, because a client speaking the 2025-03-26 version
 * may still send one; a batch of notifications alone is answered with 202 and no body.
 */
export default eventHandler(async (event) => {
  const user = await authenticateMcp(event);
  const body = await readBody(event);

  setResponseHeader(event, "cache-control", "no-store");

  if (Array.isArray(body)) {
    const answers = (await Promise.all(body.map((message) => handleMessage(message, user)))).filter(
      (answer) => answer !== null,
    );
    if (answers.length === 0) {
      event.node.res.statusCode = 202;
      return null;
    }
    return answers;
  }

  const answer = await handleMessage(body, user);
  if (!answer) {
    event.node.res.statusCode = 202;
    return null;
  }
  return answer;
});
