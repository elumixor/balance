import { KIP_ORIGIN } from "$lib/core/env";

/** `kip:page/<id>` — the only URN this app knows how to open. */
const KIP_PAGE = /^kip:page\/(.+)$/;

/**
 * Where a block's linked work opens: a Kip page's embed for a `kip:page/<id>` URN, and nothing
 * for a scheme this app has no address for — the card then shows the URN as text.
 */
export function urnHref(urn: string): string | null {
  const page = KIP_PAGE.exec(urn);
  return page ? `${KIP_ORIGIN}/embed/page/${encodeURIComponent(page[1])}` : null;
}
