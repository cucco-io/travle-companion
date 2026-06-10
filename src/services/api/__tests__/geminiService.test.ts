import { POI } from '../../../types/poi';
import { TripPreferences } from '../../../types/trip';
import { callGemini, generateAllNarrations, generateNarration } from '../geminiService';

describe('geminiService', () => {
  const originalEnv = process.env;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  const mockPoi: POI = {
    id: 'poi-1',
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

  const mockPreferences: TripPreferences = {
    interests: ['history'],
    narration_depth: 'brief',
    kid_friendly: false,
    language: 'en',
  };

  describe('callGemini', () => {
    it('should successfully make an HTTP request to Gemini API and return text', async () => {
      const mockResponseText = JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: '{"narrationText": "This is a narration"}' }],
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => JSON.parse(mockResponseText),
      });

      const prompt = 'Test prompt';
      const result = await callGemini(prompt, { temperature: 0.7 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=test-key',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: undefined,
              responseMimeType: 'application/json',
            },
          }),
        })
      );
      expect(result).toBe('{"narrationText": "This is a narration"}');
    });

    it('should throw an error if GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      await expect(callGemini('Test')).rejects.toThrow(
        'GEMINI_API_KEY environment variable is not set'
      );
    });

    it('should throw an error if API response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Error detail message',
      });

      await expect(callGemini('Test')).rejects.toThrow(
        'Gemini API error: 400 Bad Request - Error detail message'
      );
    });
  });

  describe('generateNarration', () => {
    it('should build prompt, call Gemini, parse narrationText and return it', async () => {
      const mockResponseText = JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: '{"narrationText": "This is a beautiful description of Colosseum."}' }],
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => JSON.parse(mockResponseText),
      });

      const narration = await generateNarration(mockPoi, mockPreferences);
      expect(narration).toBe('This is a beautiful description of Colosseum.');
    });

    it('should throw an error if narrationText is missing in the JSON response', async () => {
      const mockResponseText = JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: '{"otherKey": "Value"}' }],
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => JSON.parse(mockResponseText),
      });

      await expect(generateNarration(mockPoi, mockPreferences)).rejects.toThrow(
        'JSON response does not contain "narrationText" string field'
      );
    });

    it('should throw an error if the model output is not valid JSON', async () => {
      const mockResponseText = JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'Plain text response' }],
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => JSON.parse(mockResponseText),
      });

      await expect(generateNarration(mockPoi, mockPreferences)).rejects.toThrow(
        'Failed to parse Gemini narration response'
      );
    });
  });

  describe('generateAllNarrations', () => {
    it('should process multiple POIs using the rate limiter and update their narration fields', async () => {
      const pois: POI[] = [
        { ...mockPoi, id: 'poi-1', name: 'POI One' },
        { ...mockPoi, id: 'poi-2', name: 'POI Two' },
        { ...mockPoi, id: 'poi-3', name: 'POI Three' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"narrationText": "Narration one has five words"}' }] } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"narrationText": "Narration two has exactly six words"}' }] } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"narrationText": "Narration three is very short"}' }] } }],
          }),
        });

      const onProgress = jest.fn();
      const promise = generateAllNarrations(pois, mockPreferences, onProgress);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(100);

      const updatedPois = await promise;

      expect(updatedPois.length).toBe(3);
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
      expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);

      expect(updatedPois[0].narration_text).toBe('Narration one has five words');
      expect(updatedPois[0].narration_word_count).toBe(5);
      expect(updatedPois[0].estimated_listen_minutes).toBe(5 / 150);

      expect(updatedPois[1].narration_text).toBe('Narration two has exactly six words');
      expect(updatedPois[1].narration_word_count).toBe(6);
      expect(updatedPois[1].estimated_listen_minutes).toBe(6 / 150);

      expect(updatedPois[2].narration_text).toBe('Narration three is very short');
      expect(updatedPois[2].narration_word_count).toBe(5);
      expect(updatedPois[2].estimated_listen_minutes).toBe(5 / 150);
    });

    it('should continue processing the batch even if a single narration generation fails', async () => {
      const pois: POI[] = [
        { ...mockPoi, id: 'poi-1', name: 'POI One' },
        { ...mockPoi, id: 'poi-2', name: 'POI Two' },
        { ...mockPoi, id: 'poi-3', name: 'POI Three' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"narrationText": "First narration succeeds"}' }] } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'API Failure',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"narrationText": "Third narration succeeds"}' }] } }],
          }),
        });

      const onProgress = jest.fn();
      const promise = generateAllNarrations(pois, mockPreferences, onProgress);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(100);

      const updatedPois = await promise;

      expect(updatedPois.length).toBe(3);
      expect(onProgress).toHaveBeenCalledTimes(3);

      expect(updatedPois[0].narration_text).toBe('First narration succeeds');
      expect(updatedPois[0].narration_word_count).toBe(3);

      expect(updatedPois[1].narration_text).toBe('Failed to generate narration');
      expect(updatedPois[1].narration_word_count).toBe(0);
      expect(updatedPois[1].estimated_listen_minutes).toBe(0);

      expect(updatedPois[2].narration_text).toBe('Third narration succeeds');
      expect(updatedPois[2].narration_word_count).toBe(3);
    });
  });
});
