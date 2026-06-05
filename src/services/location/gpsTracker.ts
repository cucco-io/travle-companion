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

import * as Location from 'expo-location';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – expo-task-manager ships no bundled type declarations
import * as TaskManager from 'expo-task-manager';
import { CONFIG } from '../../constants/config';
import { GpsBreadcrumb } from '../../types/trip';
import { POI } from '../../types/poi';
import { addBreadcrumb } from '../storage/tripStorage';
import { haversineDistance } from '../../utils/geo';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';

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

let currentSubscription: Location.LocationSubscription | null = null;
let currentCallback: LocationUpdateCallback | null = null;
let currentMode: GpsAccuracyMode = 'power_saving';
let isTrackingActive = false;
let currentTripId: string | null = null;
let lastBreadcrumbTime = 0;

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: { data: unknown; error: unknown }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    for (const location of locations) {
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      const accuracy = location.coords.accuracy || 0;
      const timestamp = location.timestamp;

      if (currentCallback) {
        currentCallback({ lat, lng, accuracy, timestamp });
      }

      const now = Date.now();
      if (currentTripId && now - lastBreadcrumbTime >= 30000) {
        lastBreadcrumbTime = now;
        const breadcrumb = createBreadcrumb(lat, lng);
        try {
          await addBreadcrumb(currentTripId, breadcrumb);
        } catch (err) {
          console.error('Failed to add background breadcrumb to SQLite:', err);
        }
      }
    }
  }
});

/**
 * Helper to start or restart the location subscription.
 */
async function startLocationWatch(): Promise<void> {
  if (currentSubscription) {
    await currentSubscription.remove();
    currentSubscription = null;
  }

  if (!isTrackingActive) return;

  const options: Location.LocationOptions = {
    accuracy:
      currentMode === 'high_accuracy'
        ? Location.Accuracy.High
        : Location.Accuracy.Low,
    timeInterval: currentMode === 'high_accuracy' ? 3000 : 30000,
    distanceInterval:
      currentMode === 'high_accuracy'
        ? 10
        : CONFIG.GPS.SIGNIFICANT_CHANGE_METERS,
  };

  currentSubscription = await Location.watchPositionAsync(
    options,
    async (location) => {
      if (!currentCallback) return;

      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      const accuracy = location.coords.accuracy || 0;
      const timestamp = location.timestamp;

      currentCallback({ lat, lng, accuracy, timestamp });

      const now = Date.now();
      if (currentTripId && now - lastBreadcrumbTime >= 30000) {
        lastBreadcrumbTime = now;
        const breadcrumb = createBreadcrumb(lat, lng);
        try {
          await addBreadcrumb(currentTripId, breadcrumb);
        } catch (err) {
          console.error('Failed to add breadcrumb to SQLite:', err);
        }
      }
    }
  );

  const backgroundOptions: Location.LocationTaskOptions = {
    accuracy:
      currentMode === 'high_accuracy'
        ? Location.Accuracy.High
        : Location.Accuracy.Low,
    timeInterval: currentMode === 'high_accuracy' ? 3000 : 30000,
    distanceInterval:
      currentMode === 'high_accuracy'
        ? 10
        : CONFIG.GPS.SIGNIFICANT_CHANGE_METERS,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Travel Companion Tracking',
      notificationBody: 'Tracking your location to narrate surrounding landmarks.',
      notificationColor: '#3b82f6',
    },
  };

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, backgroundOptions);
  } catch (err) {
    console.error('Failed to start background location updates:', err);
  }
}

/**
 * Starts GPS tracking with adaptive power management.
 */
export async function startTracking(
  onLocationUpdate: LocationUpdateCallback,
  initialMode: GpsAccuracyMode = 'power_saving',
  tripId?: string
): Promise<() => void> {
  const hasPerm = await requestLocationPermissions();
  if (!hasPerm) {
    throw new Error('Location permissions denied');
  }

  currentCallback = onLocationUpdate;
  currentMode = initialMode;
  currentTripId = tripId || null;
  isTrackingActive = true;
  lastBreadcrumbTime = 0;

  await startLocationWatch();

  return () => {
    isTrackingActive = false;
    currentTripId = null;
    currentCallback = null;
    if (currentSubscription) {
      currentSubscription.remove();
      currentSubscription = null;
    }
    Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch((err) => {
      console.error('Failed to stop background location updates:', err);
    });
  };
}

/**
 * Switches the GPS tracking accuracy mode.
 */
export async function switchAccuracyMode(
  mode: GpsAccuracyMode
): Promise<void> {
  if (currentMode === mode) return;
  currentMode = mode;
  if (isTrackingActive) {
    await startLocationWatch();
  }
}

/**
 * Determines whether the GPS mode should switch based on distance to the next POI.
 */
export function determineAccuracyMode(
  currentLat: number,
  currentLng: number,
  nextPOI: POI,
  currentMode: GpsAccuracyMode
): GpsAccuracyMode {
  const distance = haversineDistance(
    currentLat,
    currentLng,
    nextPOI.coordinates.lat,
    nextPOI.coordinates.lng
  );

  const threshold = CONFIG.GPS.HIGH_ACCURACY_THRESHOLD_METERS;
  const buffer = 500; // Hysteresis buffer

  if (currentMode === 'high_accuracy') {
    if (distance > threshold + buffer) {
      return 'power_saving';
    }
    return 'high_accuracy';
  } else {
    if (distance <= threshold) {
      return 'high_accuracy';
    }
    return 'power_saving';
  }
}

/**
 * Records a GPS breadcrumb for post-trip route visualization.
 */
export function createBreadcrumb(lat: number, lng: number): GpsBreadcrumb {
  return {
    timestamp: new Date().toISOString(),
    lat,
    lng,
  };
}

/**
 * Requests location permissions from the user.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return false;
  }
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  return backgroundStatus === 'granted';
}
