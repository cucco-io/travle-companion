import * as Location from 'expo-location';
import {
  startTracking,
  switchAccuracyMode,
  determineAccuracyMode,
  createBreadcrumb,
  requestLocationPermissions,
} from '../gpsTracker';
import { addBreadcrumb } from '../../storage/tripStorage';
import { POI } from '../../../types/poi';

jest.mock('expo-location', () => ({
  Accuracy: {
    Low: 1,
    Balanced: 3,
    High: 4,
  },
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

jest.mock('../../storage/tripStorage', () => ({
  addBreadcrumb: jest.fn(),
}));

describe('gpsTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestLocationPermissions', () => {
    it('should return true if both foreground and background permissions are granted', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      const res = await requestLocationPermissions();
      expect(res).toBe(true);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
    });

    it('should return false if foreground permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });
      const res = await requestLocationPermissions();
      expect(res).toBe(false);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should return false if foreground is granted but background is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });
      const res = await requestLocationPermissions();
      expect(res).toBe(false);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
    });
  });

  describe('determineAccuracyMode', () => {
    const mockPOI: POI = {
      id: 'poi1',
      name: 'Colosseum',
      category: 'historical_landmark',
      coordinates: { lat: 41.8902, lng: 12.4922 }, // Rome
      rating: 4.8,
      narration_text: '',
      narration_word_count: 0,
      estimated_listen_minutes: 0,
      audio_file_path: null,
      trigger_radius_meters: 50,
      priority: 5,
      image_url: null,
      image_local_path: null,
      bookmarked: false,
      played_at: null,
    };

    it('should switch to high_accuracy if distance is <= 8km in power_saving mode', () => {
      // Distance is ~7km from Rome (41.8902, 12.4922)
      const mode = determineAccuracyMode(41.85, 12.45, mockPOI, 'power_saving');
      expect(mode).toBe('high_accuracy');
    });

    it('should stay in power_saving if distance is > 8km in power_saving mode', () => {
      // Distance is ~20km from Rome
      const mode = determineAccuracyMode(41.7, 12.3, mockPOI, 'power_saving');
      expect(mode).toBe('power_saving');
    });

    it('should stay in high_accuracy if distance is <= 8.5km (threshold + hysteresis) in high_accuracy mode', () => {
      // Distance is ~8.24km from Rome (41.823, 12.45)
      const mode = determineAccuracyMode(41.823, 12.45, mockPOI, 'high_accuracy');
      expect(mode).toBe('high_accuracy');
    });

    it('should switch to power_saving if distance is > 8.5km in high_accuracy mode', () => {
      // Distance is ~20km from Rome
      const mode = determineAccuracyMode(41.7, 12.3, mockPOI, 'high_accuracy');
      expect(mode).toBe('power_saving');
    });
  });

  describe('createBreadcrumb', () => {
    it('should return a valid GpsBreadcrumb object', () => {
      const breadcrumb = createBreadcrumb(41.8902, 12.4922);
      expect(breadcrumb.lat).toBe(41.8902);
      expect(breadcrumb.lng).toBe(12.4922);
      expect(breadcrumb.timestamp).toBeDefined();
      expect(new Date(breadcrumb.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('startTracking', () => {
    let watchPositionMock: jest.Mock;
    let removeMock: jest.Mock;

    beforeEach(() => {
      removeMock = jest.fn();
      watchPositionMock = Location.watchPositionAsync as jest.Mock;
      watchPositionMock.mockResolvedValue({
        remove: removeMock,
      });
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
      (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    });

    it('should throw error if permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });
      await expect(startTracking(jest.fn())).rejects.toThrow('Location permissions denied');
    });

    it('should call Location.watchPositionAsync with appropriate options and callback', async () => {
      const onUpdate = jest.fn();
      const unsubscribe = await startTracking(onUpdate, 'high_accuracy');

      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
      expect(watchPositionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 10,
        }),
        expect.any(Function)
      );
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task',
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 10,
        })
      );

      // Trigger position watch callback
      const watchCallback = watchPositionMock.mock.calls[0][1];
      watchCallback({
        coords: { latitude: 41.8902, longitude: 12.4922, accuracy: 5 },
        timestamp: 1000000,
      });

      expect(onUpdate).toHaveBeenCalledWith({
        lat: 41.8902,
        lng: 12.4922,
        accuracy: 5,
        timestamp: 1000000,
      });

      // Cleanup
      unsubscribe();
      expect(removeMock).toHaveBeenCalled();
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith('background-location-task');
    });

    it('should write breadcrumb to SQLite on location update when tripId is provided and time interval > 30s', async () => {
      const onUpdate = jest.fn();
      const unsubscribe = await startTracking(onUpdate, 'power_saving', 'trip123');

      const watchCallback = watchPositionMock.mock.calls[0][1];
      
      // First update should trigger immediate save because lastBreadcrumbTime = 0
      jest.spyOn(Date, 'now').mockReturnValue(50000);
      await watchCallback({
        coords: { latitude: 41.8902, longitude: 12.4922, accuracy: 5 },
        timestamp: 50000,
      });

      expect(addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(addBreadcrumb).toHaveBeenCalledWith('trip123', expect.objectContaining({
        lat: 41.8902,
        lng: 12.4922,
      }));

      // Second update within 30s (e.g. at 60s, +10s since last) should not trigger save
      jest.spyOn(Date, 'now').mockReturnValue(60000);
      await watchCallback({
        coords: { latitude: 41.8903, longitude: 12.4923, accuracy: 5 },
        timestamp: 60000,
      });
      expect(addBreadcrumb).toHaveBeenCalledTimes(1);

      // Third update after 30s (+40s since first) should trigger save
      jest.spyOn(Date, 'now').mockReturnValue(95000);
      await watchCallback({
        coords: { latitude: 41.8904, longitude: 12.4924, accuracy: 5 },
        timestamp: 95000,
      });
      expect(addBreadcrumb).toHaveBeenCalledTimes(2);

      unsubscribe();
    });
  });
});
