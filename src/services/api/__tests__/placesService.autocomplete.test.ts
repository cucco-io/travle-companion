import { fetchPlaceSuggestions } from '../placesService';

describe('placesService Autocomplete', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, GOOGLE_PLACES_API_KEY: 'test-api-key' };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should return mapped suggestions for valid input', async () => {
    const mockResponse = {
      suggestions: [
        {
          placePrediction: {
            placeId: 'chij-paris',
            text: { text: 'Paris, France' },
            structuredFormat: {
              mainText: { text: 'Paris' },
              secondaryText: { text: 'France' },
            },
          },
        },
        {
          placePrediction: {
            placeId: 'chij-paris-tx',
            text: { text: 'Paris, TX, USA' },
            structuredFormat: {
              mainText: { text: 'Paris' },
              secondaryText: { text: 'TX, USA' },
            },
          },
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const suggestions = await fetchPlaceSuggestions('Pari');

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toEqual({
      placeId: 'chij-paris',
      description: 'Paris, France',
      mainText: 'Paris',
    });
    expect(suggestions[1]).toEqual({
      placeId: 'chij-paris-tx',
      description: 'Paris, TX, USA',
      mainText: 'Paris',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': 'test-api-key',
          'X-Goog-FieldMask': 'suggestions.placePrediction.text.text,suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
        }),
        body: JSON.stringify({ input: 'Pari' }),
      })
    );
  });

  it('should return empty array directly if input is too short', async () => {
    const suggestions = await fetchPlaceSuggestions('P');
    expect(suggestions).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw error if API key is missing', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await expect(fetchPlaceSuggestions('Paris')).rejects.toThrow('Google Places API key is missing');
  });

  it('should throw error if autocomplete request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'Invalid field mask' } }),
    });

    await expect(fetchPlaceSuggestions('Paris')).rejects.toThrow('Google Places Autocomplete failed: Invalid field mask');
  });
});
