/**
 * src/services/location/proximityEngine.ts
 *
 * Proximity trigger engine — determines when the user is close enough
 * to a POI to trigger its narration.
 *
 * This is the core real-time decision engine during an active trip.
 * It receives GPS updates and decides:
 * 1. Which POI (if any) the user has entered the trigger zone of
 * 2. Whether to fire the narration (respecting cooldowns and skip history)
 * 3. When to switch GPS accuracy modes
 *
 * Dependencies:
 * - src/types/poi.ts (POI)
 * - src/types/trip.ts (TripMode)
 * - src/utils/geo.ts (haversineDistance)
 * - src/constants/config.ts (trigger radii, cooldowns)
 */

import { POI } from '../../types/poi';
import { TripMode } from '../../types/trip';
import { haversineDistance } from '../../utils/geo';
import { CONFIG } from '../../constants/config';

/**
 * Event emitted when a POI's trigger zone is entered.
 */
export interface ProximityEvent {
  /** The POI that was triggered */
  poi: POI;

  /** Distance from the user to the POI in meters */
  distanceMeters: number;

  /** Timestamp of the trigger */
  timestamp: string;
}

/**
 * Callback for when a POI is triggered by proximity.
 */
export type ProximityCallback = (event: ProximityEvent) => void;

/**
 * State tracked internally by the proximity engine.
 */
export interface ProximityEngineState {
  /** List of POIs that haven't been played yet */
  remainingPOIs: POI[];

  /** Timestamp (epoch ms) of the last narration trigger */
  lastTriggerTime: number;

  /** Set of POI IDs that have been played or skipped */
  playedPOIIds: Set<string>;

  /** Current trip mode (affects trigger radius) */
  tripMode: TripMode;
}

/**
 * Initializes the proximity engine with a list of POIs for the trip.
 */
export function initProximityEngine(
  pois: POI[],
  tripMode: TripMode,
  onProximityTrigger: ProximityCallback
): {
  updateLocation: (lat: number, lng: number) => void;
  markPlayed: (poiId: string) => void;
  markSkipped: (poiId: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getState: () => ProximityEngineState;
} {
  const sortedPOIs = [...pois];

  const state: ProximityEngineState = {
    remainingPOIs: sortedPOIs,
    lastTriggerTime: 0,
    playedPOIIds: new Set<string>(),
    tripMode,
  };

  let isPaused = false;
  let isStopped = false;

  const updateLocation = (lat: number, lng: number) => {
    if (isPaused || isStopped) return;

    const event = checkProximity(lat, lng, state);
    if (event) {
      state.playedPOIIds.add(event.poi.id);
      state.lastTriggerTime = Date.now();
      onProximityTrigger(event);
    }
  };

  const markPlayed = (poiId: string) => {
    state.playedPOIIds.add(poiId);
  };

  const markSkipped = (poiId: string) => {
    state.playedPOIIds.add(poiId);
  };

  const pause = () => {
    isPaused = true;
  };

  const resume = () => {
    isPaused = false;
  };

  const stop = () => {
    isStopped = true;
    isPaused = false;
  };

  const getState = () => {
    return state;
  };

  return {
    updateLocation,
    markPlayed,
    markSkipped,
    pause,
    resume,
    stop,
    getState,
  };
}

/**
 * Checks if any unplayed POI is within trigger range of the given location.
 */
export function checkProximity(
  lat: number,
  lng: number,
  state: ProximityEngineState
): ProximityEvent | null {
  const now = Date.now();
  if (now - state.lastTriggerTime < CONFIG.NARRATION.COOLDOWN_MS) {
    return null;
  }

  const unplayedPOIs = state.remainingPOIs.filter(
    (poi) => !state.playedPOIIds.has(poi.id)
  );

  if (unplayedPOIs.length === 0) {
    return null;
  }

  const nextPOI = unplayedPOIs[0];
  const dist = haversineDistance(
    lat,
    lng,
    nextPOI.coordinates.lat,
    nextPOI.coordinates.lng
  );

  const defaultRadius =
    state.tripMode === 'city'
      ? CONFIG.TRIGGER_RADIUS.CITY_MODE_METERS
      : CONFIG.TRIGGER_RADIUS.ROUTE_MODE_METERS;

  const triggerRadius = nextPOI.trigger_radius_meters || defaultRadius;

  if (dist <= triggerRadius) {
    return {
      poi: nextPOI,
      distanceMeters: dist,
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Finds the next upcoming POI based on the user's current location.
 */
export function findNextPOI(
  lat: number,
  lng: number,
  state: ProximityEngineState
): { poi: POI; distanceMeters: number } | null {
  const unplayedPOIs = state.remainingPOIs.filter(
    (poi) => !state.playedPOIIds.has(poi.id)
  );

  if (unplayedPOIs.length === 0) {
    return null;
  }

  const nextPOI = unplayedPOIs[0];
  const dist = haversineDistance(
    lat,
    lng,
    nextPOI.coordinates.lat,
    nextPOI.coordinates.lng
  );

  return {
    poi: nextPOI,
    distanceMeters: dist,
  };
}
