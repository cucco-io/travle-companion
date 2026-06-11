import { Trip, TripPreferences, TripMode } from '../../types/trip';
import { POI } from '../../types/poi';
import { fetchRoute, getRouteSearchPoints } from './directionsService';
import { fetchNearbyPOIs, fetchPOIsAlongRoute, curatePOIs, geocodeAddress } from './placesService';
import { generateAllNarrations } from './geminiService';
import { generateAllAudio, downloadAllImages } from './ttsService';
import { createTrip, savePOIs, updateTripStatus, updateTripCoordinates } from '../storage/tripStorage';
import { loadSettings } from '../storage/settingsStorage';
import { CONFIG } from '../../constants/config';

export type PreparationStage =
  | 'idle'
  | 'fetching_route'
  | 'fetching_pois'
  | 'curating'
  | 'generating_narrations'
  | 'synthesizing_audio'
  | 'caching'
  | 'ready'
  | 'error';

export interface PreparationState {
  stage: PreparationStage;
  progress: number;
  statusMessage: string;
  poiCount: number;
  trip: Trip | null;
  error: string | null;
  isCancellable: boolean;
}

export interface PrepareParams {
  name: string;
  mode: TripMode;
  origin?: { name: string; lat: number; lng: number };
  destination: { name: string; lat: number; lng: number };
  preferences: TripPreferences;
}

type Listener = (tripId: string, state: PreparationState) => void;

class TripPreparationManager {
  private activePreparations = new Map<string, {
    state: PreparationState;
    abortController: AbortController;
    params: PrepareParams;
  }>();

  private listeners = new Set<Listener>();

  public get(tripId: string): PreparationState | null {
    const active = this.activePreparations.get(tripId);
    return active ? active.state : null;
  }

  public getParams(tripId: string): PrepareParams | null {
    const active = this.activePreparations.get(tripId);
    return active ? active.params : null;
  }

