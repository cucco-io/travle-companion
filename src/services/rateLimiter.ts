/**
 * src/services/rateLimiter.ts
 *
 * A generic request throttler that enforces a maximum QPS (queries per second) limit.
 * Primarily used for Gemini API calls (15 QPS quota, we use 12 QPS for safety).
 *
 * Features:
 * - Queue-based: requests are queued and fired at a controlled rate
 * - Retry with exponential backoff on 429 (rate limit) errors (max 3 retries)
 * - Progress callback for UI updates
 * - Cancellable via AbortSignal
 *
 * Usage example:
 * ```typescript
 * const limiter = new RateLimiter({ maxQPS: 12, maxRetries: 3 });
 *
 * const results = await limiter.processAll(
 *   items,
 *   async (item) => await someApiCall(item),
 *   (completed, total) => console.log(`${completed}/${total}`)
 * );
 * ```
 */

/**
 * Configuration options for the RateLimiter.
 */
export interface RateLimiterConfig {
  /** Maximum requests per second (default: 12) */
  maxQPS: number;

  /** Maximum retry attempts on 429 errors (default: 3) */
  maxRetries: number;

  /** Base delay in ms for exponential backoff (default: 1000) */
  baseBackoffMs?: number;
}

/**
 * Result of a single item processed by the RateLimiter.
 */
export interface RateLimitResult<T> {
  /** The result value if successful */
  value?: T;

  /** The error if the request failed after all retries */
  error?: Error;

  /** Whether this item was processed successfully */
  success: boolean;
}

/**
 * Helper function to determine if an error is an HTTP 429 (Rate Limit) error.
 */
function is429Error(error: any): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  if (error.response && error.response.status === 429) return true;
  if (typeof error.message === 'string' && error.message.includes('429')) return true;
  return false;
}

interface QueueItem<T = any> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  signal?: AbortSignal;
}

