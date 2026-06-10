import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { POI } from '../../types/poi';

// Dynamically load expo-av to prevent runtime crash in environments where the native ExponentAV module is missing
let Audio: any = null;
let InterruptionModeIOS: any = { DuckOthers: 2 };
let InterruptionModeAndroid: any = { DuckOthers: 2 };

try {
  const ExpoAV = require('expo-av');
  Audio = ExpoAV.Audio;
  if (ExpoAV.InterruptionModeIOS) {
    InterruptionModeIOS = ExpoAV.InterruptionModeIOS;
  }
  if (ExpoAV.InterruptionModeAndroid) {
    InterruptionModeAndroid = ExpoAV.InterruptionModeAndroid;
  }
} catch (error) {
  console.warn('[audioPlayer] expo-av is not available in this environment. Audio playback will be disabled.', error);
}

/**
 * Playback state reported by the audio player.
 */
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
 * PlaybackState returned by getCurrentPlaybackState.
 */
export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'loading';

/**
 * Callback for playback status changes.
 */
export type PlaybackStatusCallback = (status: PlaybackStatus) => void;

// Module level state
let currentSound: any = null;
let currentSoundIsPreloaded = false;
let isSpeechActive = false;
const preloadedSounds = new Map<string, any>();

// Progress and State tracking
let currentPlaybackState: PlaybackState = 'stopped';
let currentPosition = 0;
let currentDuration = 0;
let activeOnStatusChange: PlaybackStatusCallback | null = null;
let activeOnProgress: ((position: number, duration: number) => void) | null = null;

// Speech timing helpers
let speechInterval: NodeJS.Timeout | null = null;
let speechStartTime = 0;
let speechAccumulatedTime = 0;
let speechEstimatedDuration = 0;

function triggerStatusChange(status: PlaybackStatus) {
  if (status === 'loading') {
    currentPlaybackState = 'loading';
  } else if (status === 'playing') {
    currentPlaybackState = 'playing';
  } else if (status === 'paused') {
    currentPlaybackState = 'paused';
  } else {
    currentPlaybackState = 'stopped';
  }
  activeOnStatusChange?.(status);
}

async function stopCurrentAudio(): Promise<void> {
  if (speechInterval) {
    clearInterval(speechInterval);
    speechInterval = null;
  }
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
  currentPosition = 0;
  currentDuration = 0;
}

/**
 * Returns the current playback state ('playing', 'paused', 'stopped', 'loading').
 */
export function getCurrentPlaybackState(): PlaybackState {
  return currentPlaybackState;
}

/**
 * Plays a local .mp3 file.
 *
 * @param filePath - Local path to the .mp3 file
 * @param onStatusChange - Callback for playback status updates
 * @param onProgress - Callback for position/duration updates (in ms)
 */
