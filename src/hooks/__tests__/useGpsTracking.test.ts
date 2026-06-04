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
  runHook();
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

jest.mock('../../services/location/gpsTracker', () => ({
  startTracking: jest.fn(),
  switchAccuracyMode: jest.fn(),
  requestLocationPermissions: jest.fn(),
}));

import { useGpsTracking } from '../useGpsTracking';
import {
  startTracking as startGpsTracker,
  switchAccuracyMode,
  requestLocationPermissions,
} from '../../services/location/gpsTracker';

let currentHookResult: any;
function runHook() {
  resetHookIndices();
  effectsQueue.length = 0;
  currentHookResult = useGpsTracking();

  // Run queued effects after render
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

describe('useGpsTracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStateValues.length = 0;
    mockEffects.length = 0;
    mockRefs.length = 0;
    effectsQueue.length = 0;
    resetHookIndices();
  });

  it('should initialize with default values', () => {
    runHook();
    expect(currentHookResult.isTracking).toBe(false);
    expect(currentHookResult.accuracyMode).toBe('power_saving');
    expect(currentHookResult.currentLocation).toBeNull();
    expect(currentHookResult.hasPermission).toBe(false);
    expect(currentHookResult.error).toBeNull();
    expect(currentHookResult.breadcrumbs).toEqual([]);
    unmountHook();
  });

  it('should handle startTracking success', async () => {
    const startMock = startGpsTracker as jest.Mock;
    const cleanupMock = jest.fn();
    startMock.mockResolvedValue(cleanupMock);
    (requestLocationPermissions as jest.Mock).mockResolvedValue(true);

    runHook();

    await currentHookResult.startTracking('trip123');

    runHook();
    expect(requestLocationPermissions).toHaveBeenCalled();
    expect(startGpsTracker).toHaveBeenCalledWith(
      expect.any(Function),
      'power_saving',
      'trip123'
    );
    expect(currentHookResult.isTracking).toBe(true);
    expect(currentHookResult.hasPermission).toBe(true);

    // Call update callback to simulate movement
    const onLocationUpdate = startMock.mock.calls[0][0];
    onLocationUpdate({ lat: 41.8902, lng: 12.4922, accuracy: 5, timestamp: 100000 });

    // Refresh hook output values
    runHook();

    expect(currentHookResult.currentLocation).toEqual({
      lat: 41.8902,
      lng: 12.4922,
      accuracy: 5,
    });
    expect(currentHookResult.breadcrumbs.length).toBe(1);
    expect(currentHookResult.breadcrumbs[0].lat).toBe(41.8902);

    // Stop tracking
    currentHookResult.stopTracking();
    expect(cleanupMock).toHaveBeenCalled();

    runHook();
    expect(currentHookResult.isTracking).toBe(false);
    expect(currentHookResult.currentLocation).toBeNull();

    unmountHook();
  });

  it('should handle permission denial', async () => {
    (requestLocationPermissions as jest.Mock).mockResolvedValue(false);

    runHook();

    await expect(currentHookResult.startTracking()).rejects.toThrow('Location permissions denied');
    expect(currentHookResult.isTracking).toBe(false);
    expect(currentHookResult.hasPermission).toBe(false);

    unmountHook();
  });

  it('should switch mode', async () => {
    runHook();

    await currentHookResult.switchMode('high_accuracy');
    expect(switchAccuracyMode).toHaveBeenCalledWith('high_accuracy');

    runHook();
    expect(currentHookResult.accuracyMode).toBe('high_accuracy');

    unmountHook();
  });
});
