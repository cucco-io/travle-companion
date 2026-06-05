import { useState, useEffect, useRef } from 'react';
import { POI } from '../types/poi';
import { PlaybackStatus, configureAudioSession, releaseAudioResources } from '../services/audio/audioPlayer';
import { createNarrationQueue } from '../services/audio/narrationQueue';
import { setDuckingMode } from '../services/audio/audioDucking';
import { TripLogEntry } from '../types/trip';

/**
 * State returned by the useNarrationPlayer hook.
 */
export interface NarrationPlayerState {
  /** The POI currently being narrated (null if idle) */
  currentPOI: POI | null;

  /** Current playback status */
  playbackStatus: PlaybackStatus;

  /** Number of narrations waiting in the queue */
  queueLength: number;

  /** Whether the player is paused by the user */
  isPaused: boolean;

  /** Playback log for the current trip session */
  playbackLog: TripLogEntry[];
}

/**
 * Hook for controlling narration playback during an active trip.
 *
 * @returns Object with player state and control functions
 */
export function useNarrationPlayer(pauseOnNavigation: boolean = false): NarrationPlayerState & {
  enqueue: (poi: POI) => void;
  skip: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  stop: () => void;
} {
  const [currentPOI, setCurrentPOI] = useState<POI | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [queueLength, setQueueLength] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackLog, setPlaybackLog] = useState<TripLogEntry[]>([]);

  // Use any to represent the returned narration queue interface
  const queueRef = useRef<ReturnType<typeof createNarrationQueue> | null>(null);

  useEffect(() => {
    const queueInstance = createNarrationQueue((state) => {
      setCurrentPOI(state.currentPOI);
      setPlaybackStatus(state.playbackStatus);
      setQueueLength(state.queue.length);
      setIsPaused(state.isPaused);
      setPlaybackLog(state.log);
    });

    queueRef.current = queueInstance;

    // Synchronize initial state
    const initialState = queueInstance.getState();
    setCurrentPOI(initialState.currentPOI);
    setPlaybackStatus(initialState.playbackStatus);
    setQueueLength(initialState.queue.length);
    setIsPaused(initialState.isPaused);
    setPlaybackLog(initialState.log);

    return () => {
      if (queueRef.current) {
        queueRef.current.stop();
      }
      releaseAudioResources().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const initAudio = async () => {
      try {
        await configureAudioSession();
        const mode = pauseOnNavigation ? 'pause' : 'duck';
        await setDuckingMode(mode);
      } catch (e) {
        // ignore
      }
    };
    initAudio();
  }, [pauseOnNavigation]);

  const enqueue = (poi: POI) => {
    if (queueRef.current) {
      queueRef.current.enqueue(poi);
    }
  };

  const skip = () => {
    if (queueRef.current) {
      queueRef.current.skip();
    }
  };

  const pause = () => {
    if (queueRef.current) {
      queueRef.current.pause();
    }
  };

  const resume = () => {
    if (queueRef.current) {
      queueRef.current.resume();
    }
  };

  const replay = () => {
    if (queueRef.current) {
      queueRef.current.replay();
    }
  };

  const stop = () => {
    if (queueRef.current) {
      queueRef.current.stop();
    }
  };

  return {
    currentPOI,
    playbackStatus,
    queueLength,
    isPaused,
    playbackLog,
    enqueue,
    skip,
    pause,
    resume,
    replay,
    stop,
  };
}
