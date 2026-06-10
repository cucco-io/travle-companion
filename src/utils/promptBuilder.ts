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
  pois: Array<{
    name: string;
    category: string;
    rating?: number;
    user_ratings_total?: number;
    description?: string | null;
  }>,
  mode: TripMode,
  budget: number,
  destinationName?: string
): string {
  const candidateList = pois
    .map((p, index) => {
      const ratingStr = p.rating !== undefined ? `, Rating: ${p.rating}` : '';
      const reviewsStr = p.user_ratings_total !== undefined ? `, Reviews: ${p.user_ratings_total}` : '';
      const descStr = p.description ? `, Description: "${p.description}"` : '';
      return `${index + 1}. Name: "${p.name}", Category: "${p.category}"${ratingStr}${reviewsStr}${descStr}`;
    })
    .join('\n');

  const destinationContext = destinationName
    ? `The traveler is visiting: ${destinationName}.\n`
    : '';

  const modeInstruction = mode === 'city'
    ? 'For a city-based trip, prefer iconic landmarks, historical sites, architectural marvels, highly-rated places of interest, and walkable clusters of attractions that are close to each other.'
    : 'For a route-based trip, prefer roadside attractions, scenic stops, and highway-visible landmarks suitable for a road trip.';

  return `You are an expert travel curator. Given the following list of candidate Points of Interest (POIs), select and rank the best ones for a ${mode} trip.

${destinationContext}Instructions:
1. Review the candidate POI list below.
2. Remove duplicates, very low-quality entries, and locations that are not interesting to a tourist.
3. Select up to ${budget} POIs that provide the best travel experience.
4. Filter out ordinary local neighborhood-only places:
   - Carefully evaluate POIs in categories like "park" or "other". If a park is a generic local city/neighborhood park (characterised by a small review count, low rating, or lacking a descriptive/historical summary), you MUST filter it out.
   - Keep iconic, famous, or historically/scenically significant parks (like Central Park in New York or Golden Gate Park in San Francisco), which are characterised by high review counts (e.g. hundreds or thousands of reviews) and rich descriptions.
   - Avoid ordinary playgrounds, community pools, sports complexes, basic strip malls, dog parks, or generic local recreation grounds that have no historical, architectural, cultural, or quirky tourist appeal.
5. Ensure category diversity (avoid selecting too many of the same type of POI; aim for a balanced mix).
6. ${modeInstruction}
7. Rank the selected POIs by their interestingness and tourist relevance. Put the most interesting, iconic, or historically rich POIs first.

Candidates:
${candidateList}

You MUST return your selection in a JSON object matching this exact structure:
{ selected: string[] }

Where 'selected' is an array containing only the exact names of the selected POIs, ordered from highest priority/interestingness to lowest. Do not include any explanation or other text outside of the JSON object.`;
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
  const range = getWordCountRange(preferences.narration_depth);
  const style = getNarrationStyle(poi.category);

  const kidFriendlyInstruction = preferences.kid_friendly
    ? 'Use simple, easy-to-understand vocabulary and a friendly, engaging tone suitable for children. Avoid complex sentences and any violent, frightening, or mature historical details. Format interesting facts as "did you know?" questions to keep kids engaged.'
    : 'Use adult/general vocabulary and an engaging, mature but accessible conversational tone appropriate for general audiences.';

  return `You are a professional travel guide and audio narrator. Generate an engaging, high-quality audio narration for the following Point of Interest (POI).

POI Details:
- Name: ${poi.name}
- Category: ${poi.category}
- Rating: ${poi.rating}

Instructions:
1. Write in a style appropriate for the category: ${style}.
2. Word Count Constraint: The narration MUST be between ${range.min} and ${range.max} words in length. This count is a strict requirement.
3. Audio Consumption: Write specifically for audio listening. Use a conversational, storytelling flow. Do NOT include visual cues, markdown headers, bullet points, parenthetical directions, or references to reading.
4. Hook: Start with a compelling and interesting hook immediately to grab the listener's attention.
5. Tone & Language Complexity: ${kidFriendlyInstruction}
6. Language: Write the entire narration in the target language: ${preferences.language}.
7. Transition: End with a brief, natural transition phrase to prepare the user for continuing their journey (e.g., "As you continue your journey...").

Return your response as a JSON object with a single key "narrationText" containing the generated narration:
{
  "narrationText": "<narration text here>"
}`;
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
  switch (depth) {
    case 'brief':
      return CONFIG.NARRATION.BRIEF_WORDS;
    case 'standard':
      return CONFIG.NARRATION.STANDARD_WORDS;
    case 'deep_dive':
      return CONFIG.NARRATION.DEEP_DIVE_WORDS;
    default:
      return CONFIG.NARRATION.STANDARD_WORDS;
  }
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
  switch (category) {
    case 'historical_landmark':
    case 'monument':
      return 'narrative storytelling with key dates, historical figures, and pivotal events';
    case 'natural_landmark':
    case 'park':
      return 'ecological and geological description with vivid sensory imagery';
    case 'museum':
      return 'collection highlights, founding history, and notable exhibitions';
    case 'church':
      return 'architectural details, artistic masterpieces, and religious significance';
    case 'cultural_site':
      return 'local traditions, cultural significance, and modern-day relevance';
    case 'quirky':
      return 'fun, entertaining tone with surprising facts, urban legends, and did you know moments';
    default:
      return 'general description, interesting history, and local significance';
  }
}
