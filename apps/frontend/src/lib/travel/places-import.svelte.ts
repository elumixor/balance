import { preferences } from "$lib/account/preferences.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { type ImportedPlace, parseGooglePlaces } from "./google-places";

/**
 * A Google Maps export, opened and looked at before any of it becomes a place.
 *
 * The file arrives the two ways a file can — dropped on the window, or chosen in the places
 * settings — and neither of them imports anything. A `Saved Places.json` is nine hundred
 * restaurants; what this app wants out of it is Home, the office and the gym, so nothing starts
 * ticked and the sheet has a filter above the list.
 *
 * Everything it writes is written through `preferences.addLocation`, the same call the form on
 * that pane makes, so an imported place is in every way an ordinary one from the moment it lands.
 */
export interface PlaceCandidate {
  readonly key: string;
  readonly place: ImportedPlace;
  selected: boolean;
}

export class PlacesImport {
  /** The file being looked at, or null when the sheet is closed. */
  fileName = $state<string | null>(null);
  candidates = $state<PlaceCandidate[]>([]);
  /** What the last import added, kept until the sheet is dismissed. */
  imported = $state<number | null>(null);
  error = $state<string | null>(null);

  readonly open = $derived(this.fileName !== null);
  readonly selectedCount = $derived(this.candidates.filter((one) => one.selected).length);

  async receiveFile(file: File) {
    this.fileName = file.name;
    this.candidates = [];
    this.imported = null;
    this.error = null;
    try {
      this.#read(await file.text());
    } catch (e) {
      this.#fail("That file wouldn't open.", e);
    }
  }

  #read(text: string) {
    const places = parseGooglePlaces(text);
    if (places.length === 0) {
      this.#fail("No places in that file.");
      return;
    }
    // Nothing is ticked: a starred list is hundreds long, and the four worth naming are picked.
    this.candidates = places.map((place, index) => ({ key: `${index}`, place, selected: false }));
  }

  #fail(message: string, error?: unknown) {
    this.error = message;
    diagnostics.report("Import", error ?? message, { title: message.replace(/\.$/, "") });
  }

  dismiss() {
    this.fileName = null;
    this.candidates = [];
    this.imported = null;
    this.error = null;
  }

  toggle(key: string) {
    for (const candidate of this.candidates) {
      if (candidate.key === key) candidate.selected = !candidate.selected;
    }
  }

  /** Ticks or unticks what is on screen, which with a filter above the list is not all of it. */
  toggleAll(keys: readonly string[], selected: boolean) {
    const wanted = new Set(keys);
    for (const candidate of this.candidates) {
      if (wanted.has(candidate.key)) candidate.selected = selected;
    }
  }

  /**
   * Saves what is ticked. A place the export never spelled out is saved under its own name — a
   * label with coordinates still routes, and "Work" is a better address than nothing at all.
   */
  import(icon: (place: ImportedPlace) => string | undefined) {
    const queue = this.candidates.filter((one) => one.selected);
    if (queue.length === 0) return;
    for (const { place } of queue) {
      preferences.addLocation({
        label: place.label,
        address: place.address || place.label,
        icon: icon(place),
        placeId: null,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    }
    // What landed leaves the list, so pressing the button twice can't save the same place twice.
    this.candidates = this.candidates.filter((one) => !one.selected);
    this.imported = queue.length;
  }
}

export const placesImport = new PlacesImport();
