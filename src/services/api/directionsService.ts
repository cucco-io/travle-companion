/**
 * src/services/api/directionsService.ts
 *
 * Google Directions API integration layer.
 * Used in 'route' mode to get the driving polyline between origin and destination.
 * The polyline is then sampled at intervals to search for POIs along the route.
 *
 * Dependencies:
 * - GOOGLE_DIRECTIONS_API_KEY environment variable
 * - src/types/api.ts (DirectionsRequest, DirectionsResponse)
 *
 * API Reference:
 * https://developers.google.com/maps/documentation/directions/get-directions
 */

import {
  DirectionsRequest,
  DirectionsResponse,
  DirectionsRoute,
} from '../../types/api';

/**
 * Fetches driving directions between two points from Google Directions API.
 *
 * @param originLat - Latitude of the starting point
 * @param originLng - Longitude of the starting point
 * @param destLat - Latitude of the destination
 * @param destLng - Longitude of the destination
 * @returns The primary DirectionsRoute (first route from the response)
 *
 * Implementation notes:
 * - Use mode='driving' (default for road trips)
 * - Request alternatives=false to get the primary route only
 * - The key output is `overview_polyline.points` — an encoded polyline string
 *   that we'll decode and sample along for POI discovery
 * - Also extract total distance and duration from legs for trip metadata
 * - Handle error statuses: 'NOT_FOUND', 'ZERO_RESULTS', 'MAX_WAYPOINTS_EXCEEDED'
 *
 * @throws Error if API key is missing or route cannot be found
 *
 * @see https://developers.google.com/maps/documentation/directions/get-directions
 */
export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<DirectionsRoute> {
  // TODO: Implement Google Directions API integration
  // 1. Construct request URL: https://maps.googleapis.com/maps/api/directions/json?...
  // 2. Pass origin, destination as "lat,lng" strings
  // 3. Parse response, check status === 'OK'
  // 4. Return the first route object (routes[0])
  throw new Error('Not implemented');
}

/**
 * Extracts the encoded polyline string from a Directions API response.
 *
 * @param route - A DirectionsRoute object from fetchDirections
 * @returns The encoded polyline string (to be decoded by geo.ts utilities)
 *
 * @example
 * const route = await fetchDirections(41.89, 12.49, 43.77, 11.25);
 * const polyline = extractPolyline(route);
 * // polyline is something like "e~lgFczysO..."
 */
export function extractPolyline(route: DirectionsRoute): string {
  // TODO: Extract overview_polyline.points from the route object
  throw new Error('Not implemented');
}

/**
 * Extracts the total distance and duration from a Directions route.
 *
 * @param route - A DirectionsRoute object
 * @returns Object with total distance (meters) and duration (seconds)
 *
 * Implementation notes:
 * - A route can have multiple legs (if waypoints are specified)
 * - Sum up distance.value and duration.value across all legs
 */
export function extractRouteMetrics(
  route: DirectionsRoute
): { distanceMeters: number; durationSeconds: number } {
  // TODO: Sum distance and duration across all legs
  throw new Error('Not implemented');
}