/**
 * A generic request throttler that enforces a max QPS limit.
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private aborted = false;
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private cancelCallbacks: Set<() => void> = new Set();

  constructor(config?: Partial<RateLimiterConfig> | number) {
    if (typeof config === 'number') {
      this.config = {
        maxQPS: config,
        maxRetries: 3,
        baseBackoffMs: 1000,
      };
    } else {
      this.config = {
        maxQPS: config?.maxQPS ?? 12,
        maxRetries: config?.maxRetries ?? 3,
        baseBackoffMs: config?.baseBackoffMs ?? 1000,
      };
    }
  }

  /**
   * Cancels the current run. Pending tasks in the queue are rejected with AbortError,
   * and any active sleeps or retries are aborted.
   */
  cancel(): void {
    this.aborted = true;
    for (const callback of this.cancelCallbacks) {
      callback();
    }
    this.cancelCallbacks.clear();

    const pending = [...this.queue];
    this.queue = [];
    for (const item of pending) {
      item.reject(new Error('AbortError'));
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.aborted || (signal && signal.aborted)) {
        return reject(new Error('AbortError'));
      }

      let timeoutId: NodeJS.Timeout;

      const cleanUp = () => {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        this.cancelCallbacks.delete(onCancel);
      };

      const onCancel = () => {
        cleanUp();
        reject(new Error('AbortError'));
      };

      const onAbort = () => {
        onCancel();
      };

      this.cancelCallbacks.add(onCancel);

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      timeoutId = setTimeout(() => {
        cleanUp();
        resolve();
      }, ms);
    });
  }

  /**
   * Executes a single request with retry logic on 429 errors.
   */
  async executeWithRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const maxRetries = this.config.maxRetries;
    const baseBackoffMs = this.config.baseBackoffMs ?? 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.aborted || (signal && signal.aborted)) {
        throw new Error('AbortError');
      }

      try {
        return await fn();
      } catch (error: any) {
        if (this.aborted || (signal && signal.aborted)) {
          throw new Error('AbortError');
        }

        if (is429Error(error) && attempt < maxRetries) {
          const delay = baseBackoffMs * Math.pow(2, attempt);
          await this.sleep(delay, signal);
        } else {
          throw error;
        }
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Enqueues a single task of type `() => Promise<T>` and schedules it.
   */
  async enqueue<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.aborted || (signal && signal.aborted)) {
      throw new Error('AbortError');
    }

    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem<T> = {
        fn,
        resolve,
        reject,
        signal,
      };

      const onCancel = () => {
        const index = this.queue.indexOf(queueItem);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error('AbortError'));
      };

      this.cancelCallbacks.add(onCancel);

      const onAbort = () => {
        this.cancelCallbacks.delete(onCancel);
        const index = this.queue.indexOf(queueItem);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error('AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      const originalResolve = resolve;
      const originalReject = reject;

      queueItem.resolve = (value: T) => {
        this.cancelCallbacks.delete(onCancel);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        originalResolve(value);
      };

      queueItem.reject = (error: any) => {
        this.cancelCallbacks.delete(onCancel);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        originalReject(error);
      };

      this.queue.push(queueItem);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && !this.aborted) {
        const item = this.queue[0];
        if (!item) {
          this.queue.shift();
          continue;
        }

        if (item.signal && item.signal.aborted) {
          this.queue.shift();
          item.reject(new Error('AbortError'));
          continue;
        }

        const now = Date.now();
        const interRequestDelay = 1000 / this.config.maxQPS;
        const elapsed = now - this.lastRequestTime;
        const waitTime = interRequestDelay - elapsed;

        if (waitTime > 0) {
          try {
            await this.sleep(waitTime, item.signal);
          } catch (err) {
            if (item.signal && item.signal.aborted) {
              this.queue.shift();
              item.reject(err);
            }
            continue;
          }
        }

        if (this.aborted) {
          break;
        }

        if (item.signal && item.signal.aborted) {
          this.queue.shift();
          item.reject(new Error('AbortError'));
          continue;
        }

        this.queue.shift();
        this.lastRequestTime = Date.now();

        try {
          const val = await this.executeWithRetry(item.fn, item.signal);
          item.resolve(val);
        } catch (err) {
          item.reject(err);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processes an array of items through a rate-limited async function.
   * Or processes an array of tasks.
   */
  async processAll<TInput, TOutput>(
    items: TInput[],
    processFn: (item: TInput) => Promise<TOutput>,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<RateLimitResult<TOutput>[]>;

  async processAll<T>(
    tasks: Array<() => Promise<T>>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<T[]>;

  async processAll(
    itemsOrTasks: any[],
    processFnOrProgress?: any,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<any[]> {
    this.aborted = false;

    if (itemsOrTasks.length === 0) {
      return [];
    }

    const isTasksSignature =
      typeof itemsOrTasks[0] === 'function' ||
      processFnOrProgress === undefined ||
      (typeof processFnOrProgress === 'function' && itemsOrTasks.every(item => typeof item === 'function'));

    if (isTasksSignature) {
      const tasks = itemsOrTasks as Array<() => Promise<any>>;
      const progressCb = processFnOrProgress as ((completed: number, total: number) => void) | undefined;
      const results: any[] = [];
      const total = tasks.length;
      let completed = 0;

      for (let i = 0; i < total; i++) {
        if (this.aborted) {
          throw new Error('AbortError');
        }

        const task = tasks[i];
        const val = await this.enqueue(task);
        results.push(val);

        completed++;
        if (progressCb) {
          progressCb(completed, total);
        }
      }
      return results;
    } else {
      const items = itemsOrTasks;
      const processFn = processFnOrProgress as (item: any) => Promise<any>;
      const progressCb = onProgress;
      const results: RateLimitResult<any>[] = [];
      const total = items.length;
      let completed = 0;

      for (let i = 0; i < total; i++) {
        if (this.aborted || (signal && signal.aborted)) {
          throw new Error('AbortError');
        }

        let value: any;
        let error: Error | undefined;
        let success = false;

        try {
          value = await this.enqueue(() => processFn(items[i]), signal);
          success = true;
        } catch (err: any) {
          if (err.message === 'AbortError') {
            throw err;
          }
          error = err instanceof Error ? err : new Error(String(err));
        }

        if (this.aborted || (signal && signal.aborted)) {
          throw new Error('AbortError');
        }

        results.push({ value, error, success });
        completed++;
        if (progressCb) {
          progressCb(completed, total);
        }
      }
      return results;
    }
  }
}
