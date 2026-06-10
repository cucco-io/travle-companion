// Dynamically load expo-av to prevent runtime crash in environments where the native ExponentAV module is missing
let Audio: any = null;
let InterruptionModeIOS: any = { MixWithOthers: 0, DoNotMix: 1, DuckOthers: 2 };
let InterruptionModeAndroid: any = { MixWithOthers: 0, DoNotMix: 1, DuckOthers: 2 };

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
  console.warn('[audioDucking] expo-av is not available in this environment. Audio ducking will be disabled.', error);
}

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
 */
export async function setDuckingMode(mode: DuckingMode): Promise<void> {
  if (!Audio) {
    console.warn('[audioDucking] Audio module not available, skipping setDuckingMode.');
    return;
  }

  let interruptionModeIOS: any;
  let interruptionModeAndroid: any;

  switch (mode) {
    case 'duck':
      interruptionModeIOS = InterruptionModeIOS.DuckOthers;
      interruptionModeAndroid = InterruptionModeAndroid.DuckOthers;
      break;
    case 'pause':
      interruptionModeIOS = InterruptionModeIOS.DoNotMix;
      interruptionModeAndroid = InterruptionModeAndroid.DoNotMix;
      break;
    case 'mix':
      interruptionModeIOS = InterruptionModeIOS.MixWithOthers;
      interruptionModeAndroid = InterruptionModeAndroid.DuckOthers;
      break;
    default:
      interruptionModeIOS = InterruptionModeIOS.DuckOthers;
      interruptionModeAndroid = InterruptionModeAndroid.DuckOthers;
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS,
    interruptionModeAndroid,
    shouldDuckAndroid: mode === 'duck',
    playThroughEarpieceAndroid: false,
  });
}

/**
 * Temporarily takes the audio focus for narration playback.
 *
 * Call this before starting a narration to ensure proper audio ducking.
 * Call releaseFocus() when the narration ends.
 */
export async function requestAudioFocus(): Promise<void> {
  await setDuckingMode('duck');
}

/**
 * Releases audio focus after narration playback completes.
 *
 * This allows other apps (music players, navigation) to restore
 * their normal volume.
 */
export async function releaseAudioFocus(): Promise<void> {
  await setDuckingMode('mix');
}
