/**
 * src/services/location/gpsTracker.ts
 *
 * GPS tracking service with adaptive power modes.
 * Manages location subscriptions with two modes:
 * 1. Power-saving: Uses significant-change monitoring (500m threshold)
 * 2. High-accuracy: Uses continuous GPS tracking for precise proximity triggers
 *
 * Automatically switches between modes based on distance to the next POI.
 *
 * Dependencies:
 * - expo-location (Location.watchPositionAsync, Location.startLocationUpdatesAsync)
 * - src/constants/config.ts (GPS thresholds)
 * - src/types/trip.ts (GpsBreadcrumb)
 */

import { GpsBreadcrumb } from '../../types/trip';
import { POI } from '../../types/poi';

/**
 * GPS accuracy mode — determines power consumption vs. precision tradeoff.
 */
export type GpsAccuracyMode = 'power_saving' | 'high_accuracy';

/**
 * Callback type for location updates.
 */
export type LocationUpdateCallback = (location: {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}) => void;

/**
 * Starts GPS tracking with adaptive power management.
 *
 * @param onLocationUpdate - Callback fired on each location update
 * @param initialMode - Starting accuracy mode (default: 'power_saving')
 * @returns A cleanup function to stop tracking
 *
 * Implementation notes:
 * - Use expo-location's Location.watchPositionAsync()
 * - In 'power_saving' mode:
 *   - accuracy: Location.Accuracy.Balanced
 *   - distanceInterval: CONFIG.GPS.SIGNIFICANT_CHANGE_METERS (500m)
 *   - timeInterval: 30_000 (30 seconds)
 * - In 'high_accuracy' mode:
 *   - accuracy: Location.Accuracy.BestForNavigation
 *   - distanceInterval: 10 (10 meters)
 *   - timeInterval: 3_000 (3 seconds)
 * - Request foreground location permissions before starting
 * - Handle permission denied gracefully
 *
 * @throws Error if location permissions are denied
 */
export async function startTracking(
  onLocationUpdate: LocationUpdateCallback,
  initialMode?: GpsAccuracyMode
): Promise<() => void> {
  // TODO: Implement GPS tracking with expo-location
  // 1. Request foreground location permissions
  // 2. Start Location.watchPositionAsync with mode-appropriate options
  // 3. Return a cleanup function that calls subscription.remove()
  throw new Error('Not implemented');
}

/**
 * Switches the GPS tracking accuracy mode.
 *
 * Called by the proximity engine when the user gets close to a POI
 * (switch to high_accuracy) or moves far away (switch to power_saving).
 *
 * @param mode - The new accuracy mode
 *
 * Implementation notes:
 * - Stop the current location subscription
 * - Start a new subscription with the new mode's settings
 * - This transition should be seamless (no gap in tracking)
 * - Log mode switches for debugging
 */
export async function switchAccuracyMode(
  mode: GpsAccuracyMode
): Promise<void> {
  // TODO: Implement mode switching
  // 1. Remove current location subscription
  // 2. Start new subscription with updated accuracy settings
  throw new Error('Not implemented');
}

/**
 * Determines whether the GPS mode should switch based on distance to the next POI.
 *
 * @param currentLat - User's current latitude
 * @param currentLng - User's current longitude
 * @param nextPOI - The next upcoming POI
 * @param currentMode - The current GPS accuracy mode
 * @returns The mode that should be active (may be same as current)
 *
 * Implementation notes:
 * - Calculate distance to nextPOI using haversineDistance()
 * - If distance < CONFIG.GPS.HIGH_ACCURACY_THRESHOLD_METERS → 'high_accuracy'
 * - Otherwise → 'power_saving'
 * - Add hysteresis to avoid rapid switching (e.g., ±500m buffer)
 */
export function determineAccuracyMode(
  currentLat: number,
  currentLng: number,
  nextPOI: POI,
  currentMode: GpsAccuracyMode
): GpsAccuracyMode {
  // TODO: Implement mode determination with hysteresis
  throw new Error('Not implemented');
}

/**
 * Records a GPS breadcrumb for post-trip route visualization.
 *
 * @param lat - Current latitude
 * @param lng - Current longitude
 * @returns A GpsBreadcrumb object with the current timestamp
 *
 * Implementation notes:
 * - Create a breadcrumb with ISO 8601 timestamp
 * - These are stored in-memory during the trip and persisted on completion
 * - Consider downsampling if breadcrumbs accumulate too fast
 */
export function createBreadcrumb(
  lat: number,
  lng: number
): GpsBreadcrumb {
  // TODO: Implement breadcrumb creation
  throw new Error('Not implemented');
}

/**
 * Requests location permissions from the user.
 *
 * @returns True if foreground location permission is granted
 *
 * Implementation notes:
 * - Use Location.requestForegroundPermissionsAsync()
 * - Check the `status` field of the response
 * - If denied, show a helpful message explaining why location is needed
 * - Consider also requesting background location for future features
 */
export async function requestLocationPermissions(): Promise<boolean> {
  // TODO: Implement permission request
  throw new Error('Not implemented');
}
