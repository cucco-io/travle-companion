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

import { useState, useEffect, useCallback, useRef } from 'react';
import { GpsBreadcrumb } from '../types/trip';
import {
  GpsAccuracyMode,
  startTracking as startGpsTracker,
  switchAccuracyMode,
  requestLocationPermissions,
} from '../services/location/gpsTracker';

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
 */
export function useGpsTracking(): GpsTrackingState & {
  startTracking: (tripId?: string) => Promise<void>;
  stopTracking: () => void;
  switchMode: (mode: GpsAccuracyMode) => Promise<void>;
  clearBreadcrumbs: () => void;
} {
  const [isTracking, setIsTracking] = useState(false);
  const [accuracyMode, setAccuracyMode] = useState<GpsAccuracyMode>('power_saving');
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const breadcrumbsRef = useRef<GpsBreadcrumb[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Clean up tracking on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const startTracking = useCallback(async (tripId?: string) => {
    try {
      setError(null);
      const permitted = await requestLocationPermissions();
      setHasPermission(permitted);
      if (!permitted) {
        throw new Error('Location permissions denied');
      }

      if (cleanupRef.current) {
        cleanupRef.current();
      }

      const cleanup = await startGpsTracker(
        (location) => {
          setCurrentLocation({
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
          });

          breadcrumbsRef.current.push({
            timestamp: new Date(location.timestamp).toISOString(),
            lat: location.lat,
            lng: location.lng,
          });
        },
        accuracyMode,
        tripId
      );

      cleanupRef.current = cleanup;
      setIsTracking(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start GPS tracking');
      setIsTracking(false);
      throw err;
    }
  }, [accuracyMode]);

  const stopTracking = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setIsTracking(false);
    setCurrentLocation(null);
  }, []);

  const switchMode = useCallback(async (mode: GpsAccuracyMode) => {
    try {
      setAccuracyMode(mode);
      await switchAccuracyMode(mode);
    } catch (err: any) {
      setError(err.message || 'Failed to switch accuracy mode');
    }
  }, []);

  const clearBreadcrumbs = useCallback(() => {
    breadcrumbsRef.current = [];
  }, []);

  return {
    isTracking,
    accuracyMode,
    currentLocation,
    hasPermission,
    error,
    get breadcrumbs() {
      return [...breadcrumbsRef.current];
    },
    startTracking,
    stopTracking,
    switchMode,
    clearBreadcrumbs,
  };
}