  public getAllActive(): Record<string, PreparationState> {
    const result: Record<string, PreparationState> = {};
    for (const [id, value] of this.activePreparations.entries()) {
      result[id] = value.state;
    }
    return result;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(tripId: string, state: PreparationState) {
    for (const listener of this.listeners) {
      try {
        listener(tripId, state);
      } catch (err) {
        console.error('Error in listener callback:', err);
      }
    }
  }

  public stop(tripId: string) {
    const active = this.activePreparations.get(tripId);
    if (active) {
      active.abortController.abort();
      this.activePreparations.delete(tripId);
      this.notify(tripId, {
        stage: 'idle',
        progress: 0,
        statusMessage: 'Cancelled',
        poiCount: 0,
        trip: active.state.trip,
        error: null,
        isCancellable: false,
      });
    }
  }

  public async start(tripId: string, params: PrepareParams): Promise<void> {
    if (this.activePreparations.has(tripId)) {
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;

    const state: PreparationState = {
      stage: 'idle',
      progress: 0,
      statusMessage: 'Preparing...',
      poiCount: 0,
      trip: null,
      error: null,
      isCancellable: true,
    };

    this.activePreparations.set(tripId, {
      state,
      abortController,
      params,
    });

    const updateState = (updates: Partial<PreparationState>) => {
      Object.assign(state, updates);
      this.notify(tripId, state);
    };

    const throwIfCancelled = (): void => {
      if (signal.aborted) throw new Error('Preparation cancelled by user');
    };

    try {
      // Step 1: Create trip record (if not already existing in SQLite)
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

      try {
        await createTrip(newTrip);
      } catch (e) {
        // Trip might already exist (retry/resume case), ignore unique constraint error
      }
      updateState({ trip: newTrip });
      throwIfCancelled();

      // Step 1.5: Resolve coordinates
      let destinationLat = params.destination.lat;
      let destinationLng = params.destination.lng;
      let originLat = params.origin?.lat ?? 0;
      let originLng = params.origin?.lng ?? 0;

      if (params.mode === 'city' && destinationLat === 0 && destinationLng === 0) {
        updateState({ statusMessage: 'Resolving destination coordinates...' });
        const coords = await geocodeAddress(params.destination.name);
        destinationLat = coords.lat;
        destinationLng = coords.lng;
        newTrip.destination = {
          ...newTrip.destination,
          lat: destinationLat,
          lng: destinationLng,
        };
        updateState({ trip: { ...newTrip } });
        await updateTripCoordinates(tripId, null, newTrip.destination);
        throwIfCancelled();
      } else if (params.mode === 'route') {
        updateState({ statusMessage: 'Resolving route coordinates...' });
        let originUpdated = false;
        let destUpdated = false;

        if (originLat === 0 && originLng === 0 && params.origin) {
          const coords = await geocodeAddress(params.origin.name);
          originLat = coords.lat;
          originLng = coords.lng;
          newTrip.origin = {
            ...newTrip.origin!,
            lat: originLat,
            lng: originLng,
          };
          originUpdated = true;
        }
        if (destinationLat === 0 && destinationLng === 0) {
          const coords = await geocodeAddress(params.destination.name);
          destinationLat = coords.lat;
          destinationLng = coords.lng;
          newTrip.destination = {
            ...newTrip.destination,
            lat: destinationLat,
            lng: destinationLng,
          };
          destUpdated = true;
        }

        if (originUpdated || destUpdated) {
          updateState({ trip: { ...newTrip } });
          await updateTripCoordinates(tripId, newTrip.origin, newTrip.destination);
        }
        throwIfCancelled();
      }

      // Step 2: Route mode polyline
      let routePolyline: string | null = null;
      let searchPoints: Array<{ lat: number; lng: number }> = [];

      if (params.mode === 'route' && params.origin) {
        updateState({
          stage: 'fetching_route',
          progress: 0.05,
          statusMessage: 'Plotting route...',
        });

        const originStr = `${originLat},${originLng}`;
        const destStr = `${destinationLat},${destinationLng}`;
        const routeResult = await fetchRoute(originStr, destStr);
        routePolyline = routeResult.encodedPolyline;
        newTrip.route_polyline = routePolyline;
        updateState({ trip: { ...newTrip } });
        searchPoints = getRouteSearchPoints(routePolyline);
        throwIfCancelled();
      }

      // Step 3: Fetch POIs
      updateState({
        stage: 'fetching_pois',
        progress: 0.15,
        statusMessage: 'Finding points of interest...',
      });

      const interests = params.preferences.interests;
      let rawPOIs: POI[] = [];

      if (params.mode === 'route' && searchPoints.length > 0) {
        rawPOIs = await fetchPOIsAlongRoute(searchPoints, interests);
      } else {
        rawPOIs = await fetchNearbyPOIs(
          destinationLat,
          destinationLng,
          CONFIG.API.PLACES_SEARCH_RADIUS_METERS,
          interests
        );
      }

      updateState({
        poiCount: rawPOIs.length,
        statusMessage: `Finding points of interest... ${rawPOIs.length} found`,
      });
      throwIfCancelled();

      // Step 4: Curate with Gemini
      updateState({
        stage: 'curating',
        progress: 0.3,
        statusMessage: 'Curating best POIs...',
      });

      const budget = CONFIG.POI_BUDGET.MEDIUM;
      const curatedPOIs = await curatePOIs(rawPOIs, params.mode, budget, params.destination.name);
      
      // Assign default values to satisfy NOT NULL SQLite constraints
      const initialPOIs = curatedPOIs.map(poi => ({
        ...poi,
        narration_text: poi.narration_text || '',
        narration_word_count: poi.narration_word_count || 0,
        estimated_listen_minutes: poi.estimated_listen_minutes || 0.0,
      }));

      await savePOIs(tripId, initialPOIs);

      newTrip.pois = initialPOIs;
      updateState({
        poiCount: initialPOIs.length,
        statusMessage: `Curating best POIs... ${initialPOIs.length} selected`,
        trip: { ...newTrip },
      });
      throwIfCancelled();

      // Step 5: Generate narrations
      updateState({
        stage: 'generating_narrations',
        progress: 0.45,
        statusMessage: `Generating narrations... 0/${initialPOIs.length}`,
        trip: { ...newTrip },
      });

      const narrationOnProgress = (completed: number, total: number) => {
        newTrip.pois = [...initialPOIs];
        updateState({
          statusMessage: `Generating narrations... ${completed}/${total}`,
          progress: 0.45 + (completed / total) * 0.2,
          trip: { ...newTrip },
        });
      };

      const narratedPOIs = await generateAllNarrations(
        initialPOIs,
        params.preferences,
        (completed, total) => {
          narrationOnProgress(completed, total);
        },
        signal
      );

      // Save narrated POIs incrementally
      await savePOIs(tripId, narratedPOIs);
      newTrip.pois = narratedPOIs;
      updateState({ trip: { ...newTrip } });
      throwIfCancelled();

      // Step 6: Synthesize audio
      const settings = await loadSettings();
      let audioedPOIs = narratedPOIs;

      if (settings.ttsProvider === 'gemini') {
        updateState({
          stage: 'synthesizing_audio',
          progress: 0.65,
          statusMessage: `Creating audio... 0/${narratedPOIs.length}`,
          trip: { ...newTrip },
        });

        const audioOnProgress = (completed: number, total: number) => {
          newTrip.pois = [...narratedPOIs];
          updateState({
            statusMessage: `Creating audio... ${completed}/${total}`,
            progress: 0.65 + (completed / total) * 0.15,
            trip: { ...newTrip },
          });
        };

        audioedPOIs = await generateAllAudio(
          narratedPOIs,
          tripId,
          params.preferences.language,
          (completed, total) => {
            audioOnProgress(completed, total);
          }
        );
      } else {
        updateState({
          stage: 'synthesizing_audio',
          progress: 0.8,
          statusMessage: 'Skipping audio synthesis (On-device TTS active)',
          trip: { ...newTrip },
        });
      }

      // Save audioed POIs incrementally
      await savePOIs(tripId, audioedPOIs);
      newTrip.pois = audioedPOIs;
      updateState({ trip: { ...newTrip } });
      throwIfCancelled();

      // Step 7: Download images
      updateState({
        stage: 'caching',
        progress: 0.8,
        statusMessage: `Downloading images... 0/${audioedPOIs.length}`,
        trip: { ...newTrip },
      });

      const imageOnProgress = (completed: number, total: number) => {
        newTrip.pois = [...audioedPOIs];
        updateState({
          statusMessage: `Downloading images... ${completed}/${total}`,
          progress: 0.8 + (completed / total) * 0.1,
          trip: { ...newTrip },
        });
      };

      const finalPOIs = await downloadAllImages(audioedPOIs, tripId, (completed, total) => {
        imageOnProgress(completed, total);
      });

      // Save final POIs and update status
      updateState({
        progress: 0.9,
        statusMessage: 'Saving trip data...',
        trip: { ...newTrip, pois: finalPOIs },
      });

      await savePOIs(tripId, finalPOIs);
      await updateTripStatus(tripId, 'ready');

      const updatedTrip: Trip = {
        ...newTrip,
        status: 'ready',
        pois: finalPOIs,
        route_polyline: routePolyline,
      };

      const totalWords = finalPOIs.reduce((sum, p) => sum + p.narration_word_count, 0);
      const estimatedSizeMB = Math.round((totalWords / 150) * 0.5);
      updatedTrip.total_size_mb = estimatedSizeMB;

      updateState({
        trip: updatedTrip,
        poiCount: finalPOIs.length,
        progress: 1.0,
        statusMessage: `Trip ready! (~${estimatedSizeMB} MB)`,
        stage: 'ready',
        isCancellable: false,
      });

      this.activePreparations.delete(tripId);
    } catch (err) {
      const isCancellation = err instanceof Error && err.message.includes('cancelled');
      if (isCancellation) {
        updateState({
          stage: 'idle',
          progress: 0,
          statusMessage: 'Cancelled',
          isCancellable: false,
        });
        this.activePreparations.delete(tripId);
      } else {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        updateState({
          stage: 'error',
          error: message,
          isCancellable: false,
        });
        this.activePreparations.delete(tripId);
      }
    }
  }
}

export const manager = new TripPreparationManager();
