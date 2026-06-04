import {
  initProximityEngine,
  checkProximity,
  findNextPOI,
} from '../proximityEngine';
import { POI } from '../../../types/poi';
import { CONFIG } from '../../../constants/config';

describe('proximityEngine', () => {
  const pois: POI[] = [
    {
      id: 'poi-low-priority',
      name: 'Low Priority POI',
      category: 'historical_landmark',
      coordinates: { lat: 41.8902, lng: 12.4922 }, // Colosseum
      rating: 4.0,
      narration_text: '',
      narration_word_count: 0,
      estimated_listen_minutes: 0,
      audio_file_path: null,
      trigger_radius_meters: 50,
      priority: 1,
      image_url: null,
      image_local_path: null,
      bookmarked: false,
      played_at: null,
    },
    {
      id: 'poi-high-priority',
      name: 'High Priority POI',
      category: 'museum',
      coordinates: { lat: 41.8902, lng: 12.4922 }, // Same location
      rating: 4.5,
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
    },
    {
      id: 'poi-far',
      name: 'Far POI',
      category: 'park',
      coordinates: { lat: 43.0, lng: 13.0 }, // Far away
      rating: 3.5,
      narration_text: '',
      narration_word_count: 0,
      estimated_listen_minutes: 0,
      audio_file_path: null,
      trigger_radius_meters: 50,
      priority: 3,
      image_url: null,
      image_local_path: null,
      bookmarked: false,
      played_at: null,
    },
  ];

  describe('initProximityEngine', () => {
    it('should initialize state correctly and sort POIs by priority DESC', () => {
      const callback = jest.fn();
      const engine = initProximityEngine(pois, 'city', callback);
      const state = engine.getState();

      expect(state.remainingPOIs[0].id).toBe('poi-high-priority');
      expect(state.remainingPOIs[1].id).toBe('poi-far');
      expect(state.remainingPOIs[2].id).toBe('poi-low-priority');
      expect(state.playedPOIIds.size).toBe(0);
      expect(state.lastTriggerTime).toBe(0);
      expect(state.tripMode).toBe('city');
    });

    it('should fire onProximityTrigger and update lastTriggerTime when user is in range of POI', () => {
      const callback = jest.fn();
      const engine = initProximityEngine(pois, 'city', callback);

      // Rome Colosseum coordinates
      engine.updateLocation(41.8902, 12.4922);

      expect(callback).toHaveBeenCalledTimes(1);
      const event = callback.mock.calls[0][0];
      expect(event.poi.id).toBe('poi-high-priority'); // Highest priority triggered first
      expect(event.distanceMeters).toBe(0);
      expect(event.timestamp).toBeDefined();

      const state = engine.getState();
      expect(state.playedPOIIds.has('poi-high-priority')).toBe(true);
      expect(state.lastTriggerTime).toBeGreaterThan(0);
    });

    it('should respect pause/resume/stop control states', () => {
      const callback = jest.fn();
      const engine = initProximityEngine(pois, 'city', callback);

      engine.pause();
      engine.updateLocation(41.8902, 12.4922);
      expect(callback).not.toHaveBeenCalled();

      engine.resume();
      engine.updateLocation(41.8902, 12.4922);
      expect(callback).toHaveBeenCalledTimes(1);

      engine.stop();
      engine.updateLocation(41.8902, 12.4922);
      expect(callback).toHaveBeenCalledTimes(1); // No new trigger
    });
  });

  describe('checkProximity', () => {
    it('should return null if user is too far from all POIs', () => {
      const engine = initProximityEngine(pois, 'city', jest.fn());
      const state = engine.getState();

      // Location far from Rome (Milan)
      const event = checkProximity(45.4642, 9.1900, state);
      expect(event).toBeNull();
    });

    it('should respect cooldown and return null even if user is close to POI', () => {
      const engine = initProximityEngine(pois, 'city', jest.fn());
      const state = engine.getState();
      state.lastTriggerTime = Date.now() - 50000; // 50 seconds ago (cooldown is 120s)

      const event = checkProximity(41.8902, 12.4922, state);
      expect(event).toBeNull();
    });

    it('should trigger low priority POI if high priority is already in playedPOIIds', () => {
      const engine = initProximityEngine(pois, 'city', jest.fn());
      const state = engine.getState();
      state.playedPOIIds.add('poi-high-priority');

      const event = checkProximity(41.8902, 12.4922, state);
      expect(event).not.toBeNull();
      expect(event?.poi.id).toBe('poi-low-priority');
    });
  });

  describe('findNextPOI', () => {
    it('should return the closest unplayed POI and its distance', () => {
      const engine = initProximityEngine(pois, 'city', jest.fn());
      const state = engine.getState();

      // Rome coordinates
      const res = findNextPOI(41.8902, 12.4922, state);
      expect(res).not.toBeNull();
      expect(res?.poi.id).toBe('poi-high-priority');
      expect(res?.distanceMeters).toBe(0);

      // Milan coordinates: closest should be poi-far (at 43.0, 13.0)
      const res2 = findNextPOI(45.0, 9.0, state);
      expect(res2?.poi.id).toBe('poi-far');
    });

    it('should return null if all POIs have been played', () => {
      const engine = initProximityEngine(pois, 'city', jest.fn());
      const state = engine.getState();
      state.playedPOIIds.add('poi-high-priority');
      state.playedPOIIds.add('poi-low-priority');
      state.playedPOIIds.add('poi-far');

      const res = findNextPOI(41.8902, 12.4922, state);
      expect(res).toBeNull();
    });
  });
});
