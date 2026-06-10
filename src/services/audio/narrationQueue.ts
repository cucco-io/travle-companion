import { POI } from '../../types/poi';
import { TripLogEntry } from '../../types/trip';
import {
  PlaybackStatus,
  playAudioFile,
  playTTSFallback,
  pauseAudio,
  resumeAudio,
  stopAudio,
  seekAudio,
} from './audioPlayer';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { loadSettings } from '../storage/settingsStorage';
import { CONFIG } from '../../constants/config';

/**
 * State of the narration queue.
 */
export interface NarrationQueueState {
  /** The POI currently being narrated (null if idle) */
  currentPOI: POI | null;

  /** Current playback status */
  playbackStatus: PlaybackStatus;

  /** POIs waiting to be narrated */
  queue: POI[];

  /** Timestamp (epoch ms) of the last completed narration */
  lastPlayedAt: number;

  /** Whether the queue is paused by the user */
  isPaused: boolean;

  /** History of played/skipped narrations */
  log: TripLogEntry[];
}

/**
 * Callback for queue state changes (for React hook integration).
 */
export type QueueStateCallback = (state: NarrationQueueState) => void;

/**
 * Options for the narration queue.
 */
export interface NarrationQueueOptions {
  onNarrationStart?: (poi: POI) => void;
  onNarrationEnd?: (poi: POI) => void;
  language?: string;
}

/**
 * Creates and initializes a narration queue.
 *
 * @param onStateChange - Callback fired whenever the queue state changes
 * @param options - Additional options including callbacks and language
 * @returns Queue control functions
 */
