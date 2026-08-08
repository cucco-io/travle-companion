/**
 * src/theme/icons.ts
 *
 * Centralized icon mapping — replaces ALL emoji throughout the app
 * with SF Symbols (iOS) and Material Symbols (Android/Web).
 *
 * Usage with expo-symbols SymbolView:
 *   <SymbolView name={Icons.mappin} tintColor={color} size={20} />
 */

import type { POI } from '@/src/types/poi';

/** Platform-specific symbol names for expo-symbols SymbolView */
export type SymbolName = {
  ios: any;
  android: any;
  web: any;
};

function sym(ios: any, android: any): SymbolName {
  return { ios, android, web: android };
}

// ─── Icon Registry ──────────────────────────────────────────────────────────────

export const Icons = {
  // ── Navigation ────────────────────────────────────────────────────────────
  explore: sym('safari', 'explore'),
  trips: sym('map', 'map'),
  settings: sym('gearshape', 'settings'),

  // ── POI Categories ────────────────────────────────────────────────────────
  historicalLandmark: sym('building.columns', 'museum'),
  museum: sym('building.columns', 'museum'),
  church: sym('building', 'church'),
  park: sym('leaf', 'park'),
  naturalLandmark: sym('mountain.2', 'landscape'),
  monument: sym('building.2', 'account_balance'),
  culturalSite: sym('theatermasks', 'theater_comedy'),
  quirky: sym('sparkles', 'auto_awesome'),
  otherPoi: sym('mappin', 'location_on'),

  // ── Actions ───────────────────────────────────────────────────────────────
  play: sym('play.fill', 'play_arrow'),
  pause: sym('pause.fill', 'pause'),
  skipForward: sym('forward.end.fill', 'skip_next'),
  stop: sym('stop.fill', 'stop'),
  bookmark: sym('bookmark', 'bookmark_border'),
  bookmarkFilled: sym('bookmark.fill', 'bookmark'),
  trash: sym('trash', 'delete'),
  pencil: sym('pencil', 'edit'),
  share: sym('square.and.arrow.up', 'share'),
  close: sym('xmark', 'close'),
  chevronRight: sym('chevron.right', 'chevron_right'),
  chevronDown: sym('chevron.down', 'expand_more'),
  chevronUp: sym('chevron.up', 'expand_less'),
  arrowClockwise: sym('arrow.clockwise', 'sync'),
  replay: sym('arrow.counterclockwise', 'replay'),

  // ── Trip Status ───────────────────────────────────────────────────────────
  checkmarkCircle: sym('checkmark.circle.fill', 'check_circle'),
  checkmark: sym('checkmark', 'check'),
  clock: sym('clock', 'schedule'),
  warningTriangle: sym('exclamationmark.triangle', 'warning'),
  bolt: sym('bolt.fill', 'bolt'),
  circle: sym('circle', 'radio_button_unchecked'),

  // ── Trip Planning ─────────────────────────────────────────────────────────
  location: sym('location.fill', 'my_location'),
  mappin: sym('mappin', 'place'),
  mappinCircle: sym('mappin.circle.fill', 'place'),
  route: sym('point.topleft.down.to.point.bottomright.curvepath', 'route'),
  city: sym('building.2', 'location_city'),
  globe: sym('globe', 'language'),
  calendar: sym('calendar', 'calendar_today'),

  // ── Settings ──────────────────────────────────────────────────────────────
  speaker: sym('speaker.wave.2', 'volume_up'),
  speakerSlash: sym('speaker.slash', 'volume_off'),
  microphone: sym('mic', 'mic'),
  storage: sym('internaldrive', 'storage'),
  info: sym('info.circle', 'info'),
  paintbrush: sym('paintbrush', 'palette'),
  sunMax: sym('sun.max', 'light_mode'),
  moon: sym('moon', 'dark_mode'),
  circleHalfFilled: sym('circle.lefthalf.filled', 'contrast'),
  figureChild: sym('figure.and.child.holdinghands', 'family_restroom'),
  wand: sym('wand.and.stars', 'auto_fix_high'),

  // ── Interest Categories ───────────────────────────────────────────────────
  interestHistory: sym('building.columns', 'museum'),
  interestNature: sym('leaf', 'park'),
  interestArchitecture: sym('building.2.crop.circle', 'architecture'),
  interestFoodCulture: sym('fork.knife', 'restaurant'),
  interestQuirky: sym('theatermasks', 'theater_comedy'),

  // ── Pipeline Steps ────────────────────────────────────────────────────────
  mapMagnify: sym('map', 'map'),
  mappinAndEllipse: sym('mappin.and.ellipse', 'explore'),
  sparkles: sym('sparkles', 'auto_awesome'),
  textQuote: sym('text.quote', 'description'),
  waveform: sym('waveform', 'graphic_eq'),
  photoOnRect: sym('photo.on.rectangle', 'image'),
  partyPopper: sym('party.popper', 'celebration'),
  gearshape: sym('gearshape.2', 'settings'),

  // ── Misc ──────────────────────────────────────────────────────────────────
  compass: sym('safari', 'explore'),
  target: sym('target', 'gps_fixed'),
  docText: sym('doc.text', 'description'),
  docMagnify: sym('doc.text.magnifyingglass', 'search'),
  headphones: sym('headphones', 'headphones'),
  musicNoteList: sym('music.note.list', 'queue_music'),
  roadLanes: sym('road.lanes', 'route'),
  ruler: sym('ruler', 'straighten'),
  trophy: sym('trophy', 'emoji_events'),
  figureWalk: sym('figure.walk', 'directions_walk'),
} as const;

// ─── POI Category → Icon Mapping ────────────────────────────────────────────────

/**
 * Returns the icon symbol name for a given POI category.
 * Replaces the duplicated `categoryIcon()` emoji function across 4 files.
 */
export function getCategoryIcon(category: POI['category']): SymbolName {
  const map: Record<POI['category'], SymbolName> = {
    historical_landmark: Icons.historicalLandmark,
    museum: Icons.museum,
    church: Icons.church,
    park: Icons.park,
    natural_landmark: Icons.naturalLandmark,
    monument: Icons.monument,
    cultural_site: Icons.culturalSite,
    quirky: Icons.quirky,
    other: Icons.otherPoi,
  };
  return map[category] ?? Icons.otherPoi;
}
