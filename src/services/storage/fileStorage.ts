/**
 * src/services/storage/fileStorage.ts
 *
 * Audio and image file management for offline trip content.
 * Handles downloading, caching, and cleanup of media files.
 *
 * Files are stored in the app's document directory:
 * - trips/{tripId}/audio/{poiId}.mp3  — narration audio files
 * - trips/{tripId}/images/{poiId}.jpg — POI images
 *
 * Dependencies:
 * - expo-file-system (FileSystem.documentDirectory, downloadAsync, deleteAsync, etc.)
 */

import * as FileSystem from 'expo-file-system/legacy';

declare const Buffer: any;

/**
 * Helper function to convert ArrayBuffer to Base64 string.
 * Works in both Node.js (Jest) and React Native environment.
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
 * Returns the base directory path for a trip's cached files.
 *
 * @param tripId - The trip's unique ID
 * @returns Absolute path to the trip's file directory
 *
 * @example
 * getTripDirectory('abc-123')
 * // → "{documentDirectory}/trips/abc-123/"
 */
export function getTripDirectory(tripId: string): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('FileSystem.documentDirectory is not defined');
  }
  const base = FileSystem.documentDirectory.endsWith('/')
    ? FileSystem.documentDirectory
    : `${FileSystem.documentDirectory}/`;
  return `${base}trips/${tripId}/`;
}

/**
 * Returns the file path for a POI's audio file.
 *
 * @param tripId - The trip's unique ID
 * @param poiId - The POI's unique ID
 * @returns Absolute path to the audio file
 *
 * @example
 * getAudioFilePath('abc-123', 'poi-456')
 * // → "{documentDirectory}/trips/abc-123/audio/poi-456.mp3"
 */
export function getAudioFilePath(tripId: string, poiId: string): string {
  return `${getTripDirectory(tripId)}audio/${poiId}.mp3`;
}

/**
 * Returns the file path for a POI's image file.
 *
 * @param tripId - The trip's unique ID
 * @param poiId - The POI's unique ID
 * @returns Absolute path to the image file
 */
export function getImageFilePath(tripId: string, poiId: string): string {
  return `${getTripDirectory(tripId)}images/${poiId}.jpg`;
}

/**
 * Ensures the directory structure exists for a trip's files.
 *
 * @param tripId - The trip's unique ID
 *
 * Implementation notes:
 * - Create directories: trips/{tripId}/audio/, trips/{tripId}/images/
 * - Use FileSystem.makeDirectoryAsync with intermediates: true
 */
export async function ensureTripDirectories(tripId: string): Promise<void> {
  const tripDir = getTripDirectory(tripId);
  await FileSystem.makeDirectoryAsync(`${tripDir}audio/`, { intermediates: true });
  await FileSystem.makeDirectoryAsync(`${tripDir}images/`, { intermediates: true });
}

/**
 * Downloads a file from a URL and saves it locally.
 *
 * @param url - The remote URL to download from
 * @param localPath - The local path to save the file to
 * @returns Object with the local path and file size in bytes
 *
 * Implementation notes:
 * - Use FileSystem.downloadAsync()
 * - Verify the download was successful (check status code and file size)
 * - Handle network errors gracefully (return null on failure)
 */
export async function downloadFile(
  url: string,
  localPath: string
): Promise<{ path: string; sizeBytes: number } | null> {
  try {
    const result = await FileSystem.downloadAsync(url, localPath);
    if (result.status >= 200 && result.status < 300) {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && !info.isDirectory && info.size !== undefined) {
        return { path: localPath, sizeBytes: info.size };
      }
    }
    return null;
  } catch (error) {
    console.error(`Failed to download file from ${url}:`, error);
    return null;
  }
}

/**
 * Saves base64-encoded content to a local file.
 *
 * @param base64Content - Base64-encoded file content
 * @param localPath - The local path to save the file to
 * @returns Object with the local path and file size in bytes
 *
 * Implementation notes:
 * - Use FileSystem.writeAsStringAsync with encoding: FileSystem.EncodingType.Base64
 * - Verify file was written (check info with getInfoAsync)
 */
