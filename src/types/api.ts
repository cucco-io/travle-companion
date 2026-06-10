/**
 * src/types/api.ts
 *
 * Request and response type definitions for all external API integrations.
 * These types act as a contract between our service layer and the raw APIs.
 *
 * TODO for implementer:
 * - Fill in the exact fields based on the API documentation linked in each section.
 * - Consider adding Zod schemas for runtime validation of API responses.
 */

// ---------------------------------------------------------------------------
// Google Places API
// See: https://developers.google.com/maps/documentation/places/web-service/nearby-search
// ---------------------------------------------------------------------------

/**
 * Request parameters for a Google Places Nearby Search.
 *
 * TODO: Add fields for:
 * - location (lat/lng string, e.g., "41.8902,12.4922")
 * - radius (number, in meters — max 50000)
 * - type (string, e.g., 'tourist_attraction')
 * - keyword (optional, free-text search term)
 * - pagetoken (optional, for pagination)
 * - language (optional, BCP 47 code)
 */
export interface PlacesSearchRequest {
  // TODO: Define request fields per Google Places API docs
  location: string;
  radius: number;
  type?: string;
  keyword?: string;
  pagetoken?: string;
  language?: string;
}

/**
 * Response from a Google Places Nearby Search.
 *
 * TODO: Add fields for:
 * - results: array of place objects, each containing:
 *   - place_id (string)
 *   - name (string)
 *   - geometry.location (lat/lng)
 *   - rating (number)
 *   - user_ratings_total (number)
 *   - types (string[])
 *   - photos (array with photo_reference)
 *   - vicinity (string)
 * - next_page_token (string | undefined)
 * - status (string — 'OK', 'ZERO_RESULTS', etc.)
 */
export interface PlacesSearchResponse {
  // TODO: Define response fields per Google Places API docs
  results: PlacesResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

/**
 * A single result from the Places Nearby Search response.
 *
 * TODO: Flesh out with all fields your service layer needs.
 */
export interface PlacesResult {
  place_id: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  vicinity?: string;
}

// ---------------------------------------------------------------------------
// Google Directions API
// See: https://developers.google.com/maps/documentation/directions/get-directions
// ---------------------------------------------------------------------------

/**
 * Request parameters for a Google Directions API call.
 *
 * TODO: Add fields for:
 * - origin (string — lat/lng or place name)
 * - destination (string — lat/lng or place name)
 * - mode (string — 'driving', 'walking', etc.)
 * - waypoints (optional, string[] of intermediate stops)
 * - alternatives (optional, boolean)
 * - avoid (optional, string — 'tolls', 'highways', etc.)
 */
export interface DirectionsRequest {
  // TODO: Define request fields per Directions API docs
  origin: string;
  destination: string;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  waypoints?: string[];
  alternatives?: boolean;
  avoid?: string;
}

/**
 * Response from the Google Directions API.
 *
 * TODO: Add fields for:
 * - routes: array of route objects, each containing:
 *   - overview_polyline.points (encoded polyline string)
 *   - legs: array of leg objects with distance, duration, steps
 * - status (string — 'OK', 'NOT_FOUND', etc.)
 * - geocoded_waypoints (array)
 */
export interface DirectionsResponse {
  // TODO: Define response fields per Directions API docs
  routes: DirectionsRoute[];
  status: string;
}

/**
 * A single route from the Directions response.
 *
 * TODO: Add legs, warnings, waypoint_order, etc.
 */
export interface DirectionsRoute {
  overview_polyline: {
    points: string;
  };
  legs: Array<{
    distance: { text: string; value: number };
    duration: { text: string; value: number };
    start_address: string;
    end_address: string;
  }>;
}

// ---------------------------------------------------------------------------
// Gemini LLM API (Google AI Studio)
// See: https://ai.google.dev/gemini-api/docs
// ---------------------------------------------------------------------------

/**
 * Request to Gemini for POI curation (selecting/ranking POIs from a candidate list).
 *
 * TODO: Add fields for:
 * - prompt (string — built by promptBuilder.ts)
 * - model (string — e.g., 'gemini-2.0-flash')
 * - temperature (number — 0.3 for curation, lower = more deterministic)
 * - maxOutputTokens (number)
 * - candidatePOIs (serialized POI list embedded in the prompt)
 */
export interface GeminiCurationRequest {
  // TODO: Define based on Gemini API docs and your prompt strategy
  prompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Response from Gemini for POI curation.
 *
 * TODO: Add fields for:
 * - curatedPOIs: ranked list of POI IDs/names selected by Gemini
 * - reasoning: optional explanation string from the model
 * - usage: token usage metadata
 */
export interface GeminiCurationResponse {
  // TODO: Parse the model's JSON output into a structured list
  curatedPOIs: Array<{
    name: string;
    category: string;
    priority: number;
  }>;
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Request to Gemini for generating a narration for a single POI.
 *
 * TODO: Add fields for:
 * - prompt (string — built by promptBuilder.ts with POI details + preferences)
 * - model (string)
 * - temperature (number — 0.7 for narration, more creative)
 * - maxOutputTokens (number)
 */
export interface GeminiNarrationRequest {
  // TODO: Define based on Gemini API docs
  prompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Response from Gemini for narration generation.
 *
 * TODO: Add fields for:
 * - narrationText: the generated narration string
 * - wordCount: number of words in the narration
 * - usage: token usage metadata
 */
export interface GeminiNarrationResponse {
  // TODO: Extract narration text from the model response
  narrationText: string;
  wordCount: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ---------------------------------------------------------------------------
// Cloud Text-to-Speech API
// See: https://cloud.google.com/text-to-speech/docs
// See: https://elevenlabs.io/docs/api-reference (alternative)
// ---------------------------------------------------------------------------

/**
 * Request to a Cloud TTS service (Google Cloud TTS or ElevenLabs).
 *
 * TODO: Add fields for:
 * - text (string — the narration text to synthesize)
 * - voice (string — voice ID or name, e.g., 'en-US-Neural2-D')
 * - languageCode (string — e.g., 'en-US')
 * - speakingRate (number — 0.8–1.2, default 1.0)
 * - audioEncoding (string — 'MP3', 'LINEAR16', etc.)
 * - provider ('google' | 'elevenlabs')
 */
export interface TTSRequest {
  // TODO: Define based on your chosen TTS provider(s)
  text: string;
  voice?: string;
  languageCode: string;
  speakingRate?: number;
  audioEncoding?: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
}

/**
 * Response from a Cloud TTS service.
 *
 * TODO: Add fields for:
 * - audioContent (string — base64-encoded audio data)
 * - audioFormat (string — 'mp3', 'wav', etc.)
 * - durationSeconds (number — length of the audio clip)
 */
export interface TTSResponse {
  // TODO: Define based on your chosen TTS provider(s)
  audioContent: string; // base64-encoded
  audioFormat: string;
  durationSeconds?: number;
}