export async function playAudioFile(
  filePath: string,
  onStatusChange?: PlaybackStatusCallback,
  onProgress?: (position: number, duration: number) => void
): Promise<void> {
  await stopCurrentAudio();

  activeOnStatusChange = onStatusChange || null;
  activeOnProgress = onProgress || null;
  currentPlaybackState = 'loading';
  triggerStatusChange('loading');

  const onPlaybackStatusUpdate = (status: any) => {
    if (!status.isLoaded) {
      if (status.error) {
        currentPosition = 0;
        currentDuration = 0;
        triggerStatusChange('error');
      }
      return;
    }

    currentPosition = status.positionMillis || 0;
    currentDuration = status.durationMillis || 0;
    activeOnProgress?.(currentPosition, currentDuration);

    if (status.didJustFinish) {
      currentPosition = 0;
      triggerStatusChange('finished');
      if (currentSound && !currentSoundIsPreloaded) {
        currentSound.unloadAsync().catch(() => {});
        currentSound = null;
      }
    } else if (status.isPlaying) {
      triggerStatusChange('playing');
    } else {
      triggerStatusChange('paused');
    }
  };

  try {
    if (!Audio) {
      throw new Error('Audio module (expo-av) is not available in this environment.');
    }

    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    if (preloadedSounds.has(filePath)) {
      const sound = preloadedSounds.get(filePath)!;
      currentSound = sound;
      currentSoundIsPreloaded = true;
      sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } else {
      currentSoundIsPreloaded = false;
      const result = await Audio.Sound.createAsync(
        { uri: filePath },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      currentSound = result.sound;
    }
  } catch (error) {
    currentPosition = 0;
    currentDuration = 0;
    triggerStatusChange('error');
    throw error;
  }
}

/**
 * Fallback speech synthesis using device TTS.
 *
 * @param text - The narration text to speak
 * @param language - BCP 47 language code
 * @param onStatusChange - Callback for playback status updates
 * @param onProgress - Callback for position/duration updates (in ms)
 */
export async function playTTSFallback(
  text: string,
  language: string,
  onStatusChange?: PlaybackStatusCallback,
  onProgress?: (position: number, duration: number) => void
): Promise<void> {
  await stopCurrentAudio();

  activeOnStatusChange = onStatusChange || null;
  activeOnProgress = onProgress || null;
  currentPlaybackState = 'loading';
  currentPosition = 0;
  currentDuration = 0;
  triggerStatusChange('loading');

  isSpeechActive = true;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  // Estimate duration: assume average speed of 150 words per minute (2.5 words per second)
  const estimatedDurationMs = Math.max(1000, (wordCount / 150) * 60 * 1000);
  currentDuration = estimatedDurationMs;
  speechEstimatedDuration = estimatedDurationMs;
  speechAccumulatedTime = 0;
  speechStartTime = Date.now();

  const startProgressInterval = () => {
    if (speechInterval) clearInterval(speechInterval);
    speechStartTime = Date.now();
    speechInterval = setInterval(() => {
      if (!isSpeechActive || currentPlaybackState !== 'playing') return;
      const elapsed = Date.now() - speechStartTime + speechAccumulatedTime;
      currentPosition = Math.min(elapsed, speechEstimatedDuration);
      activeOnProgress?.(currentPosition, currentDuration);
    }, 500);
  };

  const stopProgressInterval = () => {
    if (speechInterval) {
      clearInterval(speechInterval);
      speechInterval = null;
    }
  };

  try {
    Speech.speak(text, {
      language, // Pass language parameter/option to Speech.speak
      rate: 1.0,
      pitch: 1.0,
      onStart: () => {
        triggerStatusChange('playing');
        startProgressInterval();
      },
      onDone: () => {
        isSpeechActive = false;
        stopProgressInterval();
        currentPosition = speechEstimatedDuration;
        activeOnProgress?.(currentPosition, currentDuration);
        triggerStatusChange('finished');
      },
      onStopped: () => {
        isSpeechActive = false;
        stopProgressInterval();
        triggerStatusChange('paused');
      },
      onError: () => {
        isSpeechActive = false;
        stopProgressInterval();
        triggerStatusChange('error');
      },
    });
  } catch (error) {
    isSpeechActive = false;
    stopProgressInterval();
    triggerStatusChange('error');
    throw error;
  }
}

/**
 * Pauses the current narration audio or speech.
 */
export async function pauseAudio(): Promise<void> {
  if (currentSound) {
    await currentSound.pauseAsync();
  } else if (isSpeechActive) {
    try {
      await Speech.pause();
    } catch (e) {
      // ignore
    }
    speechAccumulatedTime += Date.now() - speechStartTime;
    triggerStatusChange('paused');
  }
}

/**
 * Resumes the current narration audio or speech.
 */
export async function resumeAudio(): Promise<void> {
  if (currentSound) {
    await currentSound.playAsync();
  } else if (isSpeechActive) {
    try {
      await Speech.resume();
    } catch (e) {
      // ignore
    }
    speechStartTime = Date.now();
    triggerStatusChange('playing');
  }
}

/**
 * Stops the current narration audio or speech.
 */
export async function stopAudio(): Promise<void> {
  await stopCurrentAudio();
  triggerStatusChange('finished');
}

/**
 * Seeks to a specific position in ms (only for audio files).
 */
export async function seekAudio(positionMs: number): Promise<void> {
  if (currentSound) {
    await currentSound.setPositionAsync(positionMs);
  }
}

/**
 * Configures the audio session for narration playback.
 *
 * Should be called once during app initialization.
 */
export async function configureAudioSession(): Promise<void> {
  if (!Audio) {
    console.warn('[audioPlayer] Audio module not available, skipping configureAudioSession.');
    return;
  }
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
  if (!Audio) {
    return false;
  }
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
