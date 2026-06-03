/**
 * src/utils/geo.ts
 *
 * Geographic utility functions for distance calculations,
 * bearing computation, and polyline operations.
 *
 * These are pure functions with no external dependencies
 * (aside from basic math). Used throughout the app for
 * proximity checks, route sampling, and map rendering.
 */

/**
 * Converts degrees to radians.
 *
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Converts radians to degrees.
 *
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Calculates the great-circle distance between two coordinates
 * using the Haversine formula.
 *
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lng1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lng2 - Longitude of point 2 (degrees)
 * @returns Distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the initial bearing (forward azimuth) from point 1 to point 2.
 *
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lng1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lng2 - Longitude of point 2 (degrees)
 * @returns Bearing in degrees (0–360, where 0 = North, 90 = East)
 */
export function bearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda1 = toRadians(lng1);
  const lambda2 = toRadians(lng2);
  const deltaLambda = lambda2 - lambda1;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (toDegrees(theta) + 360) % 360;
}

/**
 * Decodes a Google-encoded polyline string into an array of coordinates.
 *
 * @param encoded - The encoded polyline string from the Directions API
 * @returns Array of {lat, lng} coordinate objects
 */
export function decodePolyline(
  encoded: string
): Array<{ lat: number; lng: number }> {
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      if (index >= len) {
        return points;
      }
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      if (index >= len) {
        return points;
      }
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Samples points at regular distance intervals along an encoded polyline.
 *
 * @param encodedPolyline - Google-encoded polyline string
 * @param intervalMeters - Distance between sample points in meters
 * @returns Array of {lat, lng} sample points along the route
 */
export function samplePointsAlongPolyline(
  encodedPolyline: string,
  intervalMeters: number
): Array<{ lat: number; lng: number }> {
  const points = decodePolyline(encodedPolyline);
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const sampled = [];
  sampled.push(points[0]);

  let currentPt = points[0];
  let nextPtIdx = 1;
  let remainingMeters = intervalMeters;

  while (nextPtIdx < points.length) {
    const nextPt = points[nextPtIdx];
    const dist = haversineDistance(
      currentPt.lat,
      currentPt.lng,
      nextPt.lat,
      nextPt.lng
    );

    if (dist === 0) {
      nextPtIdx++;
      continue;
    }

    if (dist < remainingMeters) {
      remainingMeters -= dist;
      currentPt = nextPt;
      nextPtIdx++;
    } else {
      const fraction = remainingMeters / dist;
      const lat = currentPt.lat + fraction * (nextPt.lat - currentPt.lat);
      const lng = currentPt.lng + fraction * (nextPt.lng - currentPt.lng);
      const interpolatedPt = { lat, lng };

      sampled.push(interpolatedPt);
      currentPt = interpolatedPt;
      remainingMeters = intervalMeters;
    }
  }

  const lastPt = points[points.length - 1];
  const lastSampled = sampled[sampled.length - 1];
  const isDuplicate =
    Math.abs(lastSampled.lat - lastPt.lat) < 1e-7 &&
    Math.abs(lastSampled.lng - lastPt.lng) < 1e-7;

  if (!isDuplicate) {
    sampled.push(lastPt);
  }

  return sampled;
}
