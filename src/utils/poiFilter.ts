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
 */
export function getPOIBudget(
  citySize: 'small' | 'medium' | 'mega',
  mode: TripMode,
  routeDistanceMiles?: number
): number {
  if (mode === 'city') {
    switch (citySize) {
      case 'small':
        return CONFIG.POI_BUDGET.SMALL;
      case 'medium':
        return CONFIG.POI_BUDGET.MEDIUM;
      case 'mega':
        return CONFIG.POI_BUDGET.MEGA;
      default:
        return CONFIG.POI_BUDGET.MEDIUM;
    }
  } else if (mode === 'route') {
    const miles = routeDistanceMiles ?? 0;
    const calculated = Math.ceil(miles * CONFIG.POI_BUDGET.ROUTE_PER_MILE);
    // Minimum 5 POIs, Maximum 40 POIs
    return Math.max(5, Math.min(40, calculated));
  }
  return 0;
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
  switch (interest) {
    case 'history':
      return ['historical_landmark', 'monument', 'cultural_site'];
    case 'nature':
      return ['park', 'natural_landmark'];
    case 'architecture':
      return ['church', 'museum', 'monument'];
    case 'food_culture':
      return ['cultural_site', 'other'];
    case 'quirky':
      return ['quirky'];
    default:
      return [];
  }
}

/**
 * Filters POIs by the user's selected interest categories.
 *
 * @param pois - Array of POIs to filter
 * @param interests - User's selected interest categories
 * @returns Filtered array of POIs matching at least one interest
 */
export function filterByCategories(
  pois: POI[],
  interests: InterestCategory[]
): POI[] {
  if (!interests || interests.length === 0) {
    return [...pois];
  }

  const allowedCategories = new Set<POICategory>();
  for (const interest of interests) {
    const categories = interestToPOICategories(interest);
    for (const cat of categories) {
      allowedCategories.add(cat);
    }
  }

  return pois.filter(poi => allowedCategories.has(poi.category));
}

/**
 * Ranks POIs by a composite score of rating and priority.
 *
 * @param pois - Array of POIs to rank
 * @param budget - Optional parameter to truncate the ranked list to a maximum size
 * @returns New array of POIs sorted by score (highest first)
 */
export function rankPOIs(pois: POI[], budget?: number): POI[] {
  const scored = pois.map(poi => ({
    poi,
    score: poi.rating * poi.priority
  }));

  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) {
      return b.score - a.score;
    }
    // Tiebreaker: higher rating wins
    return b.poi.rating - a.poi.rating;
  });

  const sortedPois = scored.map(item => item.poi);

  if (budget !== undefined) {
    return sortedPois.slice(0, budget);
  }

  return sortedPois;
}
