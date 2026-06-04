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
import { decodePolyline, samplePointsAlongPolyline } from '../../utils/geo';
import { CONFIG } from '../../constants/config';

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
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Directions API key is missing');
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving&alternatives=false&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as DirectionsResponse;
  
  if (data.status !== 'OK') {
    throw new Error(`Directions API error: ${data.status}`);
  }

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Directions API returned OK status but no routes found');
  }

  return data.routes[0];
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
  if (!route.overview_polyline || !route.overview_polyline.points) {
    throw new Error('Invalid route: missing overview polyline points');
  }
  return route.overview_polyline.points;
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
  if (!route.legs || route.legs.length === 0) {
    return { distanceMeters: 0, durationSeconds: 0 };
  }

  let distanceMeters = 0;
  let durationSeconds = 0;

  for (const leg of route.legs) {
    distanceMeters += leg.distance?.value || 0;
    durationSeconds += leg.duration?.value || 0;
  }

  return { distanceMeters, durationSeconds };
}

/**
 * Fetches driving directions and returns the encoded polyline, total distance, and estimated duration.
 *
 * @param origin - Starting point address or coordinates (lat,lng)
 * @param destination - Ending point address or coordinates (lat,lng)
 * @returns Object containing the encoded polyline, total distance in meters, and duration in seconds
 */
export async function fetchRoute(
  origin: string,
  destination: string
): Promise<{
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
}> {
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Directions API key is missing');
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&mode=driving&alternatives=false&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json());

  if (data.status !== 'OK') {
    throw new Error(`Directions API error: ${data.status}`);
  }

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Directions API returned OK status but no routes found');
  }

  const route = data.routes[0];
  const encodedPolyline = extractPolyline(route);
  const { distanceMeters, durationSeconds } = extractRouteMetrics(route);

  return {
    encodedPolyline,
    distanceMeters,
    durationSeconds,
  };
}

/**
 * Decodes the polyline and samples points along it at specified or default intervals.
 *
 * @param encodedPolyline - Google-encoded polyline string
 * @param intervalMeters - Distance between sample points in meters (defaults to config value)
 * @returns Array of {lat, lng} coordinate objects
 */
export function getRouteSearchPoints(
  encodedPolyline: string,
  intervalMeters?: number
): Array<{ lat: number; lng: number }> {
  // Ensure the polyline is valid by attempting to decode it (as per requirements)
  const decoded = decodePolyline(encodedPolyline);
  if (decoded.length === 0) {
    return [];
  }

  const interval = intervalMeters ?? CONFIG.API.ROUTE_SAMPLE_INTERVAL_METERS;
  return samplePointsAlongPolyline(encodedPolyline, interval);
}
