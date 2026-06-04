import {
  fetchDirections,
  extractPolyline,
  extractRouteMetrics,
  fetchRoute,
  getRouteSearchPoints,
} from '../directionsService';
import { DirectionsRoute } from '../../../types/api';

describe('directionsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.GOOGLE_DIRECTIONS_API_KEY = 'mocked-api-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('fetchDirections', () => {
    const mockRoute: DirectionsRoute = {
      overview_polyline: { points: 'abc123polyline' },
      legs: [
        {
          distance: { text: '10 km', value: 10000 },
          duration: { text: '15 mins', value: 900 },
          start_address: 'Start Address',
          end_address: 'End Address',
        },
      ],
    };

    test('should fetch directions successfully and return first route', async () => {
      const mockResponse = {
        status: 'OK',
        routes: [mockRoute],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const route = await fetchDirections(41.89, 12.49, 43.77, 11.25);

      expect(route).toEqual(mockRoute);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://maps.googleapis.com/maps/api/directions/json?origin=41.89,12.49&destination=43.77,11.25&mode=driving&alternatives=false&key=mocked-api-key'
      );
    });

    test('should throw error when API key is missing', async () => {
      delete process.env.GOOGLE_DIRECTIONS_API_KEY;

      await expect(fetchDirections(41.89, 12.49, 43.77, 11.25)).rejects.toThrow(
        'Google Directions API key is missing'
      );
    });

    test('should throw HTTP error when response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchDirections(41.89, 12.49, 43.77, 11.25)).rejects.toThrow(
        'HTTP error! status: 500'
      );
    });

    test('should throw error on API error response (e.g., ZERO_RESULTS)', async () => {
      const mockResponse = {
        status: 'ZERO_RESULTS',
        routes: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchDirections(41.89, 12.49, 43.77, 11.25)).rejects.toThrow(
        'Directions API error: ZERO_RESULTS'
      );
    });

    test('should throw error on API error response (e.g., NOT_FOUND)', async () => {
      const mockResponse = {
        status: 'NOT_FOUND',
        routes: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchDirections(41.89, 12.49, 43.77, 11.25)).rejects.toThrow(
        'Directions API error: NOT_FOUND'
      );
    });

    test('should throw error if status is OK but routes array is empty', async () => {
      const mockResponse = {
        status: 'OK',
        routes: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchDirections(41.89, 12.49, 43.77, 11.25)).rejects.toThrow(
        'Directions API returned OK status but no routes found'
      );
    });
  });

  describe('extractPolyline', () => {
    test('should extract points correctly', () => {
      const route: DirectionsRoute = {
        overview_polyline: { points: 'test_points' },
        legs: [],
      };
      expect(extractPolyline(route)).toBe('test_points');
    });

    test('should throw error if overview_polyline or points is missing', () => {
      const route1 = { legs: [] } as any as DirectionsRoute;
      const route2 = { overview_polyline: {}, legs: [] } as any as DirectionsRoute;

      expect(() => extractPolyline(route1)).toThrow('Invalid route: missing overview polyline points');
      expect(() => extractPolyline(route2)).toThrow('Invalid route: missing overview polyline points');
    });
  });

  describe('extractRouteMetrics', () => {
    test('should sum up distances and durations for single leg route', () => {
      const route: DirectionsRoute = {
        overview_polyline: { points: '...' },
        legs: [
          {
            distance: { text: '5 km', value: 5000 },
            duration: { text: '10 mins', value: 600 },
            start_address: '',
            end_address: '',
          },
        ],
      };

      const metrics = extractRouteMetrics(route);
      expect(metrics).toEqual({ distanceMeters: 5000, durationSeconds: 600 });
    });

    test('should sum up distances and durations across multiple legs', () => {
      const route: DirectionsRoute = {
        overview_polyline: { points: '...' },
        legs: [
          {
            distance: { text: '5 km', value: 5000 },
            duration: { text: '10 mins', value: 600 },
            start_address: '',
            end_address: '',
          },
          {
            distance: { text: '12 km', value: 12000 },
            duration: { text: '15 mins', value: 900 },
            start_address: '',
            end_address: '',
          },
        ],
      };

      const metrics = extractRouteMetrics(route);
      expect(metrics).toEqual({ distanceMeters: 17000, durationSeconds: 1500 });
    });

    test('should handle missing legs or missing leg values gracefully', () => {
      const routeWithEmptyLegs: DirectionsRoute = {
        overview_polyline: { points: '...' },
        legs: [],
      };

      const metrics1 = extractRouteMetrics(routeWithEmptyLegs);
      expect(metrics1).toEqual({ distanceMeters: 0, durationSeconds: 0 });

      const routeWithMalformedLegs = {
        overview_polyline: { points: '...' },
        legs: [
          {
            start_address: '',
            end_address: '',
          },
        ],
      } as any as DirectionsRoute;

      const metrics2 = extractRouteMetrics(routeWithMalformedLegs);
      expect(metrics2).toEqual({ distanceMeters: 0, durationSeconds: 0 });
    });
  });

  describe('fetchRoute', () => {
    const mockRoute: DirectionsRoute = {
      overview_polyline: { points: 'abc123polyline' },
      legs: [
        {
          distance: { text: '10 km', value: 10000 },
          duration: { text: '15 mins', value: 900 },
          start_address: 'Start Address',
          end_address: 'End Address',
        },
      ],
    };

    test('should fetch route successfully and return summarized metrics', async () => {
      const mockResponse = {
        status: 'OK',
        routes: [mockRoute],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchRoute('Rome', 'Florence');

      expect(result).toEqual({
        encodedPolyline: 'abc123polyline',
        distanceMeters: 10000,
        durationSeconds: 900,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://maps.googleapis.com/maps/api/directions/json?origin=Rome&destination=Florence&mode=driving&alternatives=false&key=mocked-api-key'
      );
    });

    test('should throw error when API key is missing', async () => {
      delete process.env.GOOGLE_DIRECTIONS_API_KEY;

      await expect(fetchRoute('Rome', 'Florence')).rejects.toThrow(
        'Google Directions API key is missing'
      );
    });

    test('should throw HTTP error when response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchRoute('Rome', 'Florence')).rejects.toThrow(
        'HTTP error! status: 500'
      );
    });

    test('should throw error on API error response (e.g., ZERO_RESULTS)', async () => {
      const mockResponse = {
        status: 'ZERO_RESULTS',
        routes: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchRoute('Rome', 'Florence')).rejects.toThrow(
        'Directions API error: ZERO_RESULTS'
      );
    });

    test('should throw error if status is OK but routes array is empty', async () => {
      const mockResponse = {
        status: 'OK',
        routes: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchRoute('Rome', 'Florence')).rejects.toThrow(
        'Directions API returned OK status but no routes found'
      );
    });
  });

  describe('getRouteSearchPoints', () => {
    // Encoded polyline for two points (38.5, -120.2) and (40.7, -120.95)
    // Distance between them is roughly 250km (250000 meters)
    const encodedPolyline = '_p~iF~ps|U_ulLnnqC';

    test('should decode and sample points along route using default interval', () => {
      const points = getRouteSearchPoints(encodedPolyline);
      // Default interval is 24000 (24km). With 250km distance, we expect multiple sampled points
      expect(points.length).toBeGreaterThan(2);
      expect(points[0].lat).toBeCloseTo(38.5, 4);
      expect(points[0].lng).toBeCloseTo(-120.2, 4);
    });

    test('should decode and sample points along route using custom interval', () => {
      const points = getRouteSearchPoints(encodedPolyline, 500000);
      // Interval is 500km, which is greater than total distance (~250km), so it returns start and end points
      expect(points.length).toBe(2);
      expect(points[0].lat).toBeCloseTo(38.5, 4);
      expect(points[1].lat).toBeCloseTo(40.7, 4);
    });

    test('should return empty array for empty polyline', () => {
      const points = getRouteSearchPoints('');
      expect(points).toEqual([]);
    });
  });

  const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true' && 
                         process.env.GOOGLE_DIRECTIONS_API_KEY && 
                         process.env.GOOGLE_DIRECTIONS_API_KEY !== 'mocked-api-key';
  const describeIntegration = runIntegration ? describe : describe.skip;

  describeIntegration('fetchRoute Integration (Real API Call)', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = originalFetch;
    });

    test('should fetch actual directions from Google API', async () => {
      const origin = 'Rome, Italy';
      const destination = 'Florence, Italy';

      const result = await fetchRoute(origin, destination);

      expect(result).toHaveProperty('encodedPolyline');
      expect(typeof result.encodedPolyline).toBe('string');
      expect(result.encodedPolyline.length).toBeGreaterThan(0);

      expect(result).toHaveProperty('distanceMeters');
      expect(result.distanceMeters).toBeGreaterThan(100000);

      expect(result).toHaveProperty('durationSeconds');
      expect(result.durationSeconds).toBeGreaterThan(3600);
    });
  });
});
