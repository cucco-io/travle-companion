/**
 * src/hooks/useGpsTracking.ts
 *
 * React hook for GPS tracking state management.
 * Wraps the gpsTracker service in a React-friendly interface with
 * state updates, cleanup, and permission handling.
 *
 * Dependencies:
 * - src/services/location/gpsTracker.ts
 * - src/types/trip.ts (GpsBreadcrumb)
 * - React (useState, useEffect, useCallback, useRef)
 */

import { GpsBreadcrumb } from '../types/trip';
import { GpsAccuracyMode } from '../services/location/gpsTracker';

/**
 * State returned by the useGpsTracking hook.
 */
export interface GpsTrackingState {
  /** Whether GPS tracking is currently active */
  isTracking: boolean;

  /** Current GPS accuracy mode */
  accuracyMode: GpsAccuracyMode;

  /** Latest location update */
  currentLocation: { lat: number; lng: number; accuracy: number } | null;

  /** Whether location permissions are granted */
  hasPermission: boolean;

  /** Error message if something went wrong */
  error: string | null;

  /** Collected GPS breadcrumbs during the session */
  breadcrumbs: GpsBreadcrumb[];
}

/**
 * Hook for managing GPS tracking during an active trip.
 *
 * @returns Object with tracking state and control functions
 *
 * Usage:
 * ```tsx
 * const {
 *   isTracking,
 *   currentLocation,
 *   breadcrumbs,
 *   startTracking,
 *   stopTracking,
 *   switchMode,
 * } = useGpsTracking();
 * ```
 *
 * Implementation notes:
 * - Use useState for isTracking, accuracyMode, currentLocation, etc.
 * - Use useRef to hold the cleanup function from gpsTracker.startTracking()
 * - Use useEffect for cleanup on unmount (stop tracking)
 * - startTracking: request permissions, then call gpsTracker.startTracking()
 * - stopTracking: call the cleanup function, reset state
 * - switchMode: call gpsTracker.switchAccuracyMode() and update state
 * - Accumulate breadcrumbs in a ref (not state — to avoid excessive re-renders)
 * - Expose breadcrumbs via a getter that copies the ref value
 */
export function useGpsTracking(): GpsTrackingState & {
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  switchMode: (mode: GpsAccuracyMode) => Promise<void>;
  clearBreadcrumbs: () => void;
} {
  // TODO: Implement GPS tracking hook
  // 1. Initialize state with defaults
  // 2. Implement startTracking with permission check
  // 3. Implement stopTracking with cleanup
  // 4. Implement switchMode
  // 5. Return state and control functions
  throw new Error('Not implemented');
}
