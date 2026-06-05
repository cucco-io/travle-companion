/**
 * src/hooks/useTripPreparation.ts
 *
 * React hook for the pre-travel preparation flow.
 * Orchestrates the entire trip preparation pipeline:
 * 1. Fetch POIs from Google Places API
 * 2. Curate & rank with Gemini
 * 3. Generate narrations with Gemini (rate-limited)
 * 4. Synthesize audio with Cloud TTS
 * 5. Cache everything locally
 *
 * Dependencies:
 * - src/services/api/placesService.ts
 * - src/services/api/directionsService.ts (for route mode)
 * - src/services/api/geminiService.ts
 * - src/services/api/ttsService.ts
 * - src/services/storage/tripStorage.ts
 * - src/types/trip.ts
 * - React (useState, useCallback, useRef)
 */

import { useState, useCallback, useRef } from 'react';
import { Trip, TripPreferences, TripMode } from '../types/trip';
import { POI } from '../types/poi';
import { fetchRoute, getRouteSearchPoints } from '../services/api/directionsService';
import { fetchNearbyPOIs, fetchPOIsAlongRoute, curatePOIs } from '../services/api/placesService';
import { generateAllNarrations } from '../services/api/geminiService';
import { generateAllAudio, downloadAllImages } from '../services/api/ttsService';
import { createTrip, savePOIs, updateTripStatus } from '../services/storage/tripStorage';
import { CONFIG } from '../constants/config';

/**
 * Preparation pipeline stages for progress tracking.
 */
export type PreparationStage =
  | 'idle'
  | 'fetching_route'        // Route mode only: getting Directions
  | 'fetching_pois'         // Searching Google Places for candidates
  | 'curating'              // Gemini selecting & ranking POIs
  | 'generating_narrations' // Gemini writing narrations (rate-limited)
  | 'synthesizing_audio'    // TTS converting text to .mp3
  | 'caching'               // Saving everything to local storage
  | 'ready'                 // All done — trip is ready to start
  | 'error';                // Something went wrong

/**
 * State returned by the useTripPreparation hook.
 */
export interface PreparationState {
  /** Current stage of the preparation pipeline */
  stage: PreparationStage;

  /** Overall progress (0.0–1.0) */
  progress: number;

  /** Human-readable status message for the UI */
  statusMessage: string;

  /** Number of POIs found / curated / narrated */
  poiCount: number;

  /** The trip being prepared (null until creation) */
  trip: Trip | null;

  /** Error details if stage === 'error' */
  error: string | null;

  /** Whether preparation can be cancelled */
  isCancellable: boolean;
}

/** Internal params stored for retry */
interface PrepareParams {
  name: string;
  mode: TripMode;
  origin?: { name: string; lat: number; lng: number };
  destination: { name: string; lat: number; lng: number };
  preferences: TripPreferences;
}

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
 */
