import { POI } from '../../types/poi';
import {
  getPOIBudget,
  filterByCategories,
  rankPOIs,
  interestToPOICategories,
} from '../poiFilter';

const mockPOIs: POI[] = [
  {
    id: '1',
    name: 'Colosseum',
    category: 'historical_landmark',
    coordinates: { lat: 41.8902, lng: 12.4922 },
    rating: 4.8,
    priority: 5, // Score = 24.0
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: 50,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  },
  {
    id: '2',
    name: 'Uffizi Gallery',
    category: 'museum',
    coordinates: { lat: 43.7684, lng: 11.2556 },
    rating: 4.7,
    priority: 4, // Score = 18.8
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: 50,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  },
  {
    id: '3',
    name: 'Siena Cathedral',
    category: 'church',
    coordinates: { lat: 43.3176, lng: 11.3287 },
    rating: 4.8,
    priority: 4, // Score = 19.2
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: 50,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  },
  {
    id: '4',
    name: 'Boboli Gardens',
    category: 'park',
    coordinates: { lat: 43.7624, lng: 11.2501 },
    rating: 4.2,
    priority: 3, // Score = 12.6
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: 50,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  },
  {
    id: '5',
    name: 'Leaning Tower',
    category: 'monument',
    coordinates: { lat: 43.7230, lng: 10.3966 },
    rating: 4.7,
    priority: 5, // Score = 23.5
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: 50,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  },
];

describe('POI Filtering & Budgeting Utilities', () => {
  describe('getPOIBudget', () => {
    it('should return correct budgets for city mode', () => {
      expect(getPOIBudget('small', 'city')).toBe(15);
      expect(getPOIBudget('medium', 'city')).toBe(25);
      expect(getPOIBudget('mega', 'city')).toBe(30);
    });

    it('should return correct budgets for route mode', () => {
      // 300 miles -> 300 / 15 = 20 POIs
      expect(getPOIBudget('small', 'route', 300)).toBe(20);
      
      // Short route: 15 miles -> 1 POI calculated, but minimum 5 POIs is returned
      expect(getPOIBudget('medium', 'route', 15)).toBe(5);
      
      // Zero distance -> minimum 5 POIs
      expect(getPOIBudget('medium', 'route', 0)).toBe(5);
      expect(getPOIBudget('medium', 'route')).toBe(5);

      // Very long route: 1000 miles -> 67 POIs calculated, but maximum 40 POIs is returned
      expect(getPOIBudget('mega', 'route', 1000)).toBe(40);
    });
  });

  describe('interestToPOICategories', () => {
    it('should map InterestCategory to POICategory array correctly', () => {
      expect(interestToPOICategories('history')).toEqual([
        'historical_landmark',
        'monument',
        'cultural_site',
      ]);
      expect(interestToPOICategories('nature')).toEqual(['park', 'natural_landmark']);
      expect(interestToPOICategories('architecture')).toEqual(['church', 'museum', 'monument']);
      expect(interestToPOICategories('food_culture')).toEqual(['cultural_site', 'other']);
      expect(interestToPOICategories('quirky')).toEqual(['quirky']);
    });
  });

  describe('filterByCategories', () => {
    it('should return all POIs if interests is empty', () => {
      const filtered = filterByCategories(mockPOIs, []);
      expect(filtered.length).toBe(mockPOIs.length);
    });

    it('should filter correctly based on interests', () => {
      // 'nature' maps to 'park' and 'natural_landmark'. Only Boboli Gardens (category 'park') matches.
      const natureFiltered = filterByCategories(mockPOIs, ['nature']);
      expect(natureFiltered.length).toBe(1);
      expect(natureFiltered[0].name).toBe('Boboli Gardens');

      // 'architecture' maps to 'church', 'museum', 'monument'.
      // Matches: Uffizi Gallery ('museum'), Siena Cathedral ('church'), Leaning Tower ('monument')
      const archFiltered = filterByCategories(mockPOIs, ['architecture']);
      expect(archFiltered.length).toBe(3);
      const names = archFiltered.map(p => p.name);
      expect(names).toContain('Uffizi Gallery');
      expect(names).toContain('Siena Cathedral');
      expect(names).toContain('Leaning Tower');
    });

    it('should handle multiple interests by returning union of matches', () => {
      // 'nature' (Boboli Gardens) + 'quirky' (none matching) -> Boboli Gardens
      const filtered = filterByCategories(mockPOIs, ['nature', 'quirky']);
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Boboli Gardens');
    });
  });

  describe('rankPOIs', () => {
    it('should sort POIs by rating * priority descending with rating tiebreaker', () => {
      const ranked = rankPOIs(mockPOIs);
      
      // Expected scores:
      // Colosseum: 4.8 * 5 = 24.0
      // Leaning Tower: 4.7 * 5 = 23.5
      // Siena Cathedral: 4.8 * 4 = 19.2
      // Uffizi Gallery: 4.7 * 4 = 18.8
      // Boboli Gardens: 4.2 * 3 = 12.6
      
      expect(ranked.map(p => p.name)).toEqual([
        'Colosseum',
        'Leaning Tower',
        'Siena Cathedral',
        'Uffizi Gallery',
        'Boboli Gardens',
      ]);
    });

    it('should handle score tiebreaker using rating', () => {
      const tiePOIs: POI[] = [
        {
          ...mockPOIs[0],
          id: 't1',
          name: 'A',
          rating: 4.0,
          priority: 3, // Score = 12.0
        },
        {
          ...mockPOIs[0],
          id: 't2',
          name: 'B',
          rating: 4.8,
          priority: 2.5, // Score = 12.0
        },
      ];
      
      const ranked = rankPOIs(tiePOIs);
      // Equal score of 12.0. 'B' rating is 4.8 > 'A' rating is 4.0, so 'B' wins.
      expect(ranked[0].name).toBe('B');
      expect(ranked[1].name).toBe('A');
    });

    it('should truncate ranked list if budget is provided', () => {
      const truncated = rankPOIs(mockPOIs, 3);
      expect(truncated.length).toBe(3);
      expect(truncated.map(p => p.name)).toEqual([
        'Colosseum',
        'Leaning Tower',
        'Siena Cathedral',
      ]);
    });
  });
});
