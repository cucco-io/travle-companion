import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import {
  playNarration,
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

  describe('playNarration', () => {
    it('plays local file when path is present and exists', async () => {
      const statusCallback = jest.fn();
      const controls = await playNarration(mockPoi, statusCallback);

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('/path/to/eiffel.mp3');
      expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
        { uri: '/path/to/eiffel.mp3' },
        { shouldPlay: true },
        expect.any(Function)
      );
      expect(Speech.speak).not.toHaveBeenCalled();
      expect(controls).toHaveProperty('pause');
      expect(controls).toHaveProperty('resume');
      expect(controls).toHaveProperty('stop');
      expect(controls).toHaveProperty('seek');
    });

    it('falls back to Speech when audio_file_path is missing', async () => {
      const statusCallback = jest.fn();
      const poiNoAudio = { ...mockPoi, audio_file_path: null };

      await playNarration(poiNoAudio, statusCallback);

      expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
      expect(Speech.speak).toHaveBeenCalledWith(
        poiNoAudio.narration_text,
        expect.any(Object)
      );
    });

    it('falls back to Speech when file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      const statusCallback = jest.fn();

      await playNarration(mockPoi, statusCallback);

      expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
      expect(Speech.speak).toHaveBeenCalledWith(
        mockPoi.narration_text,
        expect.any(Object)
      );
    });

    it('falls back to Speech when loading audio fails', async () => {
      (Audio.Sound.createAsync as jest.Mock).mockRejectedValue(new Error('Load error'));
      const statusCallback = jest.fn();

      await playNarration(mockPoi, statusCallback);

      expect(Speech.speak).toHaveBeenCalledWith(
        mockPoi.narration_text,
        expect.any(Object)
      );
    });
  });
});
