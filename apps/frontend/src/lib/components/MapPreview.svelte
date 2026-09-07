<script lang="ts">
  import { lookupPlace, MAP_PREVIEW, mapAround, type PlaceDetails, placeUrl } from "$lib/travel/places";
  import { theme } from "$lib/ui/theme.svelte";
  import { MapPin } from "lucide-svelte";
  import Skeleton from "./Skeleton.svelte";

  /**
   * A small map with a pin on an address, under the field it was typed into.
   *
   * It answers the one question a suggestion list can't: is this the right one of the three
   * streets with that name. Google pins the address down and draws the map, both through the
   * server because the key lives there, and both remembered for the session. Nothing at all
   * when Google knows no such place. Tapping it opens the place in Maps.
   */
  let {
    address,
    placeId = null,
    sessionToken,
    onplace,
    onopen,
  }: {
    address: string;
    /** Google's own id, when a suggestion was chosen — cheaper and surer than the words. */
    placeId?: string | null;
    /** The autocomplete session the suggestion came from, so Google bills it as one. */
    sessionToken?: string;
    /**
     * The place as Google pinned it, once known, with the text it was looked up for — a picker
     * saves its coordinates with it, and keeps the text so it can tell a stale pin from a live
     * one. It is never an answer to what the field should say: the words in the field are the
     * ones being typed, and replacing them under the caret is how typing an address became
     * impossible.
     */
    onplace?: (place: PlaceDetails, query: string) => void;
    onopen?: (url: string) => void;
  } = $props();

  let place = $state<PlaceDetails | null>(null);
  let image = $state<string | null>(null);
  let loading = $state(false);

  $effect(() => {
    const query = address.trim();
    const id = placeId;
    const dark = theme.scheme === "dark";
    if (!query && !id) {
      place = null;
      image = null;
      return;
    }
    let live = true;
    loading = true;
    lookupPlace({ placeId: id, address: query, sessionToken })
      .then((answer) => {
        if (!live) return null;
        place = answer;
        if (answer) onplace?.(answer, query);
        return answer ? mapAround({ latitude: answer.latitude, longitude: answer.longitude, dark }) : null;
      })
      .then((picture) => {
        if (live) image = picture;
      })
      .catch(() => {
        if (live) image = null;
      })
      .finally(() => {
        if (live) loading = false;
      });
    return () => {
      live = false;
    };
  });
</script>

{#if loading && !image}
  <Skeleton height={MAP_PREVIEW.height} radius={8} />
{:else if place && image}
  {@const url = placeUrl(place)}
  <a
    href={url}
    target="_blank"
    rel="noreferrer"
    onclick={(e) => {
      if (!onopen) return;
      e.preventDefault();
      onopen(url);
    }}
    aria-label="Open {place.address} in Maps"
    class="press-sm relative block w-full overflow-hidden rounded-lg border border-line bg-surface-alt"
    style="aspect-ratio:{MAP_PREVIEW.width} / {MAP_PREVIEW.height}"
  >
    <img src={image} alt="" draggable="false" class="size-full object-cover" />
    <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-ink drop-shadow-sm">
      <MapPin size={26} strokeWidth={2.25} fill="var(--surface)" />
    </span>
  </a>
{/if}
