/**
 * src/services/audio/audioDucking.ts
 *
 * Audio ducking integration with navigation apps.
 * When a narration starts playing, other audio (music, navigation prompts)
 * should lower in volume ("duck") so the narration is clearly audible.
 *
 * This is handled at the OS level via audio session configuration,
 * but this module provides higher-level control and coordination.
 *
 * Dependencies:
 * - expo-av (Audio.setAudioModeAsync for interruption mode)
 */

/**
 * Audio ducking mode.
 * - 'duck': Lower other apps' audio volume during narration
 * - 'pause': Pause other apps' audio during narration (more aggressive)
 * - 'mix': Play alongside other audio without ducking (not recommended)
 */
export type DuckingMode = 'duck' | 'pause' | 'mix';

/**
 * Configures the audio interruption behavior for narration playback.
 *
 * @param mode - The ducking mode to apply
 *
 * Implementation notes:
 * - Use Audio.setAudioModeAsync() from expo-av
 * - For 'duck' mode:
 *   - iOS: interruptionModeIOS = InterruptionModeIOS.DuckOthers
 *   - Android: interruptionModeAndroid = InterruptionModeAndroid.DuckOthers
 * - For 'pause' mode:
 *   - iOS: interruptionModeIOS = InterruptionModeIOS.DoNotMix
 *   - Android: interruptionModeAndroid = InterruptionModeAndroid.DoNotMix
 * - For 'mix' mode:
 *   - iOS: interruptionModeIOS = InterruptionModeIOS.MixWithOthers
 *   - Android: interruptionModeAndroid = InterruptionModeAndroid.DuckOthers
 * - Also set playsInSilentModeIOS: true and staysActiveInBackground: true
 */
export async function setDuckingMode(mode: DuckingMode): Promise<void> {
  // TODO: Implement audio ducking configuration
  // 1. Map DuckingMode to expo-av InterruptionMode constants
  // 2. Call Audio.setAudioModeAsync with the appropriate settings
  throw new Error('Not implemented');
}

/**
 * Temporarily takes the audio focus for narration playback.
 *
 * Call this before starting a narration to ensure proper audio ducking.
 * Call releaseFocus() when the narration ends.
 *
 * Implementation notes:
 * - On Android, this requests audio focus from the system
 * - On iOS, the audio session configuration handles this automatically
 * - Consider platform-specific implementations
 */
export async function requestAudioFocus(): Promise<void> {
  // TODO: Implement audio focus request
  throw new Error('Not implemented');
}

/**
 * Releases audio focus after narration playback completes.
 *
 * This allows other apps (music players, navigation) to restore
 * their normal volume.
 */
export async function releaseAudioFocus(): Promise<void> {
  // TODO: Implement audio focus release
  throw new Error('Not implemented');
}
