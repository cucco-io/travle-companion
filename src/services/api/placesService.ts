/**
 * src/services/api/placesService.ts
 *
 * Google Places API integration layer.
 * Handles fetching nearby POIs from Google Places Nearby Search.
 *
 * Dependencies:
 * - GOOGLE_PLACES_API_KEY environment variable
 * - src/types/poi.ts (POI, POICategory)
 * - src/types/api.ts (PlacesSearchRequest, PlacesSearchResponse)
 *
 * API Reference:
 * https://developers.google.com/maps/documentation/places/web-service/nearby-search
 */

import { POI, POICategory, PlaceSuggestion } from '../../types/poi';
import {
  PlacesSearchRequest,
  PlacesSearchResponse,
  PlacesResult,
} from '../../types/api';
import { interestToPOICategories, rankPOIs } from '../../utils/poiFilter';
import { TripMode } from '../../types/trip';
import { RateLimiter } from '../rateLimiter';
import { callGemini } from './geminiService';
import { buildCurationPrompt } from '../../utils/promptBuilder';

/**
 * Maps Google Places types to our internal POICategory enum.
 */
export function mapGoogleTypeToPOICategory(
  googleTypes: string[]
): POICategory {
  if (!googleTypes || googleTypes.length === 0) {
    return 'other';
  }

  // Define priority order: more specific types first
  const mappings: { type: string; category: POICategory }[] = [
    { type: 'museum', category: 'museum' },
    { type: 'church', category: 'church' },
    { type: 'place_of_worship', category: 'church' },
    { type: 'mosque', category: 'church' },
    { type: 'synagogue', category: 'church' },
    { type: 'hindu_temple', category: 'church' },
    { type: 'national_park', category: 'natural_landmark' },
    { type: 'park', category: 'park' },
    { type: 'amusement_park', category: 'park' },
    { type: 'monument', category: 'monument' },
    { type: 'tourist_attraction', category: 'historical_landmark' },
    { type: 'city_hall', category: 'cultural_site' },
    { type: 'library', category: 'cultural_site' },
    { type: 'art_gallery', category: 'cultural_site' },
    { type: 'cemetery', category: 'historical_landmark' },
    { type: 'castle', category: 'historical_landmark' },
    { type: 'archaeological_site', category: 'historical_landmark' },
    { type: 'aquarium', category: 'natural_landmark' },
    { type: 'zoo', category: 'natural_landmark' },
    { type: 'natural_feature', category: 'natural_landmark' },
    { type: 'point_of_interest', category: 'other' },
  ];

  for (const mapping of mappings) {
    if (googleTypes.includes(mapping.type)) {
      return mapping.category;
    }
  }

  return 'other';
}

/**
 * Helper to map new Places API response to legacy PlacesResult structure.
 */
function mapNewPlaceToPlacesResult(p: any): PlacesResult {
  return {
    place_id: p.id,
    name: p.displayName?.text ?? '',
    geometry: {
      location: {
        lat: p.location?.latitude ?? 0,
        lng: p.location?.longitude ?? 0,
      },
    },
    rating: p.rating,
    user_ratings_total: p.userRatingCount,
    types: p.types || (p.primaryType ? [p.primaryType] : []),
    photos: p.photos?.map((photo: any) => ({
      photo_reference: photo.name,
      width: photo.widthPx ?? 0,
      height: photo.heightPx ?? 0,
    })),
    vicinity: p.editorialSummary?.text,
  };
}

/**
 * Helper to parse and format errors from Places API response.
 */
async function handlePlacesError(response: any, prefix: string): Promise<never> {
  let detail = '';
  try {
    const data = await response.json();
    detail = data.error?.message || JSON.stringify(data);
  } catch (_) {
    detail = response.statusText || 'Unknown error';
  }
  throw new Error(`${prefix}: ${detail}`);
}

/**
 * Resolves a text address/city name into latitude and longitude coordinates.
 * Uses Google Places API (New) Text Search.
 */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key is missing');
  }

  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = {
    textQuery: address,
    maxResultCount: 1,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.location',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handlePlacesError(response, 'Google Places API textSearch failed');
  }

  const data = await response.json();
  const places = data.places || [];
  if (places.length === 0 || !places[0].location) {
    throw new Error(`Could not resolve coordinates for address: ${address}`);
  }

  return {
    lat: places[0].location.latitude,
    lng: places[0].location.longitude,
  };
}

