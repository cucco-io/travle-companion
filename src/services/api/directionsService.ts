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

import { CONFIG } from '../../constants/config';
import {
  DirectionsResponse,
  DirectionsRoute
} from '../../types/api';
import { decodePolyline, samplePointsAlongPolyline } from '../../utils/geo';

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
function parseWaypoint(input: string): any {
  const parts = input.split(',');
  if (parts.length === 2) {
    const lat = parseFloat(parts[0].trim());
    const lng = parseFloat(parts[1].trim());
    if (!isNaN(lat) && !isNaN(lng)) {
      return {
        location: {
          latLng: {
            latitude: lat,
            longitude: lng,
          },
        },
      };
    }
  }
  return {
    address: input,
  };
}

export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<DirectionsRoute> {
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Directions API key is missing');
  }

  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: originLat,
          longitude: originLng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destLat,
          longitude: destLng,
        },
      },
    },
    travelMode: 'DRIVE',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Directions API returned OK status but no routes found');
  }

  const route = data.routes[0];
  const durationSeconds = parseInt(route.duration?.replace('s', '') || '0', 10) || 0;
  const distanceMeters = route.distanceMeters || 0;
  const distanceText = `${(distanceMeters / 1000).toFixed(1)} km`;
  const durationText = `${Math.round(durationSeconds / 60)} mins`;

  return {
    overview_polyline: {
      points: route.polyline?.encodedPolyline ?? '',
    },
    legs: [
      {
        distance: { text: distanceText, value: distanceMeters },
        duration: { text: durationText, value: durationSeconds },
        start_address: '',
        end_address: '',
      },
    ],
  };
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
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Directions API key is missing');
  }

  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const body = {
    origin: parseWaypoint(origin),
    destination: parseWaypoint(destination),
    travelMode: 'DRIVE',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Directions API returned OK status but no routes found');
  }

  const route = data.routes[0];
  const durationSeconds = parseInt(route.duration?.replace('s', '') || '0', 10) || 0;
  const distanceMeters = route.distanceMeters || 0;

  return {
    encodedPolyline: route.polyline?.encodedPolyline ?? '',
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
