/**
 * src/services/audio/narrationQueue.ts
 *
 * Narration queue manager with cooldown and skip functionality.
 * Manages the ordered queue of POI narrations during an active trip.
 * Ensures narrations play in the right order, with proper spacing,
 * and handles user actions like skip and replay.
 *
 * Dependencies:
 * - src/services/audio/audioPlayer.ts (playNarration)
 * - src/types/poi.ts (POI)
 * - src/types/trip.ts (TripLogEntry)
 * - src/constants/config.ts (NARRATION.COOLDOWN_MS)
 */

import { POI } from '../../types/poi';
import { TripLogEntry } from '../../types/trip';
import { PlaybackStatus } from './audioPlayer';

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
 * Creates and initializes a narration queue.
 *
 * @param onStateChange - Callback fired whenever the queue state changes
 * @returns Queue control functions
 *
 * Implementation notes:
 * - The queue receives POIs from the proximity engine via `enqueue()`
 * - Only one narration plays at a time
 * - After a narration finishes, check the cooldown before auto-playing the next
 * - If cooldown hasn't elapsed, wait until it has
 * - User can skip the current narration (stops playback, moves to next)
 * - User can pause/resume the current narration
 * - All play/skip events are logged as TripLogEntry records
 */
export function createNarrationQueue(
  onStateChange: QueueStateCallback
): {
  enqueue: (poi: POI) => void;
  skip: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  stop: () => void;
  getState: () => NarrationQueueState;
} {
  // TODO: Implement narration queue
  // 1. Initialize state with empty queue, null currentPOI, idle status
  // 2. Implement enqueue: add POI to queue, auto-play if idle and cooldown elapsed
  // 3. Implement skip: stop current playback, log as skipped, advance queue
  // 4. Implement pause/resume: delegate to audioPlayer
  // 5. Implement replay: restart current narration from the beginning
  // 6. Implement stop: clear queue, stop playback, clean up
  throw new Error('Not implemented');
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
  // TODO: Implement cooldown check
  // return Date.now() - lastPlayedAt >= cooldownMs
  throw new Error('Not implemented');
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
  // TODO: Implement log entry creation
  throw new Error('Not implemented');
}