/**
 * Fetches nearby places from Google Places API (single page).
 */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  types: string[]
): Promise<PlacesResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key is missing');
  }

  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  const body: any = {
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        radius: radiusMeters,
      },
    },
  };

  if (types && types.length > 0) {
    body.includedTypes = [types[0]];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.location,places.rating,places.userRatingCount,places.editorialSummary,places.photos',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handlePlacesError(response, 'Google Places API request failed');
  }

  const data = await response.json();
  const places = data.places || [];
  return places.map(mapNewPlaceToPlacesResult);
}

/**
 * Fetches all pages of nearby places results (handles pagination).
 */
export async function fetchAllNearbyPlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  types: string[],
  maxResults?: number
): Promise<PlacesResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key is missing');
  }

  const results: PlacesResult[] = [];
  let nextPageToken: string | undefined = undefined;
  let pageCount = 0;
  const limit = maxResults ?? 60; // default to 60 (3 pages)

  do {
    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    if (nextPageToken) {
      // Respect the 2-second delay for page tokens
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const body: any = {
      maxResultCount: Math.min(20, limit - results.length),
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: radiusMeters,
        },
      },
    };

    if (types && types.length > 0) {
      body.includedTypes = [types[0]];
    }

    if (nextPageToken) {
      body.pageToken = nextPageToken;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.location,places.rating,places.userRatingCount,places.editorialSummary,places.photos',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await handlePlacesError(response, 'Google Places API request failed');
    }

    const data = await response.json();
    const places = data.places || [];
    results.push(...places.map(mapNewPlaceToPlacesResult));

    nextPageToken = data.nextPageToken;
    pageCount++;
  } while (nextPageToken && results.length < limit && pageCount < 3);

  return results.slice(0, limit);
}

/**
 * Transforms a raw PlacesResult into our internal POI shape.
 */
export function transformPlaceToPOI(
  place: PlacesResult,
  triggerRadiusMeters: number
): POI {
  let imageUrl: string | null = null;
  if (place.photos && place.photos.length > 0) {
    const photoRef = place.photos[0].photo_reference;
    imageUrl = getPhotoUrl(photoRef, 800);
  }

  const category = mapGoogleTypeToPOICategory(place.types ?? []);
  const rating = place.rating ?? 0;

  return {
    id: place.place_id,
    name: place.name,
    category,
    coordinates: {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
    },
    rating,
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: triggerRadiusMeters,
    priority: place.rating ?? 1.0,
    image_url: imageUrl,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
    description: place.vicinity ?? null,
    user_ratings_total: place.user_ratings_total ?? 0,
  };
}

/**
 * Builds a Google Places photo URL from a photo reference.
 */
export function getPhotoUrl(
  photoReference: string,
  maxWidth?: number
): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
  const width = maxWidth ?? 400;
  return `https://places.googleapis.com/v1/${photoReference}/media?key=${apiKey}&maxWidthPx=${width}`;
}

/**
 * Helper to map category/interest to Google Places search config
 */
function getGoogleSearchConfig(category: string): { type?: string } {
  switch (category) {
    case 'historical_landmark':
      return { type: 'tourist_attraction' };
    case 'museum':
      return { type: 'museum' };
    case 'church':
      return { type: 'church' };
    case 'park':
      return { type: 'park' };
    case 'natural_landmark':
      return { type: 'national_park' };
    case 'monument':
      return { type: 'tourist_attraction' };
    case 'cultural_site':
      return { type: 'tourist_attraction' };
    case 'quirky':
      return { type: 'tourist_attraction' };
    default:
      return {};
  }
}

/**
 * Fetches nearby POIs and maps them to POI interfaces.
 */
export async function fetchNearbyPOIs(
  lat: number,
  lng: number,
  radiusMeters: number,
  categories: string[]
): Promise<POI[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key is missing');
  }

  // Normalize categories
  const poiCategories: string[] = [];
  for (const cat of categories) {
    const mapped = interestToPOICategories(cat as any);
    if (mapped && mapped.length > 0) {
      poiCategories.push(...mapped);
    } else {
      poiCategories.push(cat);
    }
  }

  // Deduplicate
  const uniquePoiCategories = Array.from(new Set(poiCategories));
  if (uniquePoiCategories.length === 0) {
    uniquePoiCategories.push('other');
  }

  const allPlacesMap = new Map<string, PlacesResult>();

  for (const category of uniquePoiCategories) {
    const searchConfig = getGoogleSearchConfig(category);
    let pageCount = 0;
    let nextPageToken: string | undefined = undefined;

    do {
      const url = 'https://places.googleapis.com/v1/places:searchNearby';
      if (nextPageToken) {
        // Pagination delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const body: any = {
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng,
            },
            radius: radiusMeters,
          },
        },
      };

      if (searchConfig.type) {
        body.includedTypes = [searchConfig.type];
      }

      if (nextPageToken) {
        body.pageToken = nextPageToken;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.location,places.rating,places.userRatingCount,places.editorialSummary,places.photos',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        await handlePlacesError(response, 'Google Places API request failed');
      }

      const data = await response.json();
      const places = data.places || [];
      for (const place of places) {
        const mapped = mapNewPlaceToPlacesResult(place);
        allPlacesMap.set(mapped.place_id, mapped);
      }

      nextPageToken = data.nextPageToken;
      pageCount++;
    } while (nextPageToken && pageCount < 3);
  }

  const sortedPlaces = Array.from(allPlacesMap.values()).sort((a, b) => {
    const totalA = a.user_ratings_total ?? 0;
    const totalB = b.user_ratings_total ?? 0;
    return totalB - totalA;
  });

  const pois: POI[] = [];
  for (const place of sortedPlaces) {
    pois.push(transformPlaceToPOI(place, 100)); // Default trigger radius for nearby POIs
  }

  return pois;
}

