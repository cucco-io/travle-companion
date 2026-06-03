/**
 * src/services/audio/audioPlayer.ts
 *
 * Audio playback engine for POI narrations.
 * Supports two playback modes:
 * 1. Pre-generated .mp3 files (preferred — higher quality)
 * 2. Device TTS fallback (expo-speech — when .mp3 is unavailable)
 *
 * Dependencies:
 * - expo-av (Audio.Sound for .mp3 playback)
 * - expo-speech (Speech.speak for TTS fallback)
 * - src/types/poi.ts (POI)
 */

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

/**
 * Plays the narration audio for a POI.
 *
 * @param poi - The POI whose narration to play
 * @param onStatusChange - Callback for playback status updates
 * @returns Control object with pause, resume, stop, and seek functions
 *
 * Implementation notes:
 * - If poi.audio_file_path exists and file is accessible:
 *   - Use expo-av Audio.Sound.createAsync to load the .mp3
 *   - Set audio mode to allow playback in background
 *   - Configure interruption mode for ducking with other audio
 * - If audio_file_path is null:
 *   - Fall back to expo-speech Speech.speak()
 *   - Use poi.narration_text as the input
 *   - Set language, speaking rate, pitch appropriately
 * - Report status changes through the callback
 * - Handle errors gracefully (corrupted files, missing permissions)
 *
 * @see Audio ducking: src/services/audio/audioDucking.ts
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
  // TODO: Implement narration playback
  // 1. Check if audio_file_path exists
  // 2. If yes, load and play .mp3 via expo-av
  // 3. If no, fall back to expo-speech
  // 4. Set up status monitoring
  // 5. Return control functions
  throw new Error('Not implemented');
}

/**
 * Configures the audio session for narration playback.
 *
 * Should be called once during app initialization.
 *
 * Implementation notes:
 * - Use Audio.setAudioModeAsync() from expo-av
 * - allowsRecordingIOS: false
 * - playsInSilentModeIOS: true (important for driving)
 * - staysActiveInBackground: true (so narration plays when phone is locked)
 * - interruptionModeIOS: InterruptionModeIOS.DuckOthers
 * - interruptionModeAndroid: InterruptionModeAndroid.DuckOthers
 */
export async function configureAudioSession(): Promise<void> {
  // TODO: Implement audio session configuration
  throw new Error('Not implemented');
}

/**
 * Preloads an audio file into memory for faster playback start.
 *
 * @param filePath - Local path to the .mp3 file
 * @returns True if preload was successful
 *
 * Implementation notes:
 * - Use Audio.Sound.createAsync with shouldPlay: false
 * - Cache the Sound object for later use in playNarration
 * - Verify the file exists before attempting to load
 * - Return false if file is missing or corrupted
 */
export async function preloadAudio(filePath: string): Promise<boolean> {
  // TODO: Implement audio preloading
  throw new Error('Not implemented');
}

/**
 * Releases all audio resources.
 *
 * Should be called when the trip ends or the app is backgrounded.
 *
 * Implementation notes:
 * - Unload all cached Sound objects via sound.unloadAsync()
 * - Stop any expo-speech in progress via Speech.stop()
 * - Clear internal caches
 */
export async function releaseAudioResources(): Promise<void> {
  // TODO: Implement resource cleanup
  throw new Error('Not implemented');
}
