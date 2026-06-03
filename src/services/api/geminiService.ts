/**
 * src/services/api/geminiService.ts
 *
 * Google Gemini LLM API integration layer.
 * Used for two critical pipeline steps:
 * 1. POI Curation — selecting & ranking the best POIs from a candidate list
 * 2. Narration Generation — creating rich, engaging narrations for each POI
 *
 * Dependencies:
 * - GEMINI_API_KEY environment variable
 * - src/types/api.ts (GeminiCurationRequest/Response, GeminiNarrationRequest/Response)
 * - src/types/poi.ts (POI)
 * - src/types/trip.ts (TripPreferences)
 * - src/services/rateLimiter.ts (for throttling requests to ≤12 QPS)
 *
 * API Reference:
 * https://ai.google.dev/gemini-api/docs
 */

import { POI } from '../../types/poi';
import { TripPreferences, TripMode } from '../../types/trip';
import {
  GeminiCurationRequest,
  GeminiCurationResponse,
  GeminiNarrationRequest,
  GeminiNarrationResponse,
} from '../../types/api';

/**
 * Sends a prompt to the Gemini API and returns the raw text response.
 *
 * This is the low-level function that handles the HTTP call to Gemini.
 * Higher-level functions (curatePOIs, generateNarration) build prompts
 * and parse responses using this function.
 *
 * @param prompt - The full prompt string to send
 * @param options - Optional generation config
 * @param options.model - Model name (default: 'gemini-2.0-flash')
 * @param options.temperature - Sampling temperature (0.0–1.0)
 * @param options.maxOutputTokens - Max tokens in the response
 * @returns The raw text response from Gemini
 *
 * Implementation notes:
 * - Use the Google AI SDK (@google/generative-ai) or raw REST API
 * - Set responseType to 'application/json' when expecting structured output
 * - Handle 429 (rate limit) errors by throwing — the RateLimiter will retry
 * - Handle 500/503 errors with retry logic
 * - Log prompt token counts for cost tracking
 *
 * @throws Error on API failures, invalid responses, or missing API key
 */
export async function callGemini(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }
): Promise<string> {
  // TODO: Implement Gemini API call
  // 1. Get API key from environment
  // 2. Construct request body with model, prompt, generationConfig
  // 3. POST to https://generativelanguage.googleapis.com/v1beta/models/MODEL:generateContent
  // 4. Parse response.candidates[0].content.parts[0].text
  // 5. Return the text
  throw new Error('Not implemented');
}

/**
 * Uses Gemini to curate and rank a list of candidate POIs.
 *
 * Given a list of raw POIs from the Places API, asks Gemini to:
 * 1. Remove duplicates and low-quality entries
 * 2. Select the best POIs based on trip mode and category diversity
 * 3. Rank them by interestingness and relevance
 * 4. Assign priority scores
 *
 * @param candidatePOIs - Array of POI names and categories from Places API
 * @param mode - Trip mode ('city' or 'route') — affects curation strategy
 * @param budget - Maximum number of POIs to select
 * @returns Curated and ranked POI list with priority scores
 *
 * Implementation notes:
 * - Use promptBuilder.buildCurationPrompt() to construct the prompt
 * - Instruct Gemini to return JSON (structured output)
 * - Parse the JSON response into GeminiCurationResponse
 * - Validate that returned POIs exist in the candidate list
 * - If parsing fails, retry once with a clarified prompt
 *
 * @see src/utils/promptBuilder.ts for prompt construction
 */
export async function curatePOIs(
  candidatePOIs: Array<{ name: string; category: string }>,
  mode: TripMode,
  budget: number
): Promise<GeminiCurationResponse> {
  // TODO: Implement POI curation via Gemini
  // 1. Build prompt with promptBuilder.buildCurationPrompt()
  // 2. Call callGemini with temperature=0.3 (deterministic)
  // 3. Parse JSON response
  // 4. Validate & return
  throw new Error('Not implemented');
}

/**
 * Uses Gemini to generate an engaging narration for a single POI.
 *
 * The narration style adapts based on POI category:
 * - Historical landmarks: narrative storytelling with key dates/figures
 * - Natural sites: ecological facts, geological history, sensory descriptions
 * - Churches/monuments: architectural details, artistic significance
 * - Quirky sites: fun facts, urban legends, unusual history
 *
 * @param poi - The POI to generate a narration for
 * @param preferences - User's trip preferences (depth, kid-friendly, language)
 * @returns The generated narration text and word count
 *
 * Implementation notes:
 * - Use promptBuilder.buildNarrationPrompt() to construct the prompt
 * - Temperature should be ~0.7 (creative but consistent)
 * - Validate word count is within the target range for the chosen depth
 * - If word count is too short/long, retry with adjusted instructions
 * - Narration should be written for audio — conversational tone, no visual references
 * - Kid-friendly mode: simpler vocabulary, age-appropriate content
 *
 * @see src/utils/promptBuilder.ts for prompt construction
 * @see src/constants/config.ts for word count targets
 */
export async function generateNarration(
  poi: POI,
  preferences: TripPreferences
): Promise<GeminiNarrationResponse> {
  // TODO: Implement narration generation via Gemini
  // 1. Build prompt with promptBuilder.buildNarrationPrompt()
  // 2. Call callGemini with temperature=0.7
  // 3. Extract narration text from response
  // 4. Count words and validate against target range
  // 5. Return narration text and word count
  throw new Error('Not implemented');
}

/**
 * Generates narrations for a batch of POIs using the RateLimiter.
 *
 * This is the main entry point for the preparation phase. It queues
 * all narration requests through the RateLimiter to respect the
 * Gemini API's QPS limits.
 *
 * @param pois - Array of POIs to generate narrations for
 * @param preferences - User's trip preferences
 * @param onProgress - Callback for UI progress updates (completed/total)
 * @param signal - AbortSignal for cancellation support
 * @returns Array of POIs with narration_text and narration_word_count filled in
 *
 * Implementation notes:
 * - Use RateLimiter to throttle to ≤12 QPS
 * - Report progress via onProgress callback after each completion
 * - If a single narration fails after retries, mark it as failed but continue
 * - Support cancellation via AbortSignal
 */
export async function generateNarrationsBatch(
  pois: POI[],
  preferences: TripPreferences,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal
): Promise<POI[]> {
  // TODO: Implement batch narration generation
  // 1. Create a RateLimiter instance
  // 2. Queue generateNarration() for each POI
  // 3. Collect results, update POI objects with narration data
  // 4. Report progress after each completion
  // 5. Return updated POI array
  throw new Error('Not implemented');
}