export async function saveBase64File(
  base64Content: string,
  localPath: string
): Promise<{ path: string; sizeBytes: number }> {
  await FileSystem.writeAsStringAsync(localPath, base64Content, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const info = await FileSystem.getInfoAsync(localPath);
  if (!info.exists || info.isDirectory || info.size === undefined) {
    throw new Error(`Failed to verify written base64 file at ${localPath}`);
  }
  return { path: localPath, sizeBytes: info.size };
}

/**
 * Deletes all cached files for a trip (audio + images).
 *
 * @param tripId - The trip's unique ID
 *
 * Implementation notes:
 * - Delete the entire trips/{tripId}/ directory recursively
 * - Use FileSystem.deleteAsync with idempotent: true
 */
export async function deleteTripFiles(tripId: string): Promise<void> {
  const tripDir = getTripDirectory(tripId);
  await FileSystem.deleteAsync(tripDir, { idempotent: true });
}

/**
 * Calculates the total size of cached files for a trip in megabytes.
 *
 * @param tripId - The trip's unique ID
 * @returns Total size in MB
 *
 * Implementation notes:
 * - Use FileSystem.getInfoAsync to get size of each file
 * - Sum all audio and image files in the trip directory
 * - Return size in MB (bytes / 1024 / 1024)
 */
export async function getTripFileSizeMB(tripId: string): Promise<number> {
  const bytes = await getTripStorageSize(tripId);
  return bytes / (1024 * 1024);
}

/**
 * Checks if a file exists at the given path.
 *
 * @param filePath - Absolute path to check
 * @returns True if the file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(filePath);
  return info.exists && !info.isDirectory;
}

/**
 * Additional functions requested by user
 */

/**
 * Saves binary audio file data to a local file.
 *
 * @param tripId - The trip's unique ID
 * @param poiId - The POI's unique ID
 * @param audioData - The audio file's binary content
 * @returns Path to the saved file
 */
export async function saveAudioFile(
  tripId: string,
  poiId: string,
  audioData: ArrayBuffer
): Promise<string> {
  await ensureTripDirectories(tripId);
  const localPath = getAudioFilePath(tripId, poiId);
  await saveBase64File(arrayBufferToBase64(audioData), localPath);
  return localPath;
}

/**
 * Saves binary image file data to a local file.
 *
 * @param tripId - The trip's unique ID
 * @param poiId - The POI's unique ID
 * @param imageData - The image file's binary content
 * @returns Path to the saved file
 */
export async function saveImageFile(
  tripId: string,
  poiId: string,
  imageData: ArrayBuffer
): Promise<string> {
  await ensureTripDirectories(tripId);
  const localPath = getImageFilePath(tripId, poiId);
  await saveBase64File(arrayBufferToBase64(imageData), localPath);
  return localPath;
}

/**
 * Returns the local file path for a POI's media file.
 *
 * @param tripId - The trip's unique ID
 * @param type - File type ('audio' or 'image')
 * @param poiId - The POI's unique ID
 * @returns Path to the media file
 */
export function getFilePath(
  tripId: string,
  type: 'audio' | 'image',
  poiId: string
): string {
  if (type === 'audio') {
    return getAudioFilePath(tripId, poiId);
  } else if (type === 'image') {
    return getImageFilePath(tripId, poiId);
  }
  throw new Error(`Invalid type: ${type}`);
}

/**
 * Returns the total storage size of cached files for a trip in bytes.
 *
 * @param tripId - The trip's unique ID
 * @returns Total size in bytes
 */
export async function getTripStorageSize(tripId: string): Promise<number> {
  const tripDir = getTripDirectory(tripId);
  const dirInfo = await FileSystem.getInfoAsync(tripDir);
  if (!dirInfo.exists) {
    return 0;
  }

  let totalBytes = 0;
  const subDirs = ['audio', 'images'];
  
  for (const subDir of subDirs) {
    const subDirUri = `${tripDir}${subDir}/`;
    try {
      const subDirInfo = await FileSystem.getInfoAsync(subDirUri);
      if (subDirInfo.exists && subDirInfo.isDirectory) {
        const files = await FileSystem.readDirectoryAsync(subDirUri);
        for (const file of files) {
          const fileUri = `${subDirUri}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists && !fileInfo.isDirectory && fileInfo.size !== undefined) {
            totalBytes += fileInfo.size;
          }
        }
      }
    } catch (e) {
      // Directory might not exist, ignore
    }
  }

  return totalBytes;
}
