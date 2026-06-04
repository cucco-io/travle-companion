import {
  fetchDirections,
  extractPolyline,
  extractRouteMetrics,
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
});
