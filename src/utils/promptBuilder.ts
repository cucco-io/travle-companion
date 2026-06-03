/**
 * src/utils/promptBuilder.ts
 *
 * Gemini prompt template builders.
 * Constructs structured prompts for the two LLM pipeline stages:
 * 1. POI Curation — selecting and ranking POIs from candidates
 * 2. Narration Generation — creating engaging audio narrations
 *
 * All prompts are designed for JSON output from Gemini.
 * Narration style adapts based on POI category and user preferences.
 *
 * Dependencies:
 * - src/types/poi.ts (POI, POICategory)
 * - src/types/trip.ts (TripMode, TripPreferences, NarrationDepth)
 * - src/constants/config.ts (word count targets)
 */

import { POI, POICategory } from '../types/poi';
import { TripMode, TripPreferences, NarrationDepth } from '../types/trip';
import { CONFIG } from '../constants/config';

/**
 * Builds the Gemini prompt for POI curation (selection and ranking).
 *
 * @param pois - Candidate POIs from the Places API (name + category)
 * @param mode - Trip mode ('city' or 'route')
 * @param budget - Maximum number of POIs to select
 * @returns The complete prompt string for Gemini
 *
 * Implementation notes:
 * The prompt should instruct Gemini to:
 * 1. Review the candidate POI list
 * 2. Remove duplicates and very low-quality entries
 * 3. Select up to `budget` POIs that provide the best travel experience
 * 4. Ensure category diversity (don't pick 10 churches and 0 parks)
 * 5. For 'city' mode: prefer walkable clusters, iconic landmarks
 * 6. For 'route' mode: prefer roadside attractions, scenic stops
 * 7. Assign a priority score (1–10) based on interestingness
 * 8. Return JSON format: [{name, category, priority}]
 *
 * Prompt best practices:
 * - Use a system instruction setting Gemini's role as a travel curator
 * - Include the full candidate list in a structured format
 * - Specify the JSON output schema explicitly
 * - Include few-shot examples if needed for reliability
 */
export function buildCurationPrompt(
  pois: Array<{ name: string; category: string }>,
  mode: TripMode,
  budget: number
): string {
  // TODO: Implement curation prompt builder
  // Example structure:
  // ```
  // You are an expert travel curator. Given the following list of points of interest,
  // select the top ${budget} most interesting and diverse POIs for a ${mode} trip.
  //
  // Candidates:
  // ${pois.map(p => `- ${p.name} (${p.category})`).join('\n')}
  //
  // Return your selection as a JSON array...
  // ```
  throw new Error('Not implemented');
}

/**
 * Builds the Gemini prompt for narration generation for a single POI.
 *
 * The narration style adapts based on POI category:
 * - historical_landmark / monument: Narrative storytelling with key dates, figures, events
 * - natural_landmark / park: Ecological facts, geological history, sensory descriptions
 * - museum: Collection highlights, founding history, notable exhibitions
 * - church: Architectural details, artistic masterpieces, religious significance
 * - cultural_site: Local traditions, cultural significance, modern-day relevance
 * - quirky: Fun facts, urban legends, unusual history, "did you know" moments
 *
 * @param poi - The POI to generate a narration for
 * @param preferences - User's trip preferences (depth, kid-friendly, language)
 * @returns The complete prompt string for Gemini
 *
 * Implementation notes:
 * The prompt should instruct Gemini to:
 * 1. Write an engaging narration about the POI
 * 2. Use a style appropriate for the POI's category (see mapping above)
 * 3. Target the word count range for the selected narration depth:
 *    - 'brief': 300–500 words
 *    - 'standard': 800–1200 words
 *    - 'deep_dive': 1200–1800 words
 * 4. Write for audio consumption (conversational tone, no visual references)
 * 5. If kid_friendly: use simpler language, skip violent/mature content
 * 6. Use the specified language
 * 7. Include a compelling hook at the beginning
 * 8. End with a brief transition phrase (e.g., "As you continue your journey...")
 *
 * @see CONFIG.NARRATION for word count targets
 */
export function buildNarrationPrompt(
  poi: POI,
  preferences: TripPreferences
): string {
  // TODO: Implement narration prompt builder
  // 1. Determine word count range from preferences.narration_depth
  // 2. Determine narration style from poi.category
  // 3. Construct the prompt with all instructions
  throw new Error('Not implemented');
}

/**
 * Returns the word count range for a given narration depth.
 *
 * @param depth - The narration depth preference
 * @returns Object with min and max word counts
 */
export function getWordCountRange(
  depth: NarrationDepth
): { min: number; max: number } {
  // TODO: Implement using CONFIG.NARRATION values
  // switch (depth) {
  //   case 'brief': return CONFIG.NARRATION.BRIEF_WORDS;
  //   case 'standard': return CONFIG.NARRATION.STANDARD_WORDS;
  //   case 'deep_dive': return CONFIG.NARRATION.DEEP_DIVE_WORDS;
  // }
  throw new Error('Not implemented');
}

/**
 * Returns a narration style description based on the POI category.
 *
 * Used internally by buildNarrationPrompt to customize the prompt.
 *
 * @param category - The POI's category
 * @returns A description of the narration style to use
 */
export function getNarrationStyle(category: POICategory): string {
  // TODO: Implement style mapping
  // Map each category to a style description, e.g.:
  // 'historical_landmark' → 'narrative storytelling with key dates, historical figures, and pivotal events'
  // 'natural_landmark' → 'ecological and geological description with vivid sensory imagery'
  // 'quirky' → 'fun, entertaining tone with surprising facts and urban legends'
  throw new Error('Not implemented');
}