/**
 * Fetches and deduplicates POIs along a list of search points.
 */
export async function fetchPOIsAlongRoute(
  searchPoints: { lat: number; lng: number }[],
  categories: string[]
): Promise<POI[]> {
  const allPOIsMap = new Map<string, POI>();
  const radius = 3200; // default for route mode (2 miles)

  for (const point of searchPoints) {
    const pois = await fetchNearbyPOIs(point.lat, point.lng, radius, categories);
    for (const poi of pois) {
      allPOIsMap.set(poi.id, poi);
    }
  }

  return Array.from(allPOIsMap.values());
}

/**
 * Curates a list of raw POIs using Gemini API via the RateLimiter.
 */
export async function curatePOIs(
  rawPOIs: POI[],
  mode: TripMode,
  budget: number,
  destinationName?: string
): Promise<POI[]> {
  if (rawPOIs.length === 0) {
    return [];
  }

  const candidatePOIs = rawPOIs.map((p) => ({
    name: p.name,
    category: p.category,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total ?? 0,
    description: p.description ?? null,
  }));
  const prompt = buildCurationPrompt(candidatePOIs, mode, budget, destinationName);

  const limiter = RateLimiter.getInstance();

  const responseText = await limiter.enqueue(() =>
    callGemini(prompt, { temperature: 0.3 })
  );

  let cleanText = responseText.trim();
  if (cleanText.startsWith('```')) {
    const lines = cleanText.split('\n');
    if (lines[0].startsWith('```')) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith('```')) {
      lines.pop();
    }
    cleanText = lines.join('\n').trim();
  }

  let selectedNames: string[] = [];
  try {
    const parsed = JSON.parse(cleanText) as { selected: string[] };
    selectedNames = parsed.selected || [];
  } catch (error) {
    console.error('Failed to parse Gemini curation JSON output:', cleanText, error);
    selectedNames = rawPOIs.map((p) => p.name);
  }

  const nameToPoiMap = new Map<string, POI>();
  for (const poi of rawPOIs) {
    nameToPoiMap.set(poi.name.toLowerCase(), poi);
  }

  const curatedPOIs: POI[] = [];
  const selectedNameSet = new Set<string>();

  for (let i = 0; i < selectedNames.length; i++) {
    const name = selectedNames[i];
    const poi = nameToPoiMap.get(name.toLowerCase());
    if (poi) {
      poi.priority = selectedNames.length - i;
      curatedPOIs.push(poi);
      selectedNameSet.add(name.toLowerCase());
    }
  }

  // Fallback to avoid empty output
  if (curatedPOIs.length === 0) {
    for (const poi of rawPOIs) {
      poi.priority = 1.0;
      curatedPOIs.push(poi);
    }
  }

  return rankPOIs(curatedPOIs, budget);
}

/**
 * Fetches search suggestions for places/cities from Google Places Autocomplete API (New).
 *
 * @param input - The partial search text query typed by the user
 * @returns Array of parsed place suggestions
 */
export async function fetchPlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key is missing');
  }

  if (!input || input.trim().length < 2) {
    return [];
  }

  const url = 'https://places.googleapis.com/v1/places:autocomplete';
  const body = {
    input,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'suggestions.placePrediction.text.text,suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handlePlacesError(response, 'Google Places Autocomplete failed');
  }

  const data = await response.json();
  const suggestions = data.suggestions || [];
  
  return suggestions
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      description: s.placePrediction.text?.text ?? '',
      mainText: s.placePrediction.structuredFormat?.mainText?.text ?? '',
    }));
}
