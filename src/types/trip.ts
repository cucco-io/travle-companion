/**
 * src/types/trip.ts
 *
 * Data models for Trips — the primary unit of user activity.
 * A Trip progresses through: preparing → ready → active → completed.
 *
 * Also includes TripPreferences (user taste settings),
 * TripLogEntry (per-POI playback records), and GpsBreadcrumb (route trace).
 */

import { POI } from './poi';

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

/**
 * Trip mode determines POI discovery and trigger behavior:
 * - 'city': User is exploring a single city. POIs are clustered in a radius.
 * - 'route': User is driving a long route (e.g., road trip). POIs are sampled along the polyline.
 */
export type TripMode = 'city' | 'route';

/**
 * Controls the length/detail of generated narrations.
 * - 'brief':     300–500 words  (~2–3 min listen)
 * - 'standard':  800–1200 words (~5–8 min listen)
 * - 'deep_dive': 1200–1800 words (~8–12 min listen)
 */
export type NarrationDepth = 'brief' | 'standard' | 'deep_dive';

/**
 * High-level interest categories the user can select.
 * These influence POI filtering, Gemini curation, and narration style.
 */
export type InterestCategory =
  | 'history'
  | 'nature'
  | 'architecture'
  | 'food_culture'
  | 'quirky';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * User preferences that shape how a trip's content is generated.
 * Set during the "prepare" phase and stored with the Trip.
 */
export interface TripPreferences {
  /** Selected interest categories — at least one required */
  interests: InterestCategory[];

  /** How detailed/long the narrations should be */
  narration_depth: NarrationDepth;

  /** If true, narrations use simpler language and skip mature content */
  kid_friendly: boolean;

  /** BCP 47 language code for narrations (e.g., 'en', 'it', 'fr') */
  language: string;
}

/**
 * Lifecycle status of a trip.
 * - 'preparing': POIs are being fetched, curated, and narrated
 * - 'ready':     All content is pre-generated and cached; trip can start
 * - 'active':    User is currently traveling; GPS tracking is on
 * - 'completed': Trip ended by user or all POIs played
 */
export type TripStatus = 'preparing' | 'ready' | 'active' | 'completed';

/**
 * A complete Trip record, persisted in SQLite.
 */
export interface Trip {
  /** Unique identifier (UUID v4) */
  id: string;

  /** User-facing trip name (e.g., "Weekend in Rome") */
  name: string;

  /** City exploration or long-distance route */
  mode: TripMode;

  /** Current lifecycle status */
  status: TripStatus;

  /** User taste preferences that shaped this trip's content */
  preferences: TripPreferences;

  /**
   * Starting point (only relevant for 'route' mode).
   * Null for city-mode trips where the user is already at the destination.
   */
  origin: {
    name: string;
    lat: number;
    lng: number;
  } | null;

  /** Destination city or endpoint */
  destination: {
    name: string;
    lat: number;
    lng: number;
  };

  /** Ordered list of POIs for this trip */
  pois: POI[];

  /**
   * Google-encoded polyline string from the Directions API.
   * Used for sampling POI search points along the route.
   * Null for city-mode trips.
   */
  route_polyline: string | null;

  /** ISO 8601 timestamp when the trip was created */
  created_at: string;

  /** ISO 8601 timestamp when the user started traveling (status → 'active') */
  started_at: string | null;

  /** ISO 8601 timestamp when the trip was completed */
  completed_at: string | null;

  /** Total size of cached audio + image files in megabytes */
  total_size_mb: number;
}

/**
 * Records a single POI narration event during an active trip.
 * Used for the post-trip review screen and analytics.
 */
export interface TripLogEntry {
  /** ID of the POI that was played/skipped */
  poi_id: string;

  /** ISO 8601 timestamp of when the event occurred */
  played_at: string;

  /** User's GPS coordinates at the time of the event */
  location: {
    lat: number;
    lng: number;
  };

  /** True if the user manually skipped this narration */
  skipped: boolean;
}

/**
 * A single GPS breadcrumb recorded during an active trip.
 * Collected periodically for the post-trip route visualization.
 */
export interface GpsBreadcrumb {
  /** ISO 8601 timestamp */
  timestamp: string;

  /** Latitude */
  lat: number;

  /** Longitude */
  lng: number;
}
