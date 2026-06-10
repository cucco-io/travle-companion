import { POI } from '../../types/poi';
import { TripPreferences, TripMode } from '../../types/trip';
import {
  GeminiCurationResponse,
} from '../../types/api';
import { buildNarrationPrompt, getWordCountRange } from '../../utils/promptBuilder';
import { RateLimiter } from '../rateLimiter';
import { CONFIG } from '../../constants/config';

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
  const apiKey = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const model = options?.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: options?.temperature,
      maxOutputTokens: options?.maxOutputTokens,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    (error as any).status = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response or invalid format from Gemini API');
  }

  return text;
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
 * @throws Error on implementation placeholder
 */
export async function curatePOIs(
  candidatePOIs: Array<{ name: string; category: string }>,
  mode: TripMode,
  budget: number
): Promise<GeminiCurationResponse> {
  throw new Error('Not implemented');
}

/**
 * Uses Gemini to generate an engaging narration for a single POI.
 *
 * The narration style adapts based on POI category.
 *
 * @param poi - The POI to generate a narration for
 * @param preferences - User's trip preferences (depth, kid-friendly, language)
 * @returns The generated narration text
 *
 * @throws Error on API failures or JSON parsing errors
 */
export async function generateNarration(
  poi: POI,
  preferences: TripPreferences
): Promise<string> {
  const prompt = buildNarrationPrompt(poi, preferences);
  const responseText = await callGemini(prompt, {
    temperature: 0.7,
  });

  let narrationText = '';
  try {
    const parsed = JSON.parse(responseText);
    if (parsed && typeof parsed.narrationText === 'string') {
      narrationText = parsed.narrationText;
    } else {
      throw new Error('JSON response does not contain "narrationText" string field');
    }
  } catch (err) {
    throw new Error(`Failed to parse Gemini narration response: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate word count target range
  const wordCount = narrationText.trim() === '' ? 0 : narrationText.trim().split(/\s+/).length;
  const range = getWordCountRange(preferences.narration_depth);
  if (wordCount < range.min || wordCount > range.max) {
    console.warn(
      `Narration word count ${wordCount} is outside target range [${range.min}, ${range.max}] for depth "${preferences.narration_depth}"`
    );
  }

  return narrationText;
}

/**
 * Generates narrations for all POIs in a list using rate limiting.
 *
 * @param pois - Array of POIs to generate narrations for
 * @param preferences - User's trip preferences
 * @param onProgress - Optional callback for UI progress updates (completed/total)
 * @param signal - Optional AbortSignal for cancellation support
 * @returns Array of POIs with narration data filled in
 */
export async function generateAllNarrations(
  pois: POI[],
  preferences: TripPreferences,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal
): Promise<POI[]> {
  const limiter = new RateLimiter({
    maxQPS: CONFIG.API.GEMINI_MAX_QPS,
    maxRetries: CONFIG.API.GEMINI_MAX_RETRIES,
  });

  const results = await limiter.processAll(
    pois,
    async (poi) => {
      return await generateNarration(poi, preferences);
    },
    onProgress,
    signal
  );

  return pois.map((poi, index) => {
    const result = results[index];
    if (result && result.success && typeof result.value === 'string') {
      const narrationText = result.value;
      const wordCount = narrationText.trim() === '' ? 0 : narrationText.trim().split(/\s+/).length;
      return {
        ...poi,
        narration_text: narrationText,
        narration_word_count: wordCount,
        estimated_listen_minutes: wordCount / 150,
      };
    } else {
      console.error(
        `Failed to generate narration for POI "${poi.name}":`,
        result?.error || new Error('Unknown error')
      );
      return {
        ...poi,
        narration_text: 'Failed to generate narration',
        narration_word_count: 0,
        estimated_listen_minutes: 0,
      };
    }
  });
}

/**
 * Generates narrations for a batch of POIs using the RateLimiter.
 * Alias for generateAllNarrations, satisfying the existing template structure.
 */
export async function generateNarrationsBatch(
  pois: POI[],
  preferences: TripPreferences,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal
): Promise<POI[]> {
  return generateAllNarrations(pois, preferences, onProgress, signal);
}