export function useTripPreparation(): PreparationState & {
  startPreparation: (params: PrepareParams) => Promise<void>;
  cancelPreparation: () => void;
  retryPreparation: () => Promise<void>;
} {
  const [stage, setStage] = useState<PreparationStage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [poiCount, setPoiCount] = useState(0);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancellable, setIsCancellable] = useState(false);

  /** Stores last params so retryPreparation can replay the pipeline */
  const lastParamsRef = useRef<PrepareParams | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const runPipeline = useCallback(async (params: PrepareParams): Promise<void> => {
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const throwIfCancelled = (): void => {
      if (signal.aborted) throw new Error('Preparation cancelled by user');
    };

    setError(null);
    setIsCancellable(true);

    try {
      // -----------------------------------------------------------------------
      // Step 1 — Create trip record in SQLite
      // -----------------------------------------------------------------------
      const tripId = generateUUID();
      const now = new Date().toISOString();

      const newTrip: Trip = {
        id: tripId,
        name: params.name,
        mode: params.mode,
        status: 'preparing',
        preferences: params.preferences,
        origin: params.origin ?? null,
        destination: params.destination,
        pois: [],
        route_polyline: null,
        created_at: now,
        started_at: null,
        completed_at: null,
        total_size_mb: 0,
      };

      await createTrip(newTrip);
      setTrip(newTrip);
      throwIfCancelled();

      // -----------------------------------------------------------------------
      // Step 2 — Route mode: fetch directions & polyline
      // -----------------------------------------------------------------------
      let routePolyline: string | null = null;
      let searchPoints: Array<{ lat: number; lng: number }> = [];

      if (params.mode === 'route' && params.origin) {
        setStage('fetching_route');
        setProgress(0.05);
        setStatusMessage('Plotting route...');

        const originStr = `${params.origin.lat},${params.origin.lng}`;
        const destStr = `${params.destination.lat},${params.destination.lng}`;
        const routeResult = await fetchRoute(originStr, destStr);
        routePolyline = routeResult.encodedPolyline;
        newTrip.route_polyline = routePolyline;
        setTrip({ ...newTrip });
        searchPoints = getRouteSearchPoints(routePolyline);
        throwIfCancelled();
      }

      // -----------------------------------------------------------------------
      // Step 3 — Fetch POIs
      // -----------------------------------------------------------------------
      setStage('fetching_pois');
      setProgress(0.15);
      setStatusMessage('Finding points of interest...');

      const interests = params.preferences.interests;
      let rawPOIs: POI[] = [];

      if (params.mode === 'route' && searchPoints.length > 0) {
        rawPOIs = await fetchPOIsAlongRoute(searchPoints, interests);
      } else {
        rawPOIs = await fetchNearbyPOIs(
          params.destination.lat,
          params.destination.lng,
          CONFIG.API.PLACES_SEARCH_RADIUS_METERS,
          interests
        );
      }

      setPoiCount(rawPOIs.length);
      setStatusMessage(`Finding points of interest... ${rawPOIs.length} found`);
      throwIfCancelled();

      // -----------------------------------------------------------------------
      // Step 4 — Curate with Gemini
      // -----------------------------------------------------------------------
      setStage('curating');
      setProgress(0.3);
      setStatusMessage('Curating best POIs...');

      const budget = CONFIG.POI_BUDGET.MEDIUM;
      const curatedPOIs = await curatePOIs(rawPOIs, params.mode, budget);
      setPoiCount(curatedPOIs.length);
      setStatusMessage(`Curating best POIs... ${curatedPOIs.length} selected`);
      throwIfCancelled();

      // -----------------------------------------------------------------------
      // Step 5 — Generate narrations
      // -----------------------------------------------------------------------
      setStage('generating_narrations');
      setProgress(0.45);
      setStatusMessage(`Generating narrations... 0/${curatedPOIs.length}`);

      const narrationOnProgress = (completed: number, total: number): void => {
        setStatusMessage(`Generating narrations... ${completed}/${total}`);
        setProgress(0.45 + (completed / total) * 0.2);
      };

      const narratedPOIs = await generateAllNarrations(
        curatedPOIs,
        params.preferences,
        narrationOnProgress,
        signal
      );
      throwIfCancelled();

      // -----------------------------------------------------------------------
      // Step 6 — Synthesize audio
      // -----------------------------------------------------------------------
      setStage('synthesizing_audio');
      setProgress(0.65);
      setStatusMessage(`Creating audio... 0/${narratedPOIs.length}`);

      const audioOnProgress = (completed: number, total: number): void => {
        setStatusMessage(`Creating audio... ${completed}/${total}`);
        setProgress(0.65 + (completed / total) * 0.15);
      };

      const audioedPOIs = await generateAllAudio(
        narratedPOIs,
        tripId,
        params.preferences.language,
        audioOnProgress
      );
      throwIfCancelled();

      // -----------------------------------------------------------------------
      // Step 7 — Download images
      // -----------------------------------------------------------------------
      setStage('caching');
      setProgress(0.8);
      setStatusMessage(`Downloading images... 0/${audioedPOIs.length}`);

      const imageOnProgress = (completed: number, total: number): void => {
        setStatusMessage(`Downloading images... ${completed}/${total}`);
        setProgress(0.8 + (completed / total) * 0.1);
      };

      const finalPOIs = await downloadAllImages(audioedPOIs, tripId, imageOnProgress);
      throwIfCancelled();

      // -----------------------------------------------------------------------
      // Step 8 — Save POIs and update trip status to 'ready'
      // -----------------------------------------------------------------------
      setProgress(0.9);
      setStatusMessage('Saving trip data...');

      await savePOIs(tripId, finalPOIs);
      await updateTripStatus(tripId, 'ready');

      const updatedTrip: Trip = {
        ...newTrip,
        status: 'ready',
        pois: finalPOIs,
        route_polyline: routePolyline,
      };

      // Calculate estimated size
      const totalWords = finalPOIs.reduce((sum, p) => sum + p.narration_word_count, 0);
      const estimatedSizeMB = Math.round((totalWords / 150) * 0.5); // rough estimate
      updatedTrip.total_size_mb = estimatedSizeMB;

      setTrip(updatedTrip);
      setPoiCount(finalPOIs.length);
      setProgress(1.0);
      setStatusMessage(`Trip ready! (~${estimatedSizeMB} MB)`);
      setStage('ready');
      setIsCancellable(false);
    } catch (err) {
      const isCancellation =
        err instanceof Error && err.message.includes('cancelled');
      if (isCancellation) {
        setStage('idle');
        setProgress(0);
        setStatusMessage('');
        setIsCancellable(false);
      } else {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        setStage('error');
        setIsCancellable(false);
      }
    }
  }, []);

  const startPreparation = useCallback(
    async (params: PrepareParams): Promise<void> => {
      lastParamsRef.current = params;
      setStage('idle');
      setProgress(0);
      setPoiCount(0);
      setTrip(null);
      setError(null);
      await runPipeline(params);
    },
    [runPipeline]
  );

  const cancelPreparation = useCallback((): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const retryPreparation = useCallback(async (): Promise<void> => {
    if (!lastParamsRef.current) return;
    setStage('idle');
    setProgress(0);
    setPoiCount(0);
    setError(null);
    await runPipeline(lastParamsRef.current);
  }, [runPipeline]);

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
