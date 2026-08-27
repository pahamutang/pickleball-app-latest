import { ImageSourcePropType } from 'react-native';
import type { VenuePhoto } from '../context/VenuePhotosContext';

// The venue carousel always has these 5 bundled photos as its base layer,
// shown until the owner replaces one from "Edit Photos". Position in this
// array IS the slide's slot number (0-4) — a custom photo with
// `position: 2` overrides court_3.jpg specifically, and nothing else.
export const DEFAULT_VENUE_PHOTOS: ImageSourcePropType[] = [
  require('../../assets/venue/court_1.jpg'),
  require('../../assets/venue/court_2.jpg'),
  require('../../assets/venue/court_3.jpg'),
  require('../../assets/venue/court_4.jpg'),
  require('../../assets/venue/court_5.jpg'),
];

export const SLOT_COUNT = DEFAULT_VENUE_PHOTOS.length;

export type VenueSlide =
  // A default slide the owner has never touched — slot 0-4, bundled asset.
  | { kind: 'default'; slot: number; source: ImageSourcePropType }
  // A default slide (0-4) the owner has replaced with their own photo.
  // Removing this one reverts that slot back to its bundled default —
  // it never removes the slide itself.
  | { kind: 'custom'; slot: number; source: ImageSourcePropType; photo: VenuePhoto }
  // A photo added beyond the 5 base slides. Removing this one removes
  // the slide entirely, since there's no default underneath it.
  | { kind: 'extra'; source: ImageSourcePropType; photo: VenuePhoto };

// Builds the ordered list of slides the carousel (and the manager) both
// render from, so they can never disagree about what's showing where.
// Every one of the 5 base slots always renders — as the bundled default,
// or as whichever custom photo has that exact `position` — followed by
// any extra photos (position >= SLOT_COUNT) in position order.
export function buildVenueSlides(photos: VenuePhoto[]): VenueSlide[] {
  const byPosition = new Map(photos.map((p) => [p.position, p]));

  const core: VenueSlide[] = DEFAULT_VENUE_PHOTOS.map((source, slot) => {
    const override = byPosition.get(slot);
    return override
      ? { kind: 'custom' as const, slot, source: { uri: override.url }, photo: override }
      : { kind: 'default' as const, slot, source };
  });

  const extras: VenueSlide[] = photos
    .filter((p) => p.position >= SLOT_COUNT)
    .sort((a, b) => a.position - b.position)
    .map((photo) => ({ kind: 'extra' as const, source: { uri: photo.url }, photo }));

  return [...core, ...extras];
}

// Where a brand-new "Add Photo" (not a slot replacement) should land —
// always after every existing slide, base or extra, so it never collides
// with a slot position and never overwrites anything.
export function nextExtraPosition(photos: VenuePhoto[]): number {
  const maxPosition = photos.reduce((max, p) => Math.max(max, p.position), SLOT_COUNT - 1);
  return maxPosition + 1;
}
