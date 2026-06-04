import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { POI } from '../../types/poi';

/**
 * Playback state reported by the audio player.
 */
export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'error';

/**
 * Callback for playback status changes.
 */
export type PlaybackStatusCallback = (status: PlaybackStatus) => void;

// Module level state
let currentSound: Audio.Sound | null = null;
let currentSoundIsPreloaded = false;
let isSpeechActive = false;
const preloadedSounds = new Map<string, Audio.Sound>();

async function stopCurrentAudio(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      if (!currentSoundIsPreloaded) {
        await currentSound.unloadAsync();
      } else {
        // Reset preloaded sound position to 0
        await currentSound.setPositionAsync(0);
      }
    } catch (e) {
      // ignore
    }
    currentSound = null;
    currentSoundIsPreloaded = false;
  }
  if (isSpeechActive) {
    try {
      await Speech.stop();
    } catch (e) {
      // ignore
    }
    isSpeechActive = false;
  }
}

/**
 * Plays the narration audio for a POI.
 *
 * @param poi - The POI whose narration to play
 * @param onStatusChange - Callback for playback status updates
 * @returns Control object with pause, resume, stop, and seek functions
 */
export async function playNarration(
  poi: POI,
  onStatusChange?: PlaybackStatusCallback
): Promise<{
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
}> {
  await stopCurrentAudio();

  let useSpeech = true;

  const onPlaybackStatusUpdate = (status: any) => {
    if (!status.isLoaded) {
      if (status.error) {
        onStatusChange?.('error');
      }
      return;
    }

    if (status.didJustFinish) {
      onStatusChange?.('finished');
      if (currentSound && !currentSoundIsPreloaded) {
        currentSound.unloadAsync().catch(() => {});
        currentSound = null;
      }
    } else if (status.isPlaying) {
      onStatusChange?.('playing');
    } else {
      onStatusChange?.('paused');
    }
  };

  if (poi.audio_file_path) {
    try {
      onStatusChange?.('loading');
      const info = await FileSystem.getInfoAsync(poi.audio_file_path);
      if (info.exists) {
        let sound: Audio.Sound;
        if (preloadedSounds.has(poi.audio_file_path)) {
          sound = preloadedSounds.get(poi.audio_file_path)!;
          currentSoundIsPreloaded = true;
          sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
          await sound.setPositionAsync(0);
          await sound.playAsync();
        } else {
          currentSoundIsPreloaded = false;
          const result = await Audio.Sound.createAsync(
            { uri: poi.audio_file_path },
            { shouldPlay: true },
            onPlaybackStatusUpdate
          );
          sound = result.sound;
        }
        currentSound = sound;
        useSpeech = false;
      }
    } catch (error) {
      // If loading fails, we will fall back to speech
      onStatusChange?.('error');
    }
  }

  if (useSpeech) {
    try {
      onStatusChange?.('loading');
      isSpeechActive = true;
      Speech.speak(poi.narration_text, {
        rate: 1.0,
        pitch: 1.0,
        onStart: () => {
          onStatusChange?.('playing');
        },
        onDone: () => {
          isSpeechActive = false;
          onStatusChange?.('finished');
        },
        onStopped: () => {
          isSpeechActive = false;
          onStatusChange?.('paused');
        },
        onError: () => {
          isSpeechActive = false;
          onStatusChange?.('error');
        },
      });
    } catch (error) {
      isSpeechActive = false;
      onStatusChange?.('error');
    }
  }

  return {
    pause: async () => {
      if (currentSound) {
        await currentSound.pauseAsync();
      } else if (isSpeechActive) {
        try {
          await Speech.pause();
        } catch (e) {
          // Fallback if pause is not supported on platform
        }
        onStatusChange?.('paused');
      }
    },
    resume: async () => {
      if (currentSound) {
        await currentSound.playAsync();
      } else if (isSpeechActive) {
        try {
          await Speech.resume();
        } catch (e) {
          // Fallback if resume is not supported on platform
        }
        onStatusChange?.('playing');
      }
    },
    stop: async () => {
      await stopCurrentAudio();
      onStatusChange?.('finished');
    },
    seek: async (positionMs: number) => {
      if (currentSound) {
        await currentSound.setPositionAsync(positionMs);
      }
    },
  };
}

/**
 * Configures the audio session for narration playback.
 *
 * Should be called once during app initialization.
 */
export async function configureAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/**
 * Preloads an audio file into memory for faster playback start.
 *
 * @param filePath - Local path to the .mp3 file
 * @returns True if preload was successful
 */
export async function preloadAudio(filePath: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      return false;
    }
    if (preloadedSounds.has(filePath)) {
      return true;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: filePath },
      { shouldPlay: false }
    );
    preloadedSounds.set(filePath, sound);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Releases all audio resources.
 *
 * Should be called when the trip ends or the app is backgrounded.
 */
export async function releaseAudioResources(): Promise<void> {
  await stopCurrentAudio();
  for (const sound of preloadedSounds.values()) {
    try {
      await sound.unloadAsync();
    } catch (e) {
      // ignore
    }
  }
  preloadedSounds.clear();
}
