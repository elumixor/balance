import { eventHandler, getRouterParam, sendRedirect } from "h3";
import { env } from "~/lib/env";
import { NotFoundError } from "~/lib/http/api-error";

/**
 * The macOS app and the manifest the installed one reads, wherever they actually live.
 *
 * These are built on a Mac and published to a blob store (`scripts/publish-download.ts`), because
 * a deployment of the site is made by a Linux container that cannot build them — and a site that
 * carried them would drop them every time it was deployed on its own. The address stays
 * `/download/latest.json` because that is what every copy of the app already asks for; this is the
 * one line that says where that has moved to.
 */
export default eventHandler(async (event) => {
  const path = getRouterParam(event, "path");
  if (!path) throw new NotFoundError("There is no such download");
  return await sendRedirect(event, `${env.DOWNLOAD_BASE_URL}/download/${path}`, 302);
});
