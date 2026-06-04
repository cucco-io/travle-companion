/**
 * src/services/api/ttsService.ts
 *
 * Cloud Text-to-Speech API integration layer.
 * Converts narration text into audio files (.mp3) for offline playback.
 * Supports Google Cloud TTS and ElevenLabs as providers.
 *
 * Dependencies:
 * - TTS_API_KEY and TTS_PROVIDER environment variables
 * - src/types/api.ts (TTSRequest, TTSResponse)
 * - expo-file-system (for saving audio files to local storage)
 *
 * API References:
 * - Google Cloud TTS: https://cloud.google.com/text-to-speech/docs
 * - ElevenLabs: https://elevenlabs.io/docs/api-reference
 */

import { POI } from '../../types/poi';
import { saveAudioFile, saveImageFile, saveBase64File } from '../storage/fileStorage';
import { RateLimiter } from '../rateLimiter';

declare const Buffer: any;

/**
 * Helper function to convert ArrayBuffer to Base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper function to convert Base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Returns the default voice ID/name for a given language and provider.
 *
 * @param languageCode - BCP 47 language code (e.g., 'en-US', 'it-IT', 'fr-FR')
 * @param provider - TTS provider ('google' or 'elevenlabs')
 * @returns A voice ID or name string appropriate for the provider
 */
export function getDefaultVoice(
  languageCode: string,
  provider: 'google' | 'elevenlabs'
): string {
  if (provider === 'google') {
    const code = languageCode.toLowerCase();
    if (code.startsWith('en')) return 'en-US-Neural2-F';
    if (code.startsWith('it')) return 'it-IT-Neural2-C';
    if (code.startsWith('fr')) return 'fr-FR-Neural2-B';
    if (code.startsWith('es')) return 'es-ES-Neural2-F';
    if (code.startsWith('de')) return 'de-DE-Neural2-F';

    if (languageCode.includes('-')) {
      return `${languageCode}-Wavenet-A`;
    }
    return `${languageCode}-${languageCode.toUpperCase()}-Wavenet-A`;
  } else {
    return process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  }
}

/**
 * Synthesizes speech from text using the configured TTS provider.
 *
 * @param text - The narration text to convert to speech
 * @param language - BCP 47 language code (e.g., 'en-US', 'it-IT', 'fr-FR')
 * @returns Raw audio binary as ArrayBuffer
 *
 * @throws Error if API key is missing, provider is invalid, or synthesis fails
 */
export async function synthesizeSpeech(
  text: string,
  language: string
): Promise<ArrayBuffer> {
  const provider = process.env.TTS_PROVIDER || 'google';

  if (provider === 'google') {
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.TTS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Cloud TTS API key is not configured.');
    }
    const voiceName = getDefaultVoice(language, 'google');
    const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: language,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Cloud TTS API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as { audioContent: string };
    if (!data.audioContent) {
      throw new Error('Google Cloud TTS API returned empty audio content.');
    }

    return base64ToArrayBuffer(data.audioContent);
  } else if (provider === 'elevenlabs') {
    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.TTS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key is not configured.');
    }
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) {
      throw new Error('ElevenLabs voice ID is not configured (ELEVENLABS_VOICE_ID).');
    }
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.arrayBuffer();
  } else {
    throw new Error(`Unsupported TTS provider: ${provider}`);
  }
}

/**
 * Synthesizes speech and saves it as an .mp3 file to local storage.
 */
export async function synthesizeAndSave(
  text: string,
  languageCode: string,
  outputPath: string,
  options?: {
    voice?: string;
    speakingRate?: number;
  }
): Promise<{ filePath: string; estimatedDurationSeconds: number }> {
  const audioBuffer = await synthesizeSpeech(text, languageCode);
  const base64 = arrayBufferToBase64(audioBuffer);
  await saveBase64File(base64, outputPath);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const estimatedDurationSeconds = Math.max(1, Math.round((wordCount / 150) * 60));

  return {
    filePath: outputPath,
    estimatedDurationSeconds,
  };
}

/**
 * Splits long text into chunks that fit within the TTS provider's character limit.
 */
export function splitTextForTTS(
  text: string,
  maxChars: number = 4800
): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Generates audio files for all POIs and saves them locally.
 *
 * @param pois - Array of Points of Interest
 * @param tripId - The trip's unique ID
 * @param language - BCP 47 language code
 * @param onProgress - Optional callback for progress updates
 * @returns Array of POIs with updated audio_file_path
 */
export async function generateAllAudio(
  pois: POI[],
  tripId: string,
  language: string,
  onProgress?: (completed: number, total: number) => void
): Promise<POI[]> {
  const total = pois.length;
  let completed = 0;
  const limiter = new RateLimiter({ maxQPS: process.env.NODE_ENV === 'test' ? 1000 : 5 });

  for (const poi of pois) {
    if (poi.narration_text) {
      try {
        const audioBuffer = await limiter.enqueue(() => synthesizeSpeech(poi.narration_text!, language));
        const filePath = await saveAudioFile(tripId, poi.id, audioBuffer);
        poi.audio_file_path = filePath;
      } catch (error) {
        console.error(`Failed to generate audio for POI ${poi.id}:`, error);
        throw error;
      }
    }
    completed++;
    if (onProgress) {
      onProgress(completed, total);
    }
  }

  return pois;
}

/**
 * Downloads a single POI image and saves it locally.
 *
 * @param poi - Point of Interest
 * @param tripId - The trip's unique ID
 * @returns Path to the saved image file, or null on failure/missing URL
 */
export async function downloadPOIImage(
  poi: POI,
  tripId: string
): Promise<string> {
  if (!poi.image_url) {
    throw new Error(`POI ${poi.id} does not have an image URL.`);
  }

  const response = await fetch(poi.image_url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${poi.image_url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const localPath = await saveImageFile(tripId, poi.id, arrayBuffer);
  return localPath;
}

/**
 * Downloads images for all POIs and saves them locally.
 *
 * @param pois - Array of Points of Interest
 * @param tripId - The trip's unique ID
 * @param onProgress - Optional callback for progress updates
 * @returns Array of POIs with updated image_local_path
 */
export async function downloadAllImages(
  pois: POI[],
  tripId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<POI[]> {
  const total = pois.length;
  let completed = 0;

  if (total === 0) {
    return [];
  }

  await Promise.all(
    pois.map(async (poi) => {
      if (poi.image_url) {
        try {
          const localPath = await downloadPOIImage(poi, tripId);
          poi.image_local_path = localPath;
        } catch (error) {
          console.error(`Failed to download image for POI ${poi.id}:`, error);
          poi.image_local_path = null;
        }
      } else {
        poi.image_local_path = null;
      }
      completed++;
      if (onProgress) {
        onProgress(completed, total);
      }
    })
  );

  return pois;
}
