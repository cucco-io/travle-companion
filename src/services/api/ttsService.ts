/**
 * src/services/api/ttsService.ts
 *
 * Cloud Text-to-Speech API integration layer.
 * Converts narration text into audio files for offline playback.
 * Supports three providers:
 *   - 'gemini'     — Google AI Studio Gemini TTS (default, uses GEMINI_API_KEY)
 *   - 'google'     — Google Cloud TTS (requires TTS_API_KEY or GOOGLE_TTS_API_KEY)
 *   - 'elevenlabs' — ElevenLabs (requires ELEVENLABS_API_KEY)
 *
 * Dependencies:
 * - GEMINI_API_KEY (for gemini provider)
 * - TTS_API_KEY / GOOGLE_TTS_API_KEY / ELEVENLABS_API_KEY env vars (for other providers)
 * - src/types/api.ts (TTSRequest, TTSResponse)
 * - expo-file-system (for saving audio files to local storage)
 *
 * API References:
 * - Gemini TTS: https://ai.google.dev/gemini-api/docs/speech-generation
 * - Google Cloud TTS: https://cloud.google.com/text-to-speech/docs
 * - ElevenLabs: https://elevenlabs.io/docs/api-reference
 */

import { POI } from '../../types/poi';
import { RateLimiter } from '../rateLimiter';
import { saveAudioFile, saveBase64File, saveImageFile } from '../storage/fileStorage';

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
 * For 'gemini': returns one of the 30+ prebuilt, language-flexible voice names
 * (Aoede, Kore, Puck, Charon, Fenrir, Zephyr, etc.).
 * These voices are language-flexible — the same voice name works across locales.
 *
 * For 'google': returns a Neural2 voice name for Google Cloud TTS.
 * For 'elevenlabs': returns the configured voice ID.
 *
 * @param languageCode - BCP 47 language code (e.g., 'en-US', 'it-IT', 'fr-FR')
 * @param provider - TTS provider ('gemini', 'google', or 'elevenlabs')
 * @returns A voice ID or name string appropriate for the provider
 */
export function getDefaultVoice(
  languageCode: string,
  provider: 'gemini' | 'google' | 'elevenlabs'
): string {
  if (provider === 'gemini') {
    // Gemini voices are language-flexible; we pick voices that tend to suit
    // the warmth and clarity needed for travel narration.
    const code = languageCode.toLowerCase();
    if (code.startsWith('en')) return 'Aoede';       // warm, clear female
    if (code.startsWith('it')) return 'Kore';        // expressive female
    if (code.startsWith('fr')) return 'Zephyr';      // elegant female
    if (code.startsWith('es')) return 'Leda';        // clear female
    if (code.startsWith('de')) return 'Fenrir';      // authoritative male
    if (code.startsWith('ja')) return 'Puck';        // energetic
    if (code.startsWith('zh')) return 'Charon';      // measured male
    if (code.startsWith('pt')) return 'Sulafat';     // warm female
    if (code.startsWith('ko')) return 'Enceladus';   // clear male
    if (code.startsWith('nl')) return 'Autonoe';     // bright female
    if (code.startsWith('pl')) return 'Rasalgethi';  // clear male
    if (code.startsWith('ru')) return 'Iapetus';     // resonant male
    return 'Aoede'; // default: warm, clear female
  } else if (provider === 'google') {
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
    return process.env.ELEVENLABS_VOICE_ID || process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  }
}

/**
 * Builds a WAV file header and prepends it to raw PCM audio data.
 *
 * Gemini TTS returns raw 16-bit signed PCM at 24000 Hz (mono).
 * Most audio players require a WAV container; this helper adds the 44-byte
 * RIFF/WAV header so the audio can be played back or saved as a .wav file.
 *
 * @param pcmBuffer - Raw PCM audio bytes
 * @param sampleRate - Audio sample rate in Hz (default 24000)
 * @param numChannels - Number of audio channels (default 1 = mono)
 * @param bitsPerSample - Bits per sample (default 16)
 * @returns ArrayBuffer containing a valid WAV file
 */
function pcmToWav(
  pcmBuffer: ArrayBuffer,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): ArrayBuffer {
  const pcmData = new Uint8Array(pcmBuffer);
  const pcmLength = pcmData.byteLength;
  // WAV header is 44 bytes
  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  writeString(0, 'RIFF');                          // ChunkID
  view.setUint32(4, 36 + pcmLength, true);         // ChunkSize
  writeString(8, 'WAVE');                          // Format
  writeString(12, 'fmt ');                         // Subchunk1ID
  view.setUint32(16, 16, true);                    // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true);                     // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);           // NumChannels
  view.setUint32(24, sampleRate, true);            // SampleRate
  view.setUint32(28, byteRate, true);              // ByteRate
  view.setUint16(32, blockAlign, true);            // BlockAlign
  view.setUint16(34, bitsPerSample, true);         // BitsPerSample
  writeString(36, 'data');                         // Subchunk2ID
  view.setUint32(40, pcmLength, true);             // Subchunk2Size

  // Copy PCM bytes after the header
  new Uint8Array(wavBuffer).set(pcmData, 44);

  return wavBuffer;
}

/**
 * Synthesizes speech from text using Google AI Studio's Gemini TTS model.
 *
 * Uses the same GEMINI_API_KEY as the rest of the app — no extra key required.
 * Returns a WAV ArrayBuffer (PCM audio wrapped in RIFF/WAV container).
 *
 * Model: gemini-2.5-flash-preview-tts
 * Audio format: 16-bit PCM @ 24 kHz, mono → wrapped in WAV header
 *
 * @param text - The narration text to convert to speech
 * @param language - BCP 47 language code (e.g., 'en-US', 'it-IT')
 * @returns WAV audio as ArrayBuffer
 * @throws Error if API key is missing or synthesis fails
 */
export async function synthesizeSpeechWithGemini(
  text: string,
  language: string
): Promise<ArrayBuffer> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Gemini API key (GEMINI_API_KEY) is not configured. ' +
      'Get one free at https://aistudio.google.com/app/apikey'
    );
  }

  const voiceName = getDefaultVoice(language, 'gemini');
  const model = 'gemini-3.1-flash-tts-preview';
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text }],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini TTS API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: {
        parts: Array<{
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini TTS API returned no candidates.');
  }

  const audioPart = candidate.content.parts.find(
    (p) => p.inlineData?.mimeType?.startsWith('audio/')
  );

  if (!audioPart?.inlineData?.data) {
    throw new Error(
      'Gemini TTS API response did not contain audio data. ' +
      `Response: ${JSON.stringify(data).substring(0, 500)}`
    );
  }

  const pcmBuffer = base64ToArrayBuffer(audioPart.inlineData.data);

  // Gemini returns raw PCM (16-bit, 24 kHz, mono). Wrap in WAV container.
  return pcmToWav(pcmBuffer);
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
  // Default to 'gemini' — reuses GEMINI_API_KEY, no extra TTS key needed.
  const provider = process.env.TTS_PROVIDER || process.env.EXPO_PUBLIC_TTS_PROVIDER || 'gemini';

  if (provider === 'gemini') {
    return synthesizeSpeechWithGemini(text, language);
  }

  if (provider === 'google') {
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_TTS_API_KEY || process.env.TTS_API_KEY || process.env.EXPO_PUBLIC_TTS_API_KEY;
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
    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || process.env.TTS_API_KEY || process.env.EXPO_PUBLIC_TTS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key is not configured.');
    }
    const voiceId = process.env.ELEVENLABS_VOICE_ID || process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID;
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
