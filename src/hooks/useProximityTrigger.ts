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

import { useState, useEffect, useCallback, useRef } from 'react';
import { POI } from '../types/poi';
import { TripMode, TripLogEntry, GpsBreadcrumb } from '../types/trip';
import { useGpsTracking } from './useGpsTracking';
import { useNarrationPlayer } from './useNarrationPlayer';
import {
  initProximityEngine,
  findNextPOI,
} from '../services/location/proximityEngine';
import { determineAccuracyMode } from '../services/location/gpsTracker';

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
 */
export function useProximityTrigger(
  pois: POI[],
  tripMode: TripMode,
  tripId?: string
): ProximityTriggerState & {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  getBreadcrumbs: () => GpsBreadcrumb[];
  getLog: () => TripLogEntry[];
} {
  const [isActive, setIsActive] = useState(false);
  const [nextPOI, setNextPOI] = useState<POI | null>(null);
  const [distanceToNextPOI, setDistanceToNextPOI] = useState<number | null>(null);
  const [playedCount, setPlayedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const gps = useGpsTracking();
  const narration = useNarrationPlayer();

  const engineRef = useRef<ReturnType<typeof initProximityEngine> | null>(null);
  const playedIdsRef = useRef<Set<string>>(new Set());
  const skippedIdsRef = useRef<Set<string>>(new Set());
  const logRef = useRef<TripLogEntry[]>([]);
  const breadcrumbsRef = useRef<GpsBreadcrumb[]>([]);

  // Update logic on location changes
  useEffect(() => {
    if (!isActive || !gps.currentLocation || !engineRef.current) return;

    const { lat, lng } = gps.currentLocation;

    // Record breadcrumb locally
    const timestamp = new Date().toISOString();
    breadcrumbsRef.current.push({ timestamp, lat, lng });

    // Feed to proximity engine
    engineRef.current.updateLocation(lat, lng);

    // Update next POI and distance
    const engineState = engineRef.current.getState();
    const nextPoiData = findNextPOI(lat, lng, engineState);
    if (nextPoiData) {
      setNextPOI(nextPoiData.poi);
      setDistanceToNextPOI(nextPoiData.distanceMeters);

      // Check accuracy mode switch
      const currentMode = gps.accuracyMode;
      const targetMode = determineAccuracyMode(
        lat,
        lng,
        nextPoiData.poi,
        currentMode
      );
      if (targetMode !== currentMode) {
        gps.switchMode(targetMode);
      }
    } else {
      setNextPOI(null);
      setDistanceToNextPOI(null);
    }
  }, [gps.currentLocation, isActive, gps.accuracyMode, gps.switchMode]);

  // Sync played/skipped state from narration player's playback log
  useEffect(() => {
    if (!engineRef.current) return;

    let updated = false;
    for (const entry of narration.playbackLog) {
      if (entry.skipped) {
        if (!skippedIdsRef.current.has(entry.poi_id)) {
          skippedIdsRef.current.add(entry.poi_id);
          playedIdsRef.current.delete(entry.poi_id);
          engineRef.current.markSkipped(entry.poi_id);
          updated = true;

          // Sync local log
          const existing = logRef.current.find((e) => e.poi_id === entry.poi_id);
          if (existing) {
            existing.skipped = true;
          } else {
            logRef.current.push({ ...entry });
          }
        }
      } else {
        if (!playedIdsRef.current.has(entry.poi_id)) {
          playedIdsRef.current.add(entry.poi_id);
          skippedIdsRef.current.delete(entry.poi_id);
          engineRef.current.markPlayed(entry.poi_id);
          updated = true;

          // Sync local log
          const existing = logRef.current.find((e) => e.poi_id === entry.poi_id);
          if (existing) {
            existing.skipped = false;
          } else {
            logRef.current.push({ ...entry });
          }
        }
      }
    }

    if (updated) {
      setPlayedCount(playedIdsRef.current.size);
      setSkippedCount(skippedIdsRef.current.size);
    }
  }, [narration.playbackLog]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      gps.stopTracking();
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, []);

  const start = useCallback(async () => {
    setIsActive(true);
    playedIdsRef.current.clear();
    skippedIdsRef.current.clear();
    logRef.current = [];
    breadcrumbsRef.current = [];
    setPlayedCount(0);
    setSkippedCount(0);
    setNextPOI(null);
    setDistanceToNextPOI(null);

    engineRef.current = initProximityEngine(pois, tripMode, (event) => {
      // Enqueue POI in narration player
      narration.enqueue(event.poi);

      // Record locally as played
      playedIdsRef.current.add(event.poi.id);
      setPlayedCount(playedIdsRef.current.size);

      // Add to log
      logRef.current.push({
        poi_id: event.poi.id,
        played_at: event.timestamp,
        location: {
          lat: event.poi.coordinates.lat,
          lng: event.poi.coordinates.lng,
        },
        skipped: false,
      });
    });

    // Start GPS tracking
    await gps.startTracking(tripId);
  }, [pois, tripMode, tripId, gps.startTracking]);

  const stop = useCallback(() => {
    setIsActive(false);
    gps.stopTracking();
    if (engineRef.current) {
      engineRef.current.stop();
    }
  }, [gps.stopTracking]);

  const pause = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.resume();
    }
  }, []);

  const getBreadcrumbs = useCallback(() => {
    return breadcrumbsRef.current;
  }, []);

  const getLog = useCallback(() => {
    return logRef.current;
  }, []);

  const remainingPOICount = Math.max(
    0,
    pois.length - playedCount - skippedCount
  );

  return {
    isActive,
    nextPOI,
    distanceToNextPOI,
    remainingPOICount,
    playedCount,
    skippedCount,
    start,
    stop,
    pause,
    resume,
    getBreadcrumbs,
    getLog,
  };
}
