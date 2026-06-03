/**
 * src/utils/poiFilter.ts
 *
 * POI budget calculation, category filtering, and ranking utilities.
 * Used during the trip preparation phase to determine how many POIs
 * to include and which ones make the cut.
 *
 * Dependencies:
 * - src/types/poi.ts (POI, POICategory)
 * - src/types/trip.ts (TripMode, InterestCategory)
 * - src/constants/config.ts (POI_BUDGET values)
 */

import { POI, POICategory } from '../types/poi';
import { TripMode, InterestCategory } from '../types/trip';
import { CONFIG } from '../constants/config';

/**
 * Determines the maximum number of POIs for a trip based on city size and mode.
 *
 * @param citySize - Estimated city size category
 * @param mode - Trip mode ('city' or 'route')
 * @param routeDistanceMiles - Total route distance in miles (only for 'route' mode)
 * @returns Maximum number of POIs to include in the trip
 *
 * Implementation notes:
 * - For 'city' mode: return CONFIG.POI_BUDGET based on citySize:
 *   - 'small' → 15 POIs
 *   - 'medium' → 25 POIs
 *   - 'mega' → 30 POIs
 * - For 'route' mode: return Math.ceil(routeDistanceMiles * CONFIG.POI_BUDGET.ROUTE_PER_MILE)
 *   - i.e., 1 POI per 15 miles of driving
 *   - Minimum 5 POIs, even for short routes
 *   - Maximum 40 POIs, even for very long routes
 *
 * @example
 * getPOIBudget('medium', 'city') // → 25
 * getPOIBudget('small', 'route', 300) // → 20 (300 miles / 15 miles per POI)
 */
export function getPOIBudget(
  citySize: 'small' | 'medium' | 'mega',
  mode: TripMode,
  routeDistanceMiles?: number
): number {
  // TODO: Implement budget calculation
  throw new Error('Not implemented');
}

/**
 * Filters POIs by the user's selected interest categories.
 *
 * @param pois - Array of POIs to filter
 * @param interests - User's selected interest categories
 * @returns Filtered array of POIs matching at least one interest
 *
 * Implementation notes:
 * - Map InterestCategory to POICategory:
 *   - 'history' → ['historical_landmark', 'monument', 'cultural_site']
 *   - 'nature' → ['park', 'natural_landmark']
 *   - 'architecture' → ['church', 'museum', 'monument']
 *   - 'food_culture' → ['cultural_site', 'other']
 *   - 'quirky' → ['quirky']
 * - A POI passes if its category matches ANY of the mapped categories
 * - Some categories appear in multiple interests (intentional overlap)
 * - If interests is empty, return all POIs (no filtering)
 */
export function filterByCategories(
  pois: POI[],
  interests: InterestCategory[]
): POI[] {
  // TODO: Implement category filtering
  throw new Error('Not implemented');
}

/**
 * Ranks POIs by a composite score of rating and priority.
 *
 * @param pois - Array of POIs to rank
 * @returns New array of POIs sorted by score (highest first)
 *
 * Implementation notes:
 * - Score formula: rating * priority
 *   - rating: 1.0–5.0 (from Google Places)
 *   - priority: assigned during curation (higher = more interesting)
 * - Tiebreaker: higher rating wins
 * - Return a new sorted array (don't mutate the input)
 * - Consider adding a diversity bonus for underrepresented categories
 */
export function rankPOIs(pois: POI[]): POI[] {
  // TODO: Implement POI ranking
  throw new Error('Not implemented');
}

/**
 * Maps an InterestCategory to its corresponding POICategory values.
 *
 * @param interest - The interest category to map
 * @returns Array of POICategory values that match this interest
 */
export function interestToPOICategories(
  interest: InterestCategory
): POICategory[] {
  // TODO: Implement interest → category mapping
  // Use the mapping documented in filterByCategories above
  throw new Error('Not implemented');
}
