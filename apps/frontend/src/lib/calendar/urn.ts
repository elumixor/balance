import { KEEP_ORIGIN } from "$lib/core/env";

/** A Keep page's link, `https://keep.desk.atmagaming.com/p/<id>`, or the legacy `keep:page/<id>` URN. */
const KEEP_PAGE = /^(?:keep:page\/|https:\/\/keep\.desk\.atmagaming\.com\/p\/)([^/?#]+)\/?$/;

/**
 * Where a block's linked work opens: a Keep page's embed for a Keep page link, the link itself for
 * any other https URL, and nothing for what this app has no address for — the card then shows it as text.
 */
export function urnHref(link: string): string | null {
  const page = KEEP_PAGE.exec(link);
  if (page) return `${KEEP_ORIGIN}/embed/page/${encodeURIComponent(decodeURIComponent(page[1]))}`;
  return /^https:\/\//.test(link) ? link : null;
}
