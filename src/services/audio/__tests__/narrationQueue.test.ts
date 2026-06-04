import {
  createNarrationQueue,
  isCooldownElapsed,
  createLogEntry,
} from '../narrationQueue';
import { playNarration } from '../audioPlayer';
import * as Speech from 'expo-speech';
import { POI } from '../../../types/poi';

// Mock audioPlayer
jest.mock('../audioPlayer', () => ({
  playNarration: jest.fn(),
}));

// Mock expo-speech
jest.mock('expo-speech', () => ({
  speak: jest.fn().mockImplementation((text, options) => {
    if (options && options.onStart) {
      options.onStart();
    }
    if (options && options.onDone) {
      // Execute onDone synchronously to simplify state assertions in tests
      options.onDone();
    }
  }),
  stop: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
}));

const mockPoi1: POI = {
  id: 'poi-1',
  name: 'Colosseum',
  category: 'historical_landmark',
  coordinates: { lat: 41.8902, lng: 12.4922 },
  rating: 4.7,
  narration_text: 'The Colosseum is an oval amphitheatre.',
  narration_word_count: 6,
  estimated_listen_minutes: 0.04,
  audio_file_path: '/path/colosseum.mp3',
  trigger_radius_meters: 50,
  priority: 4,
  image_url: null,
  image_local_path: null,
  bookmarked: false,
  played_at: null,
};

const mockPoi2: POI = {
  id: 'poi-2',
  name: 'Pantheon',
  category: 'historical_landmark',
  coordinates: { lat: 41.8986, lng: 12.4769 },
  rating: 4.8,
  narration_text: 'The Pantheon is a former Roman temple.',
  narration_word_count: 7,
  estimated_listen_minutes: 0.05,
  audio_file_path: null,
  trigger_radius_meters: 50,
  priority: 5,
  image_url: null,
  image_local_path: null,
  bookmarked: false,
  played_at: null,
};

describe('narrationQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (playNarration as jest.Mock).mockResolvedValue({
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      seek: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isCooldownElapsed', () => {
    it('returns true if time difference is greater than or equal to cooldown', () => {
      const now = Date.now();
      expect(isCooldownElapsed(now - 120000, 120000)).toBe(true);
      expect(isCooldownElapsed(now - 150000, 120000)).toBe(true);
    });

    it('returns false if time difference is less than cooldown', () => {
      const now = Date.now();
      expect(isCooldownElapsed(now - 60000, 120000)).toBe(false);
    });
  });

  describe('createLogEntry', () => {
    it('creates a correct TripLogEntry object', () => {
      const entry = createLogEntry(mockPoi1, 41.8902, 12.4922, false);
      expect(entry).toEqual(
        expect.objectContaining({
          poi_id: 'poi-1',
          skipped: false,
          location: { lat: 41.8902, lng: 12.4922 },
        })
      );
      expect(entry.played_at).toBeDefined();
    });
  });

  describe('createNarrationQueue lifecycle', () => {
    it('enqueues a POI and starts playback immediately if cooldown has elapsed', async () => {
      const stateChangeCallback = jest.fn();
      const queue = createNarrationQueue(stateChangeCallback);

      queue.enqueue(mockPoi1);

      // Verify speech for chime is called
      expect(Speech.speak).toHaveBeenCalledWith(
        'Coming up next: Colosseum',
        expect.any(Object)
      );

      // Since speak is mocked to call onDone immediately, playNarration should have been called next
      expect(playNarration).toHaveBeenCalledWith(mockPoi1, expect.any(Function));

      // Verify the state has updated
      const state = queue.getState();
      expect(state.currentPOI?.id).toBe('poi-1');
      expect(state.queue).toHaveLength(0);
    });

    it('respects cooldown and waits before playing next item', () => {
      const stateChangeCallback = jest.fn();
      const queue = createNarrationQueue(stateChangeCallback);

      // Play the first POI
      queue.enqueue(mockPoi1);

      // Simulate completion of first narration
      const statusCallback = (playNarration as jest.Mock).mock.calls[0][1];
      statusCallback('finished');

      // Now enqueue the second POI
      queue.enqueue(mockPoi2);

      // Speech.speak should not be called immediately because of 2-minute cooldown
      expect(Speech.speak).toHaveBeenCalledTimes(1); // Only for mockPoi1

      // Fast forward time by 2 minutes
      jest.advanceTimersByTime(120000);

      // Now it should play the second POI
      expect(Speech.speak).toHaveBeenCalledTimes(2);
      expect(Speech.speak).toHaveBeenLastCalledWith(
        'Coming up next: Pantheon',
        expect.any(Object)
      );
    });

    it('bypasses cooldown when skip is called', () => {
      const stateChangeCallback = jest.fn();
      const queue = createNarrationQueue(stateChangeCallback);

      // Start first POI narration
      queue.enqueue(mockPoi1);

      // Enqueue the second POI
      queue.enqueue(mockPoi2);

      // Call skip
      queue.skip();

      // Verify the first was skipped and the second plays immediately (bypassing cooldown)
      expect(Speech.speak).toHaveBeenCalledTimes(2);
      expect(Speech.speak).toHaveBeenLastCalledWith(
        'Coming up next: Pantheon',
        expect.any(Object)
      );

      const state = queue.getState();
      expect(state.log).toHaveLength(1);
      expect(state.log[0].skipped).toBe(true);
    });

    it('pauses and resumes narration queue', async () => {
      const stateChangeCallback = jest.fn();
      const queue = createNarrationQueue(stateChangeCallback);

      const mockControls = {
        pause: jest.fn().mockResolvedValue(undefined),
        resume: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        seek: jest.fn().mockResolvedValue(undefined),
      };
      (playNarration as jest.Mock).mockResolvedValue(mockControls);

      queue.enqueue(mockPoi1);

      // Flush microtasks as playNarration resolves asynchronously
      await Promise.resolve();
      await Promise.resolve();

      queue.pause();
      expect(mockControls.pause).toHaveBeenCalled();
      expect(queue.getState().isPaused).toBe(true);

      queue.resume();
      expect(mockControls.resume).toHaveBeenCalled();
      expect(queue.getState().isPaused).toBe(false);
    });
  });
});
