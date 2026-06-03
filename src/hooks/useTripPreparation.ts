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
 * - src/services/storage/fileStorage.ts
 * - src/utils/poiFilter.ts
 * - src/types/trip.ts
 * - React (useState, useCallback, useRef)
 */

import { Trip, TripPreferences, TripMode } from '../types/trip';
import { POI } from '../types/poi';

/**
 * Preparation pipeline stages for progress tracking.
 */
export type PreparationStage =
  | 'idle'
  | 'fetching_route'       // Route mode only: getting Directions
  | 'fetching_pois'        // Searching Google Places for candidates
  | 'curating'             // Gemini selecting & ranking POIs
  | 'generating_narrations'// Gemini writing narrations (rate-limited)
  | 'synthesizing_audio'   // TTS converting text to .mp3
  | 'caching'              // Saving everything to local storage
  | 'ready'                // All done — trip is ready to start
  | 'error';               // Something went wrong

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

/**
 * Hook for managing the trip preparation pipeline.
 *
 * @returns Object with preparation state and control functions
 *
 * Usage:
 * ```tsx
 * const {
 *   stage,
 *   progress,
 *   statusMessage,
 *   trip,
 *   startPreparation,
 *   cancelPreparation,
 * } = useTripPreparation();
 *
 * // Start preparing a new city trip
 * await startPreparation({
 *   name: 'Weekend in Rome',
 *   mode: 'city',
 *   destination: { name: 'Rome', lat: 41.89, lng: 12.49 },
 *   preferences: {
 *     interests: ['history', 'architecture'],
 *     narration_depth: 'standard',
 *     kid_friendly: false,
 *     language: 'en',
 *   },
 * });
 * ```
 *
 * Implementation notes:
 * - Use useState for stage, progress, statusMessage, etc.
 * - Use useRef for the AbortController (for cancellation)
 * - startPreparation runs the full pipeline sequentially:
 *   1. Create trip record in SQLite (status: 'preparing')
 *   2. [Route mode only] Fetch directions, decode polyline, sample points
 *   3. Fetch POIs from Places API (multiple searches for route mode)
 *   4. Filter by interests, calculate budget
 *   5. Curate with Gemini
 *   6. Generate narrations with Gemini (batch, rate-limited)
 *   7. Synthesize audio with TTS
 *   8. Save POIs and audio files
 *   9. Update trip status to 'ready'
 * - cancelPreparation aborts the pipeline via AbortSignal
 * - On error, update stage to 'error' and set error message
 * - Clean up partial data on cancellation (delete incomplete files)
 */
export function useTripPreparation(): PreparationState & {
  startPreparation: (params: {
    name: string;
    mode: TripMode;
    origin?: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
    preferences: TripPreferences;
  }) => Promise<void>;
  cancelPreparation: () => void;
  retryPreparation: () => Promise<void>;
} {
  // TODO: Implement trip preparation hook
  // 1. Initialize state
  // 2. Implement startPreparation with the full pipeline
  // 3. Implement cancelPreparation with AbortController
  // 4. Implement retryPreparation to resume from the failed stage
  // 5. Update progress/statusMessage at each stage
  throw new Error('Not implemented');
}
