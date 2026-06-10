/**
 * src/hooks/useTripPreparation.ts
 *
 * React hook for the pre-travel preparation flow.
 * Refactored to delegate execution to the global TripPreparationManager
 * singleton, allowing active preparations to run in the background.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Trip, TripPreferences, TripMode } from '../types/trip';
import { getTripById } from '../services/storage/tripStorage';
import { manager, PreparationStage, PreparationState, PrepareParams } from '../services/api/preparationManager';

export { PreparationStage, PreparationState };

/** Generates a UUID v4 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Hook for managing the trip preparation pipeline.
 * Accepts an optional tripId to connect to an existing preparation or load status.
 */
export function useTripPreparation(initialTripId?: string): PreparationState & {
  startPreparation: (params: PrepareParams) => Promise<void>;
  cancelPreparation: () => void;
  retryPreparation: () => Promise<void>;
} {
  const [tripId, setTripId] = useState<string | undefined>(initialTripId);
  const [stage, setStage] = useState<PreparationStage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [poiCount, setPoiCount] = useState(0);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancellable, setIsCancellable] = useState(false);

  // Sync state with preparation manager
  const syncWithState = useCallback((state: PreparationState) => {
    setStage(state.stage);
    setProgress(state.progress);
    setStatusMessage(state.statusMessage);
    setPoiCount(state.poiCount);
    setTrip(state.trip);
    setError(state.error);
    setIsCancellable(state.isCancellable);
  }, []);

  // Fetch from database if inactive
  const loadTripFromDb = useCallback(async (id: string) => {
    try {
      const t = await getTripById(id);
      if (t && t.status === 'preparing') {
        setTrip(t);
        setPoiCount(t.pois.length);
        setStage('idle');
        setProgress(0);
        setStatusMessage('Interrupted');
        setIsCancellable(false);
      } else if (t) {
        setTrip(t);
        setPoiCount(t.pois.length);
        setStage(t.status === 'ready' ? 'ready' : 'idle');
        setProgress(t.status === 'ready' ? 1.0 : 0);
        setStatusMessage(t.status === 'ready' ? 'Trip ready!' : '');
        setIsCancellable(false);
      }
    } catch (e) {
      console.warn('Failed to load trip from DB:', e);
    }
  }, []);

  useEffect(() => {
    if (initialTripId) {
      setTripId(initialTripId);
    }
  }, [initialTripId]);

  useEffect(() => {
    if (!tripId) return;

    // Check if actively running in manager
    const active = manager.get(tripId);
    if (active) {
      syncWithState(active);
    } else {
      loadTripFromDb(tripId);
    }

    // Subscribe to updates
    const unsubscribe = manager.subscribe((id, state) => {
      if (id === tripId) {
        syncWithState(state);
      }
    });

    return unsubscribe;
  }, [tripId, syncWithState, loadTripFromDb]);

  const startPreparation = useCallback(
    async (params: PrepareParams): Promise<void> => {
      const id = tripId || generateUUID();
      setTripId(id);
      setError(null);
      
      // Seed local hook state
      setStage('idle');
      setProgress(0);
      setPoiCount(0);
      setTrip(null);
      setIsCancellable(true);

      await manager.start(id, params);
    },
    [tripId]
  );

  const cancelPreparation = useCallback((): void => {
    if (tripId) {
      manager.stop(tripId);
    }
  }, [tripId]);

  const retryPreparation = useCallback(async (): Promise<void> => {
    const activeId = tripId || (trip ? trip.id : undefined);
    if (!activeId) return;

    let paramsToUse = manager.getParams(activeId);
    if (!paramsToUse && trip) {
      paramsToUse = {
        name: trip.name,
        mode: trip.mode,
        origin: trip.origin || undefined,
        destination: trip.destination,
        preferences: trip.preferences,
      };
    } else if (!paramsToUse) {
      // Re-fetch from DB
      const currentTrip = await getTripById(activeId);
      if (currentTrip) {
        paramsToUse = {
          name: currentTrip.name,
          mode: currentTrip.mode,
          origin: currentTrip.origin || undefined,
          destination: currentTrip.destination,
          preferences: currentTrip.preferences,
        };
      }
    }

    if (paramsToUse) {
      setError(null);
      await manager.start(activeId, paramsToUse);
    }
  }, [tripId, trip]);

  return {
    stage,
    progress,
    statusMessage,
    poiCount,
    trip,
    error,
    isCancellable,
    startPreparation,
    cancelPreparation,
    retryPreparation,
  };
}
