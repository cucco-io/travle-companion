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
import { TripMode, TripLogEntry } from '../../types/trip';

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
 *
 * TODO: This interface defines the internal state. Implementer should
 * manage this as a class instance or module-level state.
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
 *
 * @param pois - All POIs for the active trip
 * @param tripMode - 'city' or 'route' — determines trigger radius
 * @param onProximityTrigger - Callback fired when a POI should be narrated
 * @returns Engine control functions (update, pause, resume, stop)
 *
 * Implementation notes:
 * - Store the POIs sorted by priority (highest first)
 * - Initialize the playedPOIIds set as empty
 * - Set lastTriggerTime to 0 (allows immediate first trigger)
 * - The engine is passive — it doesn't poll GPS. Instead, call updateLocation()
 *   on each GPS update from the gpsTracker.
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
  // TODO: Implement proximity engine initialization
  // Return an object with control functions
  throw new Error('Not implemented');
}

/**
 * Checks if any unplayed POI is within trigger range of the given location.
 *
 * @param lat - User's current latitude
 * @param lng - User's current longitude
 * @param state - Current engine state
 * @returns The closest triggered POI, or null if none are in range
 *
 * Implementation notes:
 * - For each remaining POI, calculate haversine distance
 * - Check if distance ≤ POI's trigger_radius_meters
 * - If multiple POIs are in range, pick the one with highest priority
 * - Check cooldown: skip if (now - lastTriggerTime) < CONFIG.NARRATION.COOLDOWN_MS
 * - Only trigger POIs that haven't been played or skipped
 *
 * @see src/utils/geo.ts haversineDistance
 * @see src/constants/config.ts NARRATION.COOLDOWN_MS
 */
export function checkProximity(
  lat: number,
  lng: number,
  state: ProximityEngineState
): ProximityEvent | null {
  // TODO: Implement proximity checking
  // 1. Filter remaining POIs (not played, not skipped)
  // 2. Calculate distance to each
  // 3. Find closest within trigger radius
  // 4. Check cooldown timer
  // 5. Return ProximityEvent or null
  throw new Error('Not implemented');
}

/**
 * Finds the next upcoming POI based on the user's current location.
 *
 * Used by the GPS tracker to determine when to switch accuracy modes.
 *
 * @param lat - User's current latitude
 * @param lng - User's current longitude
 * @param state - Current engine state
 * @returns The closest unplayed POI and its distance, or null if all played
 */
export function findNextPOI(
  lat: number,
  lng: number,
  state: ProximityEngineState
): { poi: POI; distanceMeters: number } | null {
  // TODO: Implement next POI finding
  // 1. Filter remaining (unplayed) POIs
  // 2. Calculate distance to each
  // 3. Return the closest one
  throw new Error('Not implemented');
}
