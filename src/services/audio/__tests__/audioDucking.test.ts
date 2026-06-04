import { Audio } from 'expo-av';
import {
  setDuckingMode,
  requestAudioFocus,
  releaseAudioFocus,
} from '../audioDucking';

jest.mock('expo-av', () => {
  return {
    Audio: {
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

describe('audioDucking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setDuckingMode', () => {
    it('sets correct options for duck mode', async () => {
      await setDuckingMode('duck');
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          interruptionModeIOS: 2, // DuckOthers
          interruptionModeAndroid: 2, // DuckOthers
          shouldDuckAndroid: true,
        })
      );
    });

    it('sets correct options for pause mode', async () => {
      await setDuckingMode('pause');
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          interruptionModeIOS: 1, // DoNotMix
          interruptionModeAndroid: 1, // DoNotMix
          shouldDuckAndroid: false,
        })
      );
    });

    it('sets correct options for mix mode', async () => {
      await setDuckingMode('mix');
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          interruptionModeIOS: 0, // MixWithOthers
          interruptionModeAndroid: 2, // DuckOthers
          shouldDuckAndroid: false,
        })
      );
    });
  });

  describe('requestAudioFocus', () => {
    it('calls setDuckingMode with duck', async () => {
      await requestAudioFocus();
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          interruptionModeIOS: 2,
          interruptionModeAndroid: 2,
          shouldDuckAndroid: true,
        })
      );
    });
  });

  describe('releaseAudioFocus', () => {
    it('calls setDuckingMode with mix', async () => {
      await releaseAudioFocus();
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          interruptionModeIOS: 0,
          interruptionModeAndroid: 2,
          shouldDuckAndroid: false,
        })
      );
    });
  });
});
