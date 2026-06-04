import {
  getDefaultVoice,
  splitTextForTTS,
  synthesizeSpeech,
  generateAllAudio,
  downloadPOIImage,
  downloadAllImages,
} from '../ttsService';
import { saveAudioFile, saveImageFile } from '../../storage/fileStorage';
import { POI } from '../../../types/poi';

jest.mock('../../storage/fileStorage', () => ({
  saveAudioFile: jest.fn(),
  saveImageFile: jest.fn(),
  saveBase64File: jest.fn(),
}));

describe('ttsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getDefaultVoice', () => {
    test('returns correct Google voices', () => {
      expect(getDefaultVoice('en-US', 'google')).toBe('en-US-Neural2-F');
      expect(getDefaultVoice('it-IT', 'google')).toBe('it-IT-Neural2-C');
      expect(getDefaultVoice('fr-FR', 'google')).toBe('fr-FR-Neural2-B');
      expect(getDefaultVoice('es-ES', 'google')).toBe('es-ES-Neural2-F');
      expect(getDefaultVoice('de-DE', 'google')).toBe('de-DE-Neural2-F');
      expect(getDefaultVoice('pt-PT', 'google')).toBe('pt-PT-Wavenet-A');
      expect(getDefaultVoice('ja', 'google')).toBe('ja-JA-Wavenet-A');
    });

    test('returns ElevenLabs voice ID from env or default', () => {
      process.env.ELEVENLABS_VOICE_ID = 'custom-voice-id';
      expect(getDefaultVoice('en-US', 'elevenlabs')).toBe('custom-voice-id');

      delete process.env.ELEVENLABS_VOICE_ID;
      expect(getDefaultVoice('en-US', 'elevenlabs')).toBe('21m00Tcm4TlvDq8ikWAM');
    });
  });

  describe('splitTextForTTS', () => {
    test('does not split if text is short', () => {
      const text = 'Hello world.';
      expect(splitTextForTTS(text, 50)).toEqual([text]);
    });

    test('splits at sentence boundaries', () => {
      const text = 'First sentence. Second sentence! Third sentence?';
      const chunks = splitTextForTTS(text, 20);
      expect(chunks).toEqual([
        'First sentence.',
        'Second sentence!',
        'Third sentence?',
      ]);
    });
  });

  describe('synthesizeSpeech', () => {
    test('Google TTS synthesis succeeds and decodes base64 correctly', async () => {
      process.env.TTS_PROVIDER = 'google';
      process.env.GOOGLE_TTS_API_KEY = 'google-api-key';

      const mockBase64 = 'SGVsbG8='; // "Hello" in base64
      const mockJson = jest.fn().mockResolvedValue({ audioContent: mockBase64 });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: mockJson,
      });

      const buffer = await synthesizeSpeech('Hello', 'en-US');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://texttospeech.googleapis.com/v1/text:synthesize?key=google-api-key',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: 'Hello' },
            voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
            audioConfig: { audioEncoding: 'MP3' },
          }),
        })
      );

      const uint8 = new Uint8Array(buffer);
      expect(String.fromCharCode(...uint8)).toBe('Hello');
    });

    test('Google TTS throws error when API key is missing', async () => {
      process.env.TTS_PROVIDER = 'google';
      delete process.env.GOOGLE_TTS_API_KEY;
      delete process.env.TTS_API_KEY;

      await expect(synthesizeSpeech('Hello', 'en-US')).rejects.toThrow(
        'Google Cloud TTS API key is not configured.'
      );
    });

    test('Google TTS throws error when fetch is not OK', async () => {
      process.env.TTS_PROVIDER = 'google';
      process.env.GOOGLE_TTS_API_KEY = 'google-api-key';

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue('Invalid argument'),
      });

      await expect(synthesizeSpeech('Hello', 'en-US')).rejects.toThrow(
        'Google Cloud TTS API error: 400 Bad Request - Invalid argument'
      );
    });

    test('ElevenLabs synthesis succeeds and returns ArrayBuffer directly', async () => {
      process.env.TTS_PROVIDER = 'elevenlabs';
      process.env.ELEVENLABS_API_KEY = 'elevenlabs-key';
      process.env.ELEVENLABS_VOICE_ID = 'elevenlabs-voice';

      const mockBuffer = new Uint8Array([1, 2, 3]).buffer;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      });

      const buffer = await synthesizeSpeech('Hello', 'en-US');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/elevenlabs-voice',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': 'elevenlabs-key',
          },
          body: JSON.stringify({
            text: 'Hello',
            model_id: 'eleven_multilingual_v2',
          }),
        })
      );

      expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]));
    });

    test('ElevenLabs throws error when API key is missing', async () => {
      process.env.TTS_PROVIDER = 'elevenlabs';
      delete process.env.ELEVENLABS_API_KEY;
      delete process.env.TTS_API_KEY;
      process.env.ELEVENLABS_VOICE_ID = 'voice-id';

      await expect(synthesizeSpeech('Hello', 'en-US')).rejects.toThrow(
        'ElevenLabs API key is not configured.'
      );
    });

    test('ElevenLabs throws error when voice ID is missing', async () => {
      process.env.TTS_PROVIDER = 'elevenlabs';
      process.env.ELEVENLABS_API_KEY = 'elevenlabs-key';
      delete process.env.ELEVENLABS_VOICE_ID;

      await expect(synthesizeSpeech('Hello', 'en-US')).rejects.toThrow(
        'ElevenLabs voice ID is not configured (ELEVENLABS_VOICE_ID).'
      );
    });
  });

  describe('generateAllAudio', () => {
    test('synthesizes and saves audio for each POI with narration text', async () => {
      process.env.TTS_PROVIDER = 'google';
      process.env.GOOGLE_TTS_API_KEY = 'key';

      const mockBase64 = 'SGVsbG8=';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ audioContent: mockBase64 }),
      });
      (saveAudioFile as jest.Mock).mockImplementation((tripId, poiId) =>
        Promise.resolve(`file:///mock-documents/trips/${tripId}/audio/${poiId}.mp3`)
      );

      const pois: POI[] = [
        {
          id: 'poi-1',
          name: 'POI 1',
          category: 'museum',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.5,
          narration_text: 'Narration 1',
          narration_word_count: 2,
          estimated_listen_minutes: 0.1,
          audio_file_path: null,
          trigger_radius_meters: 50,
          priority: 1,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
        {
          id: 'poi-2',
          name: 'POI 2',
          category: 'park',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.0,
          narration_text: '', // Empty text should be skipped or completed with no call
          narration_word_count: 0,
          estimated_listen_minutes: 0,
          audio_file_path: null,
          trigger_radius_meters: 50,
          priority: 2,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
        {
          id: 'poi-3',
          name: 'POI 3',
          category: 'natural_landmark',
          coordinates: { lat: 0, lng: 0 },
          rating: 4.8,
          narration_text: 'Narration 3',
          narration_word_count: 2,
          estimated_listen_minutes: 0.1,
          audio_file_path: null,
          trigger_radius_meters: 50,
          priority: 3,
          image_url: null,
          image_local_path: null,
          bookmarked: false,
          played_at: null,
        },
      ];

      const progressSpy = jest.fn();
      const updatedPois = await generateAllAudio(pois, 'trip-123', 'en-US', progressSpy);

      expect(saveAudioFile).toHaveBeenCalledTimes(2);
      expect(saveAudioFile).toHaveBeenCalledWith('trip-123', 'poi-1', expect.any(ArrayBuffer));
      expect(saveAudioFile).toHaveBeenCalledWith('trip-123', 'poi-3', expect.any(ArrayBuffer));

      expect(updatedPois[0].audio_file_path).toBe('file:///mock-documents/trips/trip-123/audio/poi-1.mp3');
      expect(updatedPois[1].audio_file_path).toBeNull();
      expect(updatedPois[2].audio_file_path).toBe('file:///mock-documents/trips/trip-123/audio/poi-3.mp3');

      expect(progressSpy).toHaveBeenCalledTimes(3);
      expect(progressSpy).toHaveBeenNthCalledWith(1, 1, 3);
      expect(progressSpy).toHaveBeenNthCalledWith(2, 2, 3);
      expect(progressSpy).toHaveBeenNthCalledWith(3, 3, 3);
    });
  });

  describe('downloadPOIImage', () => {
    test('returns null if image_url is missing', async () => {
      const poi = { id: 'poi-1', image_url: null } as POI;
      const path = await downloadPOIImage(poi, 'trip-123');
      expect(path).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('downloads and saves image, returning local path', async () => {
      const poi = { id: 'poi-1', image_url: 'http://example.com/image.jpg' } as POI;
      const mockBuffer = new Uint8Array([4, 5, 6]).buffer;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      });
      (saveImageFile as jest.Mock).mockResolvedValue('file:///mock-documents/trips/trip-123/images/poi-1.jpg');

      const path = await downloadPOIImage(poi, 'trip-123');
      expect(global.fetch).toHaveBeenCalledWith('http://example.com/image.jpg');
      expect(saveImageFile).toHaveBeenCalledWith('trip-123', 'poi-1', mockBuffer);
      expect(path).toBe('file:///mock-documents/trips/trip-123/images/poi-1.jpg');
    });

    test('returns null on download failure', async () => {
      const poi = { id: 'poi-1', image_url: 'http://example.com/image.jpg' } as POI;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const path = await downloadPOIImage(poi, 'trip-123');
      expect(path).toBeNull();
      expect(saveImageFile).not.toHaveBeenCalled();
    });
  });

  describe('downloadAllImages', () => {
    test('downloads and updates image paths for all POIs', async () => {
      const pois: POI[] = [
        { id: 'poi-1', image_url: 'http://url1.jpg', image_local_path: null } as POI,
        { id: 'poi-2', image_url: null, image_local_path: null } as POI,
        { id: 'poi-3', image_url: 'http://url3.jpg', image_local_path: null } as POI,
      ];

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url === 'http://url1.jpg') {
          return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer) });
        }
        if (url === 'http://url3.jpg') {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      (saveImageFile as jest.Mock).mockImplementation((tripId, poiId) =>
        Promise.resolve(`file:///mock-documents/trips/${tripId}/images/${poiId}.jpg`)
      );

      const progressSpy = jest.fn();
      const updatedPois = await downloadAllImages(pois, 'trip-123', progressSpy);

      expect(updatedPois[0].image_local_path).toBe('file:///mock-documents/trips/trip-123/images/poi-1.jpg');
      expect(updatedPois[1].image_local_path).toBeNull();
      expect(updatedPois[2].image_local_path).toBeNull(); // Fail to download

      expect(progressSpy).toHaveBeenCalledTimes(3);
      expect(progressSpy).toHaveBeenNthCalledWith(1, 1, 3);
      expect(progressSpy).toHaveBeenNthCalledWith(2, 2, 3);
      expect(progressSpy).toHaveBeenNthCalledWith(3, 3, 3);
    });
  });
});
