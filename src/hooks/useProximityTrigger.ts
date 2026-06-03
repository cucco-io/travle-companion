/**
 * src/hooks/useProximityTrigger.ts
 *
 * React hook for proximity-based POI triggers.
 * Connects the GPS tracker to the proximity engine and narration queue.
 * This is the main "glue" hook that coordinates the real-time travel experience.
 *
 * Dependencies:
 * - src/hooks/useGpsTracking.ts
 * - src/hooks/useNarrationPlayer.ts
 * - src/services/location/proximityEngine.ts
 * - src/types/poi.ts (POI)
 * - src/types/trip.ts (TripMode)
 * - React (useState, useEffect, useCallback, useRef)
 */

import { POI } from '../types/poi';
import { TripMode, TripLogEntry, GpsBreadcrumb } from '../types/trip';

/**
 * State returned by the useProximityTrigger hook.
 */
export interface ProximityTriggerState {
  /** Whether the proximity engine is active */
  isActive: boolean;

  /** The next upcoming POI (closest unplayed) */
  nextPOI: POI | null;

  /** Distance to the next POI in meters */
  distanceToNextPOI: number | null;

  /** Number of POIs remaining (not yet played/skipped) */
  remainingPOICount: number;

  /** Total POIs played so far */
  playedCount: number;

  /** Total POIs skipped so far */
  skippedCount: number;
}

/**
 * Hook for managing proximity-based POI triggering during an active trip.
 *
 * @param pois - Array of POIs for the trip
 * @param tripMode - 'city' or 'route'
 * @returns Object with proximity state and control functions
 *
 * Usage:
 * ```tsx
 * const {
 *   isActive,
 *   nextPOI,
 *   distanceToNextPOI,
 *   remainingPOICount,
 *   start,
 *   stop,
 *   getBreadcrumbs,
 *   getLog,
 * } = useProximityTrigger(trip.pois, trip.mode);
 * ```
 *
 * Implementation notes:
 * - On start():
 *   1. Initialize the proximity engine with the trip's POIs
 *   2. Start GPS tracking (useGpsTracking hook)
 *   3. On each GPS update:
 *      a. Feed location to proximity engine (updateLocation)
 *      b. Check if accuracy mode should switch (determineAccuracyMode)
 *      c. If a POI is triggered, enqueue it in the narration player
 *      d. Record a GPS breadcrumb
 *      e. Update nextPOI and distance state
 * - On stop():
 *   1. Stop GPS tracking
 *   2. Stop proximity engine
 *   3. Return collected breadcrumbs and log entries for persistence
 * - Use useEffect to clean up on unmount
 * - Update state reactively on proximity events and GPS updates
 */
export function useProximityTrigger(
  pois: POI[],
  tripMode: TripMode
): ProximityTriggerState & {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  getBreadcrumbs: () => GpsBreadcrumb[];
  getLog: () => TripLogEntry[];
} {
  // TODO: Implement proximity trigger hook
  // 1. Initialize proximity engine with POIs
  // 2. Set up GPS tracking integration
  // 3. Connect proximity events to narration queue
  // 4. Track state (next POI, distance, counts)
  // 5. Implement start/stop/pause/resume
  // 6. Expose breadcrumbs and log for post-trip save
  throw new Error('Not implemented');
}
