/**
 * src/constants/config.ts
 *
 * App-wide configuration constants.
 * All magic numbers live here — no hardcoded values in service/hook code.
 *
 * These values were chosen based on real-world testing and API quotas.
 * Adjust as needed during development.
 */

export const CONFIG = {
  /**
   * Proximity trigger radius — how close the user must be to a POI
   * before its narration is automatically triggered.
   */
  TRIGGER_RADIUS: {
    /** City mode: user is walking — tight radius (50 meters) */
    CITY_MODE_METERS: 50,
    /** Route mode: user is driving — loose radius (~2 miles / 3200 meters) */
    ROUTE_MODE_METERS: 3200,
  },

  /**
   * Maximum number of POIs to include in a trip.
   * Keeps pre-generation time and storage reasonable.
   */
  POI_BUDGET: {
    /** Small city (e.g., Siena, Bruges) */
    SMALL: 15,
    /** Medium city (e.g., Florence, Amsterdam) */
    MEDIUM: 25,
    /** Mega city (e.g., Rome, London, NYC) */
    MEGA: 30,
    /** Route mode: 1 POI per 15 miles of driving distance */
    ROUTE_PER_MILE: 1 / 15,
  },

  /**
   * Narration length targets (word counts) per depth setting.
   * Used in prompt construction and post-generation validation.
   * ~150 words per minute for listening estimation.
   */
  NARRATION: {
    BRIEF_WORDS: { min: 300, max: 500 },
    STANDARD_WORDS: { min: 800, max: 1200 },
    DEEP_DIVE_WORDS: { min: 1200, max: 1800 },
    /** Minimum time (ms) between consecutive narration triggers (2 minutes) */
    COOLDOWN_MS: 120_000,
  },

  /**
   * API-related configuration.
   */
  API: {
    /** Max requests per second for Gemini API (quota is 15, we use 12 for safety) */
    GEMINI_MAX_QPS: 12,
    /** Max retry attempts on 429 (rate limit) errors */
    GEMINI_MAX_RETRIES: 3,
    /** Default search radius for Places API in city mode (5 km) */
    PLACES_SEARCH_RADIUS_METERS: 5000,
    /** Distance between sample points along a route for POI search (~15 miles) */
    ROUTE_SAMPLE_INTERVAL_METERS: 24000,
  },

  /**
   * GPS tracking configuration.
   */
  GPS: {
    /**
     * When user is within this distance of the next POI, switch to
     * high-accuracy GPS mode for precise triggering (~5 miles).
     */
    HIGH_ACCURACY_THRESHOLD_METERS: 8000,
    /**
     * In power-saving mode, only report location changes larger than
     * this threshold (500 meters). Saves battery on long stretches.
     */
    SIGNIFICANT_CHANGE_METERS: 500,
  },
} as const;

/**
 * Type helper for accessing CONFIG values with full type safety.
 */
export type AppConfig = typeof CONFIG;
