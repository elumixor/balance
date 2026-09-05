<script lang="ts">
  import { lookupPlace, MAP_PREVIEW, type PlaceDetails, placeUrl } from "$lib/places";
  import Skeleton from "./Skeleton.svelte";

  /**
   * A small map with a pin on an address, under the field it was typed into.
   *
   * It answers the one question a suggestion list can't: is this the right one of the three
   * streets with that name. The map is a picture the server draws, because the maps key must not
   * leave it — so this is a lookup, remembered for the session, and nothing at all when Google
   * knows no such place. Tapping it opens the place in Maps.
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
    /** The place as Google pinned it, once known — a picker saves its coordinates with it. */
    onplace?: (place: PlaceDetails) => void;
    onopen?: (url: string) => void;
  } = $props();

  let map = $state<string | null>(null);
  let place = $state<PlaceDetails | null>(null);
  let loading = $state(false);

  $effect(() => {
    const query = address.trim();
    const id = placeId;
    if (!query && !id) {
      map = null;
      place = null;
      return;
    }
    let live = true;
    loading = true;
    lookupPlace({ placeId: id, address: query, sessionToken })
      .then((answer) => {
        if (!live) return;
        map = answer.map;
        place = answer.place;
        if (answer.place) onplace?.(answer.place);
      })
      .catch(() => {
        if (live) map = null;
      })
      .finally(() => {
        if (live) loading = false;
      });
    return () => {
      live = false;
    };
  });

  const ratio = $derived(`${MAP_PREVIEW.width} / ${MAP_PREVIEW.height}`);
</script>

{#if loading && !map}
  <div style="aspect-ratio:{ratio}" class="w-full">
    <Skeleton height={MAP_PREVIEW.height} radius={8} />
  </div>
{:else if map && place}
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
    class="press-sm block w-full overflow-hidden rounded-lg border border-line bg-surface-alt"
    style="aspect-ratio:{ratio}"
  >
    <img src={map} alt="" class="size-full object-cover" draggable="false" />
  </a>
{/if}
