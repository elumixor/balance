import { KEEP_ORIGIN } from "$lib/core/env";

/** `keep:page/<id>` — the only URN this app knows how to open. */
const KEEP_PAGE = /^keep:page\/(.+)$/;

/**
 * Where a block's linked work opens: a Keep page's embed for a `keep:page/<id>` URN, and nothing
 * for a scheme this app has no address for — the card then shows the URN as text.
 */
export function urnHref(urn: string): string | null {
  const page = KEEP_PAGE.exec(urn);
  return page ? `${KEEP_ORIGIN}/embed/page/${encodeURIComponent(page[1])}` : null;
}
