const mockStateValues: any[] = [];
let mockStateIndex = 0;
const mockEffects: Array<{ cb: any; deps: any; dest?: any }> = [];
let mockEffectIndex = 0;
const mockRefs: any[] = [];
let mockRefIndex = 0;

const effectsQueue: Array<{ cb: any; deps: any; currentIndex: number }> = [];

function resetHookIndices() {
  mockStateIndex = 0;
  mockEffectIndex = 0;
  mockRefIndex = 0;
}

const mockSetState = (currentIndex: number) => (newValue: any) => {
  if (typeof newValue === 'function') {
    mockStateValues[currentIndex] = newValue(mockStateValues[currentIndex]);
  } else {
    mockStateValues[currentIndex] = newValue;
  }
  scheduleHookRun();
};

jest.mock('react', () => {
  const original = jest.requireActual('react');
  return {
    ...original,
    useState: (initialValue: any) => {
      const currentIndex = mockStateIndex++;
      if (mockStateValues[currentIndex] === undefined) {
        mockStateValues[currentIndex] =
          typeof initialValue === 'function' ? initialValue() : initialValue;
      }
      return [mockStateValues[currentIndex], mockSetState(currentIndex)];
    },
    useRef: (initialValue: any) => {
      const currentIndex = mockRefIndex++;
      if (mockRefs[currentIndex] === undefined) {
        mockRefs[currentIndex] = { current: initialValue };
      }
      return mockRefs[currentIndex];
    },
    useCallback: (callback: any) => callback,
    useEffect: (effect: any, deps: any) => {
      const currentIndex = mockEffectIndex++;
      const prevEffect = mockEffects[currentIndex];
      let changed = true;
      if (prevEffect && prevEffect.deps && deps) {
        changed = !deps.every((dep: any, i: number) => dep === prevEffect.deps[i]);
      }
      if (changed) {
        effectsQueue.push({ cb: effect, deps, currentIndex });
      }
    },
  };
});

// Mock expo-location entirely to avoid syntax error in ES modules under Node environment
jest.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
    High: 4,
  },
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync: jest.fn(),
}));

jest.mock('../../services/location/gpsTracker', () => ({
  determineAccuracyMode: jest.fn().mockReturnValue('high_accuracy'),
  requestLocationPermissions: jest.fn().mockResolvedValue(true),
  startTracking: jest.fn(),
  switchAccuracyMode: jest.fn(),
  createBreadcrumb: jest.fn(),
}));

jest.mock('../../services/storage/tripStorage', () => ({
  addBreadcrumb: jest.fn(),
}));

jest.mock('../useGpsTracking');
jest.mock('../useNarrationPlayer');

import { useProximityTrigger } from '../useProximityTrigger';
import { useGpsTracking } from '../useGpsTracking';
import { useNarrationPlayer } from '../useNarrationPlayer';
import { POI } from '../../types/poi';

const mockPois: POI[] = [
  {
    id: 'poi1',
    name: 'POI 1',
    category: 'historical_landmark',
    coordinates: { lat: 41.8902, lng: 12.4922 }, // Rome
    rating: 4.5,
    narration_text: 'POI 1 Narration',
    narration_word_count: 100,
    estimated_listen_minutes: 1,
    audio_file_path: null,
    trigger_radius_meters: 50,
    priority: 5,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  },
];

let currentHookResult: any;
let isRunning = false;
let needsRun = false;

function scheduleHookRun() {
  if (isRunning) {
    needsRun = true;
    return;
  }
  isRunning = true;
  runHookInternal();
  while (needsRun) {
    needsRun = false;
    runHookInternal();
  }
  isRunning = false;
}

function runHook() {
  scheduleHookRun();
}

function runHookInternal() {
  resetHookIndices();
  effectsQueue.length = 0;
  currentHookResult = useProximityTrigger(mockPois, 'city');

  // Run queued effects after render finishes
  const queued = [...effectsQueue];
  effectsQueue.length = 0;
  queued.forEach((eff) => {
    const prevEffect = mockEffects[eff.currentIndex];
    if (prevEffect && typeof prevEffect.dest === 'function') {
      prevEffect.dest();
    }
    const dest = eff.cb();
    mockEffects[eff.currentIndex] = {
      cb: eff.cb,
      deps: eff.deps,
      dest,
    };
  });
}

function unmountHook() {
  mockEffects.forEach((eff) => {
    if (typeof eff.dest === 'function') {
      eff.dest();
    }
  });
  mockStateValues.length = 0;
  mockEffects.length = 0;
  mockRefs.length = 0;
  effectsQueue.length = 0;
  resetHookIndices();
}

describe('useProximityTrigger', () => {
  let mockGpsTracking: any;
  let mockNarrationPlayer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateValues.length = 0;
    mockEffects.length = 0;
    mockRefs.length = 0;
    effectsQueue.length = 0;
    resetHookIndices();

    mockGpsTracking = {
      isTracking: false,
      accuracyMode: 'power_saving',
      currentLocation: null,
      hasPermission: true,
      error: null,
      breadcrumbs: [],
      startTracking: jest.fn(),
      stopTracking: jest.fn(),
      switchMode: jest.fn(),
      clearBreadcrumbs: jest.fn(),
    };

    mockNarrationPlayer = {
      currentPOI: null,
      playbackStatus: 'idle',
      queueLength: 0,
      isPaused: false,
      playbackLog: [],
      enqueue: jest.fn(),
      skip: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      replay: jest.fn(),
      stop: jest.fn(),
    };

    (useGpsTracking as jest.Mock).mockReturnValue(mockGpsTracking);
    (useNarrationPlayer as jest.Mock).mockReturnValue(mockNarrationPlayer);
  });

  it('should initialize state correctly', () => {
    runHook();

    expect(currentHookResult.isActive).toBe(false);
    expect(currentHookResult.nextPOI).toBeNull();
    expect(currentHookResult.distanceToNextPOI).toBeNull();
    expect(currentHookResult.remainingPOICount).toBe(1);
    expect(currentHookResult.playedCount).toBe(0);
    expect(currentHookResult.skippedCount).toBe(0);

    unmountHook();
  });

  it('should handle start and stop tracking', async () => {
    runHook();

    await currentHookResult.start();

    // After start, isActive becomes true
    runHook();
    expect(currentHookResult.isActive).toBe(true);
    expect(mockGpsTracking.startTracking).toHaveBeenCalled();

    currentHookResult.stop();
    runHook();
    expect(currentHookResult.isActive).toBe(false);
    expect(mockGpsTracking.stopTracking).toHaveBeenCalled();

    unmountHook();
  });

  it('should process location updates and trigger POI proximity', async () => {
    runHook();

    await currentHookResult.start();

    // Simulate location update close to POI 1 (Colosseum Rome)
    mockGpsTracking.currentLocation = { lat: 41.8902, lng: 12.4922, accuracy: 5 };
    
    // Trigger hook updates
    runHook();

    expect(mockNarrationPlayer.enqueue).toHaveBeenCalledWith(mockPois[0]);
    expect(currentHookResult.playedCount).toBe(1);
    expect(currentHookResult.remainingPOICount).toBe(0);
    expect(currentHookResult.getLog().length).toBe(1);
    expect(currentHookResult.getLog()[0].poi_id).toBe('poi1');

    unmountHook();
  });
});
