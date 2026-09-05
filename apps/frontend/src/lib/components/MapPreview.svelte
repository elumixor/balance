<script lang="ts">
  import { tilesFor } from "$lib/map-tiles";
  import { lookupPlace, type PlaceDetails, placeUrl } from "$lib/places";
  import { MapPin } from "lucide-svelte";
  import Skeleton from "./Skeleton.svelte";

  /**
   * A small map with a pin on an address, under the field it was typed into.
   *
   * It answers the one question a suggestion list can't: is this the right one of the three
   * streets with that name. Google pins the address down — that is a lookup, remembered for the
   * session — and the picture is OpenStreetMap's tiles under the pin, because a still map needs
   * no library and no billing. Nothing at all when Google knows no such place. Tapping it opens
   * the place in Maps.
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

  const WIDTH = 320;
  const HEIGHT = 140;
  /** Streets legible, the block recognisable. */
  const ZOOM = 15;

  let place = $state<PlaceDetails | null>(null);
  let loading = $state(false);

  $effect(() => {
    const query = address.trim();
    const id = placeId;
    if (!query && !id) {
      place = null;
      return;
    }
    let live = true;
    loading = true;
    lookupPlace({ placeId: id, address: query, sessionToken })
      .then((answer) => {
        if (!live) return;
        place = answer;
        if (answer) onplace?.(answer);
      })
      .catch(() => {
        if (live) place = null;
      })
      .finally(() => {
        if (live) loading = false;
      });
    return () => {
      live = false;
    };
  });

  /** The frame's real width, so the tile layer can be scaled to fit it as one picture. */
  let width = $state(WIDTH);

  const tiles = $derived(
    place ? tilesFor({ latitude: place.latitude, longitude: place.longitude, zoom: ZOOM, width: WIDTH, height: HEIGHT }) : [],
  );
</script>

{#if loading && !place}
  <Skeleton height={HEIGHT} radius={8} />
{:else if place}
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
    style="aspect-ratio:{WIDTH} / {HEIGHT};--fit:{width / WIDTH}"
    bind:clientWidth={width}
  >
    <!-- The tiles are laid out for a 320-wide frame and the frame scales as one, so the
         pin stays over the same street whatever width the card gives it. -->
    <div class="absolute inset-0 origin-top-left" style="width:{WIDTH}px;height:{HEIGHT}px;scale:var(--fit)">
      <div class="map-tiles absolute inset-0">
        {#each tiles as tile (tile.url)}
          <img src={tile.url} alt="" draggable="false" class="absolute max-w-none" style="left:{tile.left}px;top:{tile.top}px;width:256px;height:256px" />
        {/each}
      </div>
      <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-ink drop-shadow-sm">
        <MapPin size={26} strokeWidth={2.25} fill="var(--surface)" />
      </span>
    </div>
  </a>
{/if}

<style>
  /* Tiles are drawn for daylight; in the dark they are dimmed rather than inverted, so the streets stay readable. */
  :global(html.dark) .map-tiles {
    filter: brightness(0.8) saturate(0.85);
  }
</style>
