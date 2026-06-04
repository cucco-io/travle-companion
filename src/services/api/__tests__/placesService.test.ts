import {
  mapGoogleTypeToPOICategory,
  fetchNearbyPlaces,
  fetchAllNearbyPlaces,
  transformPlaceToPOI,
  getPhotoUrl,
  fetchNearbyPOIs,
  fetchPOIsAlongRoute,
  curatePOIs,
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
        results: [
          {
            place_id: 'place-1',
            name: 'Colosseum',
            geometry: { location: { lat: 41.8902, lng: 12.4922 } },
            rating: 4.8,
            types: ['tourist_attraction'],
          },
        ],
        status: 'OK',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const results = await fetchNearbyPlaces(41.8902, 12.4922, 1000, ['tourist_attraction']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Colosseum');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('location=41.8902,12.4922&radius=1000&type=tourist_attraction&key=test-api-key')
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
        results: [{ place_id: 'p-1', name: 'POI 1', geometry: { location: { lat: 0, lng: 0 } } }],
        next_page_token: 'token-page-2',
        status: 'OK',
      };
      const mockPage2 = {
        results: [{ place_id: 'p-2', name: 'POI 2', geometry: { location: { lat: 0, lng: 0 } } }],
        status: 'OK',
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
        expect.stringContaining('pagetoken=token-page-2')
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
        types: ['museum', 'tourist_attraction'],
        photos: [{ photo_reference: 'photo-ref-123', height: 400, width: 600 }],
      };

      const poi = transformPlaceToPOI(mockPlace, 150);

      expect(poi.id).toBe('colosseum-1');
      expect(poi.name).toBe('Colosseum');
      expect(poi.category).toBe('museum');
      expect(poi.rating).toBe(4.8);
      expect(poi.trigger_radius_meters).toBe(150);
      expect(poi.image_url).toBe(
        'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-123&key=test-api-key'
      );
    });
  });

  describe('getPhotoUrl', () => {
    it('should build correct photo URL', () => {
      const url = getPhotoUrl('ref-xyz', 500);
      expect(url).toBe('https://maps.googleapis.com/maps/api/place/photo?maxwidth=500&photoreference=ref-xyz&key=test-api-key');
    });
  });

  describe('fetchNearbyPOIs', () => {
    it('should fetch POIs filtered and mapped by categories', async () => {
      const mockResponse = {
        results: [
          {
            place_id: 'museum-id',
            name: 'Louvre',
            geometry: { location: { lat: 48.8606, lng: 2.3376 } },
            rating: 4.7,
            types: ['museum'],
          },
        ],
        status: 'OK',
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
  });

  describe('fetchPOIsAlongRoute', () => {
    it('should fetch and deduplicate POIs along multiple route points', async () => {
      const responsePoint1 = {
        results: [
          {
            place_id: 'poi-dup',
            name: 'Duplicate POI',
            geometry: { location: { lat: 1, lng: 1 } },
            types: ['museum'],
          },
          {
            place_id: 'poi-unique-1',
            name: 'Unique 1',
            geometry: { location: { lat: 1.1, lng: 1.1 } },
            types: ['park'],
          },
        ],
        status: 'OK',
      };

      const responsePoint2 = {
        results: [
          {
            place_id: 'poi-dup',
            name: 'Duplicate POI',
            geometry: { location: { lat: 1, lng: 1 } },
            types: ['museum'],
          },
          {
            place_id: 'poi-unique-2',
            name: 'Unique 2',
            geometry: { location: { lat: 2, lng: 2 } },
            types: ['church'],
          },
        ],
        status: 'OK',
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
});
