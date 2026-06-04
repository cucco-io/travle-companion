import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import {
  playAudioFile,
  playTTSFallback,
  getCurrentPlaybackState,
  pauseAudio,
  resumeAudio,
  stopAudio,
  seekAudio,
  configureAudioSession,
  preloadAudio,
  releaseAudioResources,
} from '../audioPlayer';
import { POI } from '../../../types/poi';

// Mock expo-av
const mockSound = {
  unloadAsync: jest.fn().mockResolvedValue(undefined),
  playAsync: jest.fn().mockResolvedValue(undefined),
  pauseAsync: jest.fn().mockResolvedValue(undefined),
  stopAsync: jest.fn().mockResolvedValue(undefined),
  setPositionAsync: jest.fn().mockResolvedValue(undefined),
  setOnPlaybackStatusUpdate: jest.fn(),
};

jest.mock('expo-av', () => {
  return {
    Audio: {
      Sound: {
        createAsync: jest.fn(),
      },
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    },
    InterruptionModeIOS: {
      MixWithOthers: 0,
      DoNotMix: 1,
      DuckOthers: 2,
    },
    InterruptionModeAndroid: {
      DoNotMix: 1,
      DuckOthers: 2,
    },
  };
});

// Mock expo-speech
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-file-system
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

const mockPoi: POI = {
  id: 'poi-1',
  name: 'Eiffel Tower',
  category: 'monument',
  coordinates: { lat: 48.8584, lng: 2.2945 },
  rating: 4.8,
  narration_text: 'The Eiffel Tower is a wrought-iron lattice tower.',
  narration_word_count: 10,
  estimated_listen_minutes: 0.1,
  audio_file_path: '/path/to/eiffel.mp3',
  trigger_radius_meters: 50,
  priority: 5,
  image_url: null,
  image_local_path: null,
  bookmarked: false,
  played_at: null,
};

describe('audioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: mockSound,
      status: { isLoaded: true },
    });
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  });

  describe('configureAudioSession', () => {
    it('calls setAudioModeAsync with correct configuration', async () => {
      await configureAudioSession();
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        })
      );
    });
  });

  describe('preloadAudio', () => {
    it('returns true and preloads if file exists', async () => {
      const result = await preloadAudio('/path/to/file.mp3');
      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('/path/to/file.mp3');
      expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
        { uri: '/path/to/file.mp3' },
        { shouldPlay: false }
      );
      expect(result).toBe(true);
    });

    it('returns false if file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      const result = await preloadAudio('/path/to/missing.mp3');
      expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('playAudioFile', () => {
    it('plays local file when it exists', async () => {
      const statusCallback = jest.fn();
      const progressCallback = jest.fn();
      
      await playAudioFile('/path/to/eiffel.mp3', statusCallback, progressCallback);

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('/path/to/eiffel.mp3');
      expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
        { uri: '/path/to/eiffel.mp3' },
        { shouldPlay: true },
        expect.any(Function)
      );
      expect(getCurrentPlaybackState()).toBe('loading');
    });

    it('throws error when file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      
      await expect(playAudioFile('/path/to/missing.mp3')).rejects.toThrow();
      expect(getCurrentPlaybackState()).toBe('stopped');
    });
  });

  describe('playTTSFallback', () => {
    it('synthesizes speech and passes the language parameter', async () => {
      const statusCallback = jest.fn();
      const progressCallback = jest.fn();
      
      await playTTSFallback('Hello World', 'it', statusCallback, progressCallback);

      expect(Speech.speak).toHaveBeenCalledWith(
        'Hello World',
        expect.objectContaining({
          language: 'it',
          rate: 1.0,
          pitch: 1.0,
        })
      );
      expect(getCurrentPlaybackState()).toBe('loading');
    });
  });

  describe('playback controls', () => {
    it('pauses, resumes, stops, and seeks audio', async () => {
      // Play a file to initialize currentSound
      await playAudioFile('/path/to/eiffel.mp3');
      
      await pauseAudio();
      expect(mockSound.pauseAsync).toHaveBeenCalled();

      await resumeAudio();
      expect(mockSound.playAsync).toHaveBeenCalled();

      await seekAudio(1000);
      expect(mockSound.setPositionAsync).toHaveBeenCalledWith(1000);

      await stopAudio();
      expect(mockSound.stopAsync).toHaveBeenCalled();
      expect(getCurrentPlaybackState()).toBe('stopped');
    });
  });
});
