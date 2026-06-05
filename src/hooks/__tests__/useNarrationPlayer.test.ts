import { useNarrationPlayer } from '../useNarrationPlayer';
import React from 'react';
import { configureAudioSession, releaseAudioResources } from '../../services/audio/audioPlayer';
import { setDuckingMode } from '../../services/audio/audioDucking';
import { createNarrationQueue } from '../../services/audio/narrationQueue';

jest.mock('../../services/audio/audioPlayer', () => ({
  configureAudioSession: jest.fn().mockResolvedValue(undefined),
  releaseAudioResources: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/audio/audioDucking', () => ({
  setDuckingMode: jest.fn().mockResolvedValue(undefined),
}));

const mockQueueInstance = {
  enqueue: jest.fn(),
  skip: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  replay: jest.fn(),
  stop: jest.fn(),
  getState: jest.fn().mockReturnValue({
    currentPOI: null,
    playbackStatus: 'idle',
    queue: [],
    lastPlayedAt: 0,
    isPaused: false,
    log: [],
  }),
};

jest.mock('../../services/audio/narrationQueue', () => ({
  createNarrationQueue: jest.fn().mockImplementation(() => mockQueueInstance),
}));

describe('useNarrationPlayer hook', () => {
  let mockStateCallback: any = null;
  let states: Record<string, any>;
  let stateSetters: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateCallback = null;
    states = {};
    stateSetters = {};

    (createNarrationQueue as jest.Mock).mockImplementation((cb) => {
      mockStateCallback = cb;
      return mockQueueInstance;
    });

    // Mock React.useState to return tracked state
    let stateCallIndex = 0;
    const stateKeys = ['currentPOI', 'playbackStatus', 'queueLength', 'isPaused', 'playbackLog'];
    
    jest.spyOn(React, 'useState').mockImplementation(((initialValue: any) => {
      const key = stateKeys[stateCallIndex++];
      states[key] = initialValue;
      stateSetters[key] = jest.fn().mockImplementation((val) => {
        states[key] = val;
      });
      return [states[key], stateSetters[key]];
    }) as any);

    // Mock React.useRef
    jest.spyOn(React, 'useRef').mockImplementation(((initialValue: any) => {
      return { current: initialValue };
    }) as any);

    // Mock React.useEffect
    jest.spyOn(React, 'useEffect').mockImplementation(((effect: any) => {
      effect();
    }) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes narration queue and session configs on mount', async () => {
    const result = useNarrationPlayer();

    // Flush microtasks
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(configureAudioSession).toHaveBeenCalled();
    expect(setDuckingMode).toHaveBeenCalledWith('duck');
    expect(createNarrationQueue).toHaveBeenCalled();

    // Verify initial values
    expect(result.currentPOI).toBeNull();
    expect(result.playbackStatus).toBe('idle');
    expect(result.queueLength).toBe(0);
    expect(result.isPaused).toBe(false);
    expect(result.playbackLog).toEqual([]);
  });

  it('updates state when queue triggers state callback', () => {
    useNarrationPlayer();
    expect(mockStateCallback).toBeDefined();

    // Trigger callback
    const mockPoi = { id: 'poi-1', name: 'Colosseum' } as any;
    mockStateCallback({
      currentPOI: mockPoi,
      playbackStatus: 'playing',
      queue: [{}, {}],
      lastPlayedAt: 12345,
      isPaused: true,
      log: [{ poi_id: 'poi-1' }],
    });

    expect(stateSetters['currentPOI']).toHaveBeenCalledWith(mockPoi);
    expect(stateSetters['playbackStatus']).toHaveBeenCalledWith('playing');
    expect(stateSetters['queueLength']).toHaveBeenCalledWith(2);
    expect(stateSetters['isPaused']).toHaveBeenCalledWith(true);
    expect(stateSetters['playbackLog']).toHaveBeenCalledWith([{ poi_id: 'poi-1' }]);
  });

  it('delegates controls to the narration queue', () => {
    const player = useNarrationPlayer();

    player.enqueue({ id: 'poi-1' } as any);
    expect(mockQueueInstance.enqueue).toHaveBeenCalledWith({ id: 'poi-1' });

    player.skip();
    expect(mockQueueInstance.skip).toHaveBeenCalled();

    player.pause();
    expect(mockQueueInstance.pause).toHaveBeenCalled();

    player.resume();
    expect(mockQueueInstance.resume).toHaveBeenCalled();

    player.replay();
    expect(mockQueueInstance.replay).toHaveBeenCalled();

    player.stop();
    expect(mockQueueInstance.stop).toHaveBeenCalled();
  });

  it('configures ducking mode as pause when pauseOnNavigation is true', async () => {
    useNarrationPlayer(true);

    // Flush microtasks
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(setDuckingMode).toHaveBeenCalledWith('pause');
  });
});
