import {
  mapGoogleTypeToPOICategory,
  fetchNearbyPlaces,
  fetchAllNearbyPlaces,
  transformPlaceToPOI,
  getPhotoUrl,
  fetchNearbyPOIs,
  fetchPOIsAlongRoute,
  curatePOIs,
  geocodeAddress,
} from '../placesService';
import { callGemini } from '../geminiService';
import { RateLimiter } from '../../rateLimiter';
import { POI } from '../../../types/poi';

jest.mock('../geminiService', () => ({
  callGemini: jest.fn(),
}));

describe('placesService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, GOOGLE_PLACES_API_KEY: 'test-api-key' };
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('mapGoogleTypeToPOICategory', () => {
    it('should map specific types with priority', () => {
      expect(mapGoogleTypeToPOICategory(['museum', 'point_of_interest'])).toBe('museum');
      expect(mapGoogleTypeToPOICategory(['church', 'tourist_attraction'])).toBe('church');
      expect(mapGoogleTypeToPOICategory(['park', 'point_of_interest'])).toBe('park');
      expect(mapGoogleTypeToPOICategory(['national_park'])).toBe('natural_landmark');
      expect(mapGoogleTypeToPOICategory(['tourist_attraction'])).toBe('historical_landmark');
      expect(mapGoogleTypeToPOICategory(['invalid_type'])).toBe('other');
      expect(mapGoogleTypeToPOICategory([])).toBe('other');
    });
  });

  describe('fetchNearbyPlaces', () => {
    it('should query nearby places from Google API', async () => {
      const mockResult = {
        places: [
          {
            id: 'place-1',
            displayName: { text: 'Colosseum' },
            location: { latitude: 41.8902, longitude: 12.4922 },
            rating: 4.8,
            primaryType: 'tourist_attraction',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const results = await fetchNearbyPlaces(41.8902, 12.4922, 1000, ['tourist_attraction']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Colosseum');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchNearby',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
            'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.location,places.rating,places.userRatingCount,places.editorialSummary,places.photos',
          }),
          body: expect.stringContaining('"includedTypes":["tourist_attraction"]'),
        })
      );
    });

    it('should throw error if API key is missing', async () => {
      delete process.env.GOOGLE_PLACES_API_KEY;
      await expect(fetchNearbyPlaces(0, 0, 1000, [])).rejects.toThrow('Google Places API key is missing');
    });

    it('should throw error if API fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      });
      await expect(fetchNearbyPlaces(0, 0, 1000, [])).rejects.toThrow('Google Places API request failed');
    });
  });

  describe('fetchAllNearbyPlaces (Pagination)', () => {
    it('should follow next_page_token up to maxResults', async () => {
      const mockPage1 = {
        places: [{ id: 'p-1', displayName: { text: 'POI 1' }, location: { latitude: 0, longitude: 0 } }],
        nextPageToken: 'token-page-2',
      };
      const mockPage2 = {
        places: [{ id: 'p-2', displayName: { text: 'POI 2' }, location: { latitude: 0, longitude: 0 } }],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockPage1 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockPage2 });

      const promise = fetchAllNearbyPlaces(0, 0, 1000, [], 60);

      // Trigger first request
      await jest.advanceTimersByTimeAsync(0);

      // Pagination requires 2s delay. Advance timers to trigger next request.
      await jest.advanceTimersByTimeAsync(2000);

      const results = await promise;
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('POI 1');
      expect(results[1].name).toBe('POI 2');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        'https://places.googleapis.com/v1/places:searchNearby',
        expect.objectContaining({
          body: expect.stringContaining('"pageToken":"token-page-2"')
        })
      );
    });
  });

  describe('transformPlaceToPOI', () => {
    it('should construct a valid POI object', () => {
      const mockPlace = {
        place_id: 'colosseum-1',
        name: 'Colosseum',
        geometry: { location: { lat: 41.8902, lng: 12.4922 } },
        rating: 4.8,
        user_ratings_total: 1500,
        types: ['museum', 'tourist_attraction'],
        photos: [{ photo_reference: 'places/colosseum-1/photos/photo-ref-123', height: 400, width: 600 }],
        vicinity: 'An iconic ancient Roman amphitheater',
      };

      const poi = transformPlaceToPOI(mockPlace, 150);

      expect(poi.id).toBe('colosseum-1');
      expect(poi.name).toBe('Colosseum');
      expect(poi.category).toBe('museum');
      expect(poi.rating).toBe(4.8);
      expect(poi.trigger_radius_meters).toBe(150);
      expect(poi.description).toBe('An iconic ancient Roman amphitheater');
      expect(poi.user_ratings_total).toBe(1500);
      expect(poi.image_url).toBe(
        'https://places.googleapis.com/v1/places/colosseum-1/photos/photo-ref-123/media?key=test-api-key&maxWidthPx=800'
      );
    });
  });

  describe('getPhotoUrl', () => {
    it('should build correct photo URL', () => {
      const url = getPhotoUrl('places/colosseum-1/photos/ref-xyz', 500);
      expect(url).toBe('https://places.googleapis.com/v1/places/colosseum-1/photos/ref-xyz/media?key=test-api-key&maxWidthPx=500');
    });
  });

  describe('fetchNearbyPOIs', () => {
    it('should fetch POIs filtered and mapped by categories', async () => {
      const mockResponse = {
        places: [
          {
            id: 'museum-id',
            displayName: { text: 'Louvre' },
            location: { latitude: 48.8606, longitude: 2.3376 },
            rating: 4.7,
            primaryType: 'museum',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const pois = await fetchNearbyPOIs(48.8606, 2.3376, 500, ['history']);

      expect(pois).toHaveLength(1);
      expect(pois[0].name).toBe('Louvre');
      expect(pois[0].category).toBe('museum');
    });

    it('should sort results by user_ratings_total descending', async () => {
      const mockResponse = {
        places: [
          {
            id: 'poi-low',
            displayName: { text: 'Low Popularity POI' },
            location: { latitude: 48.8606, longitude: 2.3376 },
            userRatingCount: 10,
            primaryType: 'museum',
          },
          {
            id: 'poi-high',
            displayName: { text: 'High Popularity POI' },
            location: { latitude: 48.8606, longitude: 2.3376 },
            userRatingCount: 1000,
            primaryType: 'museum',
          },
          {
            id: 'poi-med',
            displayName: { text: 'Medium Popularity POI' },
            location: { latitude: 48.8606, longitude: 2.3376 },
            userRatingCount: 100,
            primaryType: 'museum',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const pois = await fetchNearbyPOIs(48.8606, 2.3376, 500, ['history']);

      expect(pois).toHaveLength(3);
      expect(pois[0].name).toBe('High Popularity POI');
      expect(pois[1].name).toBe('Medium Popularity POI');
      expect(pois[2].name).toBe('Low Popularity POI');
    });

    it('should map nature category to national_park and park (Table A) and not use Table B natural_feature', async () => {
      const mockResponse = { places: [] };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchNearbyPOIs(48.8606, 2.3376, 500, ['nature']);

      // 'nature' maps to ['park', 'natural_landmark'].
      // 'park' maps to 'park'.
      // 'natural_landmark' maps to 'national_park' (was 'natural_feature').
      expect(global.fetch).toHaveBeenCalledTimes(2);

      const calls = (global.fetch as jest.Mock).mock.calls;
      const body1 = JSON.parse(calls[0][1].body);
      const body2 = JSON.parse(calls[1][1].body);

      // Verify that the requested types are 'park' and 'national_park'
      const requestedTypes = [body1.includedTypes?.[0], body2.includedTypes?.[0]];
      expect(requestedTypes).toContain('park');
      expect(requestedTypes).toContain('national_park');
      expect(requestedTypes).not.toContain('natural_feature');
      expect(requestedTypes).not.toContain('point_of_interest');
    });

    it('should map church category to church (Table A) and not use Table B place_of_worship', async () => {
      const mockResponse = { places: [] };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchNearbyPOIs(48.8606, 2.3376, 500, ['church']);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calls = (global.fetch as jest.Mock).mock.calls;
      const body = JSON.parse(calls[0][1].body);
      expect(body.includedTypes?.[0]).toBe('church');
      expect(body.includedTypes?.[0]).not.toBe('place_of_worship');
    });
  });

  describe('fetchPOIsAlongRoute', () => {
    it('should fetch and deduplicate POIs along multiple route points', async () => {
      const responsePoint1 = {
        places: [
          {
            id: 'poi-dup',
            displayName: { text: 'Duplicate POI' },
            location: { latitude: 1, longitude: 1 },
            primaryType: 'museum',
          },
          {
            id: 'poi-unique-1',
            displayName: { text: 'Unique 1' },
            location: { latitude: 1.1, longitude: 1.1 },
            primaryType: 'park',
          },
        ],
      };

      const responsePoint2 = {
        places: [
          {
            id: 'poi-dup',
            displayName: { text: 'Duplicate POI' },
            location: { latitude: 1, longitude: 1 },
            primaryType: 'museum',
          },
          {
            id: 'poi-unique-2',
            displayName: { text: 'Unique 2' },
            location: { latitude: 2, longitude: 2 },
            primaryType: 'place_of_worship',
          },
        ],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => responsePoint1 })
        .mockResolvedValueOnce({ ok: true, json: async () => responsePoint2 });

      const points = [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ];
      const pois = await fetchPOIsAlongRoute(points, ['museum']);

      expect(pois).toHaveLength(3);
      const names = pois.map((p) => p.name);
      expect(names).toContain('Duplicate POI');
      expect(names).toContain('Unique 1');
      expect(names).toContain('Unique 2');
    });
  });

  describe('curatePOIs', () => {
    it('should build prompt, call Gemini, parse selection, re-order and truncate', async () => {
      const rawPOIs: POI[] = [
        {
          id: '1',
          name: 'Colosseum',
          category: 'historical_landmark',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.8,
          narration_text: '',
          narration_word_count: 0,
          estimated_listen_minutes: 0,
          audio_file_path: null,
          trigger_radius_meters: 100,
          priority: 1.0,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
        {
          id: '2',
          name: 'Vatican Museums',
          category: 'museum',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.7,
          narration_text: '',
          narration_word_count: 0,
          estimated_listen_minutes: 0,
          audio_file_path: null,
          trigger_radius_meters: 100,
          priority: 1.0,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
        {
          id: '3',
          name: 'Trevi Fountain',
          category: 'monument',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.6,
          narration_text: '',
          narration_word_count: 0,
          estimated_listen_minutes: 0,
          audio_file_path: null,
          trigger_radius_meters: 100,
          priority: 1.0,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
      ];

      const geminiResponse = JSON.stringify({
        selected: ['Vatican Museums', 'Colosseum'],
      });

      (callGemini as jest.Mock).mockResolvedValueOnce(geminiResponse);

      const curationPromise = curatePOIs(rawPOIs, 'city', 2);
      
      // Resolve RateLimiter delay
      await jest.advanceTimersByTimeAsync(1000);

      const curated = await curationPromise;

      expect(curated).toHaveLength(2);
      expect(curated[0].name).toBe('Vatican Museums');
      expect(curated[1].name).toBe('Colosseum');
      expect(curated[0].priority).toBeGreaterThan(curated[1].priority);
    });

    it('should fallback gracefully if Gemini returns invalid JSON', async () => {
      const rawPOIs: POI[] = [
        {
          id: '1',
          name: 'Colosseum',
          category: 'historical_landmark',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.8,
          narration_text: '',
          narration_word_count: 0,
          estimated_listen_minutes: 0,
          audio_file_path: null,
          trigger_radius_meters: 100,
          priority: 1.0,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
      ];

      (callGemini as jest.Mock).mockResolvedValueOnce('Invalid JSON output');

      const curationPromise = curatePOIs(rawPOIs, 'city', 1);
      await jest.advanceTimersByTimeAsync(1000);

      const curated = await curationPromise;
      expect(curated).toHaveLength(1);
      expect(curated[0].name).toBe('Colosseum');
    });
  });

  describe('geocodeAddress', () => {
    it('should resolve a city name to coordinates', async () => {
      const mockResponse = {
        places: [
          {
            location: {
              latitude: 48.8566,
              longitude: 2.3522,
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const coords = await geocodeAddress('Paris');

      expect(coords).toEqual({ lat: 48.8566, lng: 2.3522 });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchText',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
            'X-Goog-FieldMask': 'places.location',
          }),
          body: expect.stringContaining('"textQuery":"Paris"'),
        })
      );
    });

    it('should throw error if textSearch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid query' } }),
      });

      await expect(geocodeAddress('Paris')).rejects.toThrow('Google Places API textSearch failed: Invalid query');
    });

    it('should throw error if no places found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [] }),
      });

      await expect(geocodeAddress('UnknownCity')).rejects.toThrow('Could not resolve coordinates for address: UnknownCity');
    });
  });
});