export function createNarrationQueue(
  onStateChange: QueueStateCallback,
  options?: NarrationQueueOptions
): {
  enqueue: (poi: POI) => void;
  skip: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  stop: () => void;
  getState: () => NarrationQueueState;
} {
  let currentPOI: POI | null = null;
  let playbackStatus: PlaybackStatus = 'idle';
  let queue: POI[] = [];
  let lastPlayedAt: number = 0;
  let lastTriggeredAt: number = 0;
  let isPaused: boolean = false;
  let log: TripLogEntry[] = [];

  let isPlayingChime = false;

  const onNarrationStart = options?.onNarrationStart;
  const onNarrationEnd = options?.onNarrationEnd;
  const language = options?.language || 'en';

  let cooldownTimeout: NodeJS.Timeout | null = null;
  const cooldownMs = CONFIG.NARRATION.COOLDOWN_MS; // Configurable via configuration file

  function getState(): NarrationQueueState {
    return {
      currentPOI,
      playbackStatus,
      queue: [...queue],
      lastPlayedAt,
      isPaused,
      log: [...log],
    };
  }

  async function startNarration(poi: POI) {
    try {
      playbackStatus = 'loading';
      onStateChange(getState());

      const onStatus = (status: PlaybackStatus) => {
        playbackStatus = status;
        if (status === 'finished') {
          lastPlayedAt = Date.now();
          const entry = createLogEntry(poi, poi.coordinates.lat, poi.coordinates.lng, false);
          log.push(entry);
          currentPOI = null;
          onStateChange(getState());
          onNarrationEnd?.(poi);
          playNext();
        } else if (status === 'error') {
          currentPOI = null;
          onStateChange(getState());
          onNarrationEnd?.(poi);
          playNext();
        } else {
          onStateChange(getState());
        }
      };

      const settings = await loadSettings();
      if (settings.ttsProvider === 'gemini' && poi.audio_file_path) {
        try {
          const info = await FileSystem.getInfoAsync(poi.audio_file_path);
          if (info.exists) {
            await playAudioFile(poi.audio_file_path, onStatus);
            return;
          }
        } catch (e) {
          // ignore, fall back
        }
      }

      await playTTSFallback(poi.narration_text, language, onStatus);
    } catch (error) {
      playbackStatus = 'error';
      currentPOI = null;
      onStateChange(getState());
      onNarrationEnd?.(poi);
      playNext();
    }
  }

  function playNext(bypassCooldown = false) {
    if (isPaused) return;
    if (currentPOI !== null) return;
    if (queue.length === 0) return;

    const now = Date.now();
    const timeSinceLast = now - lastTriggeredAt;

    if (!bypassCooldown && timeSinceLast < cooldownMs) {
      if (cooldownTimeout) {
        clearTimeout(cooldownTimeout);
      }
      cooldownTimeout = setTimeout(() => {
        playNext();
      }, cooldownMs - timeSinceLast);
      return;
    }

    const poi = queue.shift()!;
    currentPOI = poi;
    isPlayingChime = true;
    playbackStatus = 'playing';
    lastTriggeredAt = Date.now();
    onStateChange(getState());
    onNarrationStart?.(poi);

    Speech.speak(`Coming up next: ${poi.name}`, {
      language, // Pass the language option to speech.speak for chime
      rate: 1.0,
      pitch: 1.0,
      onStart: () => {
        playbackStatus = 'playing';
        onStateChange(getState());
      },
      onDone: () => {
        if (!isPlayingChime) return;
        isPlayingChime = false;
        startNarration(poi);
      },
      onStopped: () => {
        if (!isPlayingChime) return;
        isPlayingChime = false;
        startNarration(poi);
      },
      onError: () => {
        if (!isPlayingChime) return;
        isPlayingChime = false;
        startNarration(poi);
      },
    });
  }

  function enqueue(poi: POI) {
    if (currentPOI?.id === poi.id || queue.some((p) => p.id === poi.id)) {
      return;
    }
    queue.push(poi);
    onStateChange(getState());

    if (currentPOI === null) {
      playNext();
    }
  }

  function skip() {
    if (currentPOI === null) return;

    const poi = currentPOI;
    if (isPlayingChime) {
      isPlayingChime = false;
      Speech.stop().catch(() => {});
    }

    stopAudio().catch(() => {});

    const entry = createLogEntry(poi, poi.coordinates.lat, poi.coordinates.lng, true);
    log.push(entry);

    currentPOI = null;
    playbackStatus = 'finished';
    onStateChange(getState());
    onNarrationEnd?.(poi);

    // Skip bypasses cooldown to play the next item immediately
    playNext(true);
  }

  function pause() {
    if (isPaused) return;
    isPaused = true;

    if (isPlayingChime) {
      Speech.pause().catch(() => {});
      playbackStatus = 'paused';
      onStateChange(getState());
    } else if (currentPOI) {
      pauseAudio().catch(() => {});
    } else {
      onStateChange(getState());
    }
  }

  function resume() {
    if (!isPaused) return;
    isPaused = false;

    if (isPlayingChime) {
      Speech.resume().catch(() => {});
      playbackStatus = 'playing';
      onStateChange(getState());
    } else if (currentPOI) {
      resumeAudio().catch(() => {});
    } else {
      onStateChange(getState());
      playNext();
    }
  }

  function replay() {
    if (currentPOI === null) return;

    if (isPlayingChime) {
      Speech.stop().catch(() => {});
      Speech.speak(`Coming up next: ${currentPOI.name}`, {
        language,
        rate: 1.0,
        pitch: 1.0,
        onStart: () => {
          playbackStatus = 'playing';
          onStateChange(getState());
        },
        onDone: () => {
          if (!isPlayingChime) return;
          isPlayingChime = false;
          startNarration(currentPOI!);
        },
        onStopped: () => {
          if (!isPlayingChime) return;
          isPlayingChime = false;
          startNarration(currentPOI!);
        },
        onError: () => {
          if (!isPlayingChime) return;
          isPlayingChime = false;
          startNarration(currentPOI!);
        },
      });
    } else {
      if (currentPOI) {
        seekAudio(0).then(() => {
          resumeAudio().catch(() => {});
        }).catch(() => {
          startNarration(currentPOI!);
        });
      } else {
        startNarration(currentPOI);
      }
    }
  }

  function stop() {
    if (cooldownTimeout) {
      clearTimeout(cooldownTimeout);
      cooldownTimeout = null;
    }
    queue = [];
    if (isPlayingChime) {
      isPlayingChime = false;
      Speech.stop().catch(() => {});
    }
    stopAudio().catch(() => {});
    const poi = currentPOI;
    currentPOI = null;
    playbackStatus = 'idle';
    isPaused = false;
    lastTriggeredAt = 0;
    lastPlayedAt = 0;
    onStateChange(getState());
    if (poi) {
      onNarrationEnd?.(poi);
    }
  }

  return {
    enqueue,
    skip,
    pause,
    resume,
    replay,
    stop,
    getState,
  };
}


/**
 * Checks if the cooldown period has elapsed since the last narration.
 *
 * @param lastPlayedAt - Epoch ms timestamp of the last completed narration
 * @param cooldownMs - Minimum time between narrations in ms
 * @returns True if enough time has passed and a new narration can start
 */
export function isCooldownElapsed(
  lastPlayedAt: number,
  cooldownMs: number
): boolean {
  return Date.now() - lastPlayedAt >= cooldownMs;
}

/**
 * Creates a TripLogEntry for a play or skip event.
 *
 * @param poi - The POI that was played or skipped
 * @param lat - User's latitude at the time of the event
 * @param lng - User's longitude at the time of the event
 * @param skipped - Whether the narration was skipped
 * @returns A TripLogEntry record
 */
export function createLogEntry(
  poi: POI,
  lat: number,
  lng: number,
  skipped: boolean
): TripLogEntry {
  return {
    poi_id: poi.id,
    played_at: new Date().toISOString(),
    location: {
      lat,
      lng,
    },
    skipped,
  };
}
