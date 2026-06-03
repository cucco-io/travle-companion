import {
  buildCurationPrompt,
  buildNarrationPrompt,
  getWordCountRange,
  getNarrationStyle,
} from '../promptBuilder';
import { POI, POICategory } from '../../types/poi';
import { TripPreferences, NarrationDepth, TripMode } from '../../types/trip';
import { CONFIG } from '../../constants/config';

describe('promptBuilder', () => {
  const mockPoiBase: POI = {
    id: 'poi-123',
    name: 'Colosseum',
    category: 'historical_landmark',
    coordinates: { lat: 41.8902, lng: 12.4922 },
    rating: 4.7,
    narration_text: '',
    narration_word_count: 0,
    estimated_listen_minutes: 0,
    audio_file_path: null,
    trigger_radius_meters: 50,
    priority: 10,
    image_url: null,
    image_local_path: null,
    bookmarked: false,
    played_at: null,
  };

  const mockPreferencesBase: TripPreferences = {
    interests: ['history'],
    narration_depth: 'standard',
    kid_friendly: false,
    language: 'en',
  };

  describe('buildCurationPrompt', () => {
    const candidatePois = [
      { name: 'Colosseum', category: 'historical_landmark' },
      { name: 'Trevi Fountain', category: 'monument' },
      { name: 'Villa Borghese', category: 'park' },
    ];

    it('should include candidate names and categories', () => {
      const prompt = buildCurationPrompt(candidatePois, 'city', 2);
      expect(prompt).toContain('Colosseum');
      expect(prompt).toContain('historical_landmark');
      expect(prompt).toContain('Trevi Fountain');
      expect(prompt).toContain('monument');
      expect(prompt).toContain('Villa Borghese');
      expect(prompt).toContain('park');
    });

    it('should include the budget', () => {
      const prompt = buildCurationPrompt(candidatePois, 'city', 5);
      expect(prompt).toContain('5');
    });

    it('should contain the exact JSON instruction schema: { selected: string[] }', () => {
      const prompt = buildCurationPrompt(candidatePois, 'city', 2);
      expect(prompt).toContain('{ selected: string[] }');
    });

    it('should adapt to city mode', () => {
      const prompt = buildCurationPrompt(candidatePois, 'city', 2);
      expect(prompt).toContain('city-based trip');
      expect(prompt).toContain('walkable clusters');
    });

    it('should adapt to route mode', () => {
      const prompt = buildCurationPrompt(candidatePois, 'route', 2);
      expect(prompt).toContain('route-based trip');
      expect(prompt).toContain('roadside attractions');
    });
  });

  describe('getWordCountRange', () => {
    it('should return correct ranges for brief, standard, and deep_dive', () => {
      expect(getWordCountRange('brief')).toEqual(CONFIG.NARRATION.BRIEF_WORDS);
      expect(getWordCountRange('standard')).toEqual(CONFIG.NARRATION.STANDARD_WORDS);
      expect(getWordCountRange('deep_dive')).toEqual(CONFIG.NARRATION.DEEP_DIVE_WORDS);
    });

    it('should default to standard range for unknown inputs', () => {
      expect(getWordCountRange('unknown' as NarrationDepth)).toEqual(
        CONFIG.NARRATION.STANDARD_WORDS
      );
    });
  });

  describe('getNarrationStyle', () => {
    const categories: POICategory[] = [
      'historical_landmark',
      'museum',
      'church',
      'park',
      'natural_landmark',
      'monument',
      'cultural_site',
      'quirky',
      'other',
    ];

    it('should return style descriptions for all categories', () => {
      categories.forEach(cat => {
        const style = getNarrationStyle(cat);
        expect(typeof style).toBe('string');
        expect(style.length).toBeGreaterThan(0);
      });
    });

    it('should map historical_landmark and monument to narrative storytelling style', () => {
      const historicalStyle = getNarrationStyle('historical_landmark');
      const monumentStyle = getNarrationStyle('monument');
      expect(historicalStyle).toContain('narrative storytelling');
      expect(monumentStyle).toContain('narrative storytelling');
    });

    it('should map natural_landmark and park to ecological description style', () => {
      const naturalStyle = getNarrationStyle('natural_landmark');
      const parkStyle = getNarrationStyle('park');
      expect(naturalStyle).toContain('ecological');
      expect(parkStyle).toContain('ecological');
    });
  });

  describe('buildNarrationPrompt', () => {
    // Generate all combinations of category, depth, and kid_friendly settings
    const categories: POICategory[] = [
      'historical_landmark',
      'museum',
      'church',
      'park',
      'natural_landmark',
      'monument',
      'cultural_site',
      'quirky',
      'other',
    ];
    const depths: NarrationDepth[] = ['brief', 'standard', 'deep_dive'];
    const kidFriendlyOptions = [true, false];
    const languages = ['en', 'it', 'fr', 'es'];

    categories.forEach(category => {
      depths.forEach(depth => {
        kidFriendlyOptions.forEach(kidFriendly => {
          languages.forEach(language => {
            it(`should construct prompt for ${category} x ${depth} x kid_friendly=${kidFriendly} x language=${language}`, () => {
              const poi: POI = {
                ...mockPoiBase,
                name: `Test ${category}`,
                category,
              };
              const preferences: TripPreferences = {
                ...mockPreferencesBase,
                narration_depth: depth,
                kid_friendly: kidFriendly,
                language,
              };

              const prompt = buildNarrationPrompt(poi, preferences);

              // 1. Verify POI basic information is present
              expect(prompt).toContain(poi.name);
              expect(prompt).toContain(poi.category);

              // 2. Verify adaptation of style based on category
              const expectedStyle = getNarrationStyle(category);
              expect(prompt).toContain(expectedStyle);

              // 3. Verify word count constraints based on depth
              const expectedRange = getWordCountRange(depth);
              expect(prompt).toContain(expectedRange.min.toString());
              expect(prompt).toContain(expectedRange.max.toString());

              // 4. Verify kid-friendly adaptation
              if (kidFriendly) {
                expect(prompt).toContain('children');
                expect(prompt).toContain('did you know');
              } else {
                expect(prompt).toContain('adult');
              }

              // 5. Verify target language instructions
              expect(prompt).toContain(language);
            });
          });
        });
      });
    });
  });
});
