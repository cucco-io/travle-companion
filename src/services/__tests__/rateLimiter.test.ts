import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should enforce QPS limit and run in FIFO order', async () => {
    const limiter = new RateLimiter({ maxQPS: 2 }); // 1 request every 500ms
    const items = [1, 2, 3];
    const startedTimes: number[] = [];
    const completedItems: number[] = [];

    const processFn = jest.fn().mockImplementation(async (item: number) => {
      startedTimes.push(Date.now());
      completedItems.push(item);
      return item * 10;
    });

    const promise = limiter.processAll(items, processFn);

    // Initial state: Item 1 starts immediately
    await jest.advanceTimersByTimeAsync(0);

    // Item 2 should start after 500ms
    await jest.advanceTimersByTimeAsync(500);

    // Item 3 should start after another 500ms (1000ms total)
    await jest.advanceTimersByTimeAsync(500);

    const results = await promise;

    // Verify relative start times
    const baseTime = startedTimes[0];
    const relativeTimes = startedTimes.map(t => t - baseTime);
    expect(relativeTimes).toEqual([0, 500, 1000]);
    expect(completedItems).toEqual([1, 2, 3]);

    expect(results).toEqual([
      { success: true, value: 10 },
      { success: true, value: 20 },
      { success: true, value: 30 }
    ]);
  });

  test('should handle HTTP 429 retries with exponential backoff', async () => {
    const limiter = new RateLimiter({
      maxQPS: 10,
      maxRetries: 3,
      baseBackoffMs: 1000,
    });

    let calls = 0;
    const processFn = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls < 4) {
        // Mock a 429 error
        const err = new Error('Rate limit exceeded (429)');
        (err as any).status = 429;
        throw err;
      }
      return 'success';
    });

    const promise = limiter.processAll([1], processFn);

    // Initial attempt: fails immediately, triggers sleep for 1000ms (retry 1)
    await jest.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    // Advance 1000ms: retry 1 runs, fails, triggers sleep for 2000ms (retry 2)
    await jest.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);

    // Advance 2000ms: retry 2 runs, fails, triggers sleep for 4000ms (retry 3)
    await jest.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(3);

    // Advance 4000ms: retry 3 runs, succeeds
    await jest.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(4);

    const results = await promise;
    expect(results).toEqual([{ success: true, value: 'success' }]);
  });

  test('should fail if HTTP 429 persists beyond max retries', async () => {
    const limiter = new RateLimiter({
      maxQPS: 10,
      maxRetries: 3,
      baseBackoffMs: 1000,
    });

    const processFn = jest.fn().mockImplementation(async () => {
      const err = new Error('429 Too Many Requests');
      (err as any).status = 429;
      throw err;
    });

    const promise = limiter.processAll([1], processFn);

    // Initial run + 3 retries (at 1000ms, 2000ms, 4000ms)
    await jest.advanceTimersByTimeAsync(0); // Run 1
    await jest.advanceTimersByTimeAsync(1000); // Retry 1
    await jest.advanceTimersByTimeAsync(2000); // Retry 2
    await jest.advanceTimersByTimeAsync(4000); // Retry 3

    const results = await promise;
    expect(results[0].success).toBe(false);
    expect(results[0].error?.message).toContain('429');
  });

  test('should not retry non-429 errors and should continue processing subsequent items', async () => {
    const limiter = new RateLimiter({ maxQPS: 10 });
    const items = [1, 2, 3];
    const processFn = jest.fn().mockImplementation(async (item: number) => {
      if (item === 2) {
        throw new Error('Some database error');
      }
      return item * 10;
    });

    const promise = limiter.processAll(items, processFn);
    await jest.advanceTimersByTimeAsync(1000);

    const results = await promise;
    expect(results).toEqual([
      { success: true, value: 10 },
      { success: false, error: new Error('Some database error') },
      { success: true, value: 30 }
    ]);
  });

  test('should call onProgress callback with correct counts', async () => {
    const limiter = new RateLimiter({ maxQPS: 10 });
    const onProgress = jest.fn();
    const items = [1, 2, 3];
    const processFn = async (item: number) => item;

    const promise = limiter.processAll(items, processFn, onProgress);
    await jest.advanceTimersByTimeAsync(1000);
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  test('should cancel pending requests on cancel()', async () => {
    const limiter = new RateLimiter({ maxQPS: 2 }); // 500ms delay
    const items = [1, 2, 3];
    const processFn = async (item: number) => item;

    const promise = limiter.processAll(items, processFn);

    // Let the first one run
    await jest.advanceTimersByTimeAsync(0);

    // Cancel before the second starts
    limiter.cancel();

    await expect(promise).rejects.toThrow('AbortError');
  });

  test('should abort execution when AbortSignal triggers', async () => {
    const limiter = new RateLimiter({ maxQPS: 2 });
    const items = [1, 2, 3];
    const processFn = async (item: number) => item;
    const controller = new AbortController();

    const promise = limiter.processAll(items, processFn, undefined, controller.signal);

    await jest.advanceTimersByTimeAsync(0);

    controller.abort();

    await expect(promise).rejects.toThrow('AbortError');
  });

  test('should support the tasks-array signature and enqueue directly', async () => {
    const limiter = new RateLimiter({ maxQPS: 5 }); // 200ms delay
    
    // Testing enqueue
    const t1 = () => Promise.resolve('a');
    const p1 = limiter.enqueue(t1);
    await jest.advanceTimersByTimeAsync(0);
    const res1 = await p1;
    expect(res1).toBe('a');

    // Testing tasks processAll
    const tasks = [
      () => Promise.resolve(100),
      () => Promise.resolve(200),
    ];

    const promise = limiter.processAll(tasks);
    // Task 1 will wait 200ms because the limiter was recently used at 0ms.
    await jest.advanceTimersByTimeAsync(200);
    // Task 2 will wait another 200ms.
    await jest.advanceTimersByTimeAsync(200);
    
    const results = await promise;
    expect(results).toEqual([100, 200]);
  });
});
