import * as FileSystem from 'expo-file-system/legacy';
import {
  getTripDirectory,
  getAudioFilePath,
  getImageFilePath,
  ensureTripDirectories,
  saveAudioFile,
  saveImageFile,
  getFilePath,
  deleteTripFiles,
  getTripStorageSize,
  getTripFileSizeMB,
  fileExists,
  downloadFile,
  saveBase64File
} from '../fileStorage';

jest.mock('expo-file-system/legacy', () => {
  return {
    documentDirectory: 'file:///mock-documents/',
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
    downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    getInfoAsync: jest.fn(),
    readDirectoryAsync: jest.fn(),
    EncodingType: {
      Base64: 'base64',
    },
  };
});

describe('fileStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getTripDirectory returns correct path with documentDirectory', () => {
    const dir = getTripDirectory('trip-123');
    expect(dir).toBe('file:///mock-documents/trips/trip-123/');
  });

  test('getAudioFilePath and getImageFilePath return correct paths', () => {
    expect(getAudioFilePath('trip-123', 'poi-456')).toBe('file:///mock-documents/trips/trip-123/audio/poi-456.mp3');
    expect(getImageFilePath('trip-123', 'poi-789')).toBe('file:///mock-documents/trips/trip-123/images/poi-789.jpg');
  });

  test('ensureTripDirectories makes correct directories', async () => {
    await ensureTripDirectories('trip-123');
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///mock-documents/trips/trip-123/audio/', { intermediates: true });
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///mock-documents/trips/trip-123/images/', { intermediates: true });
  });

  test('getFilePath returns correct paths for audio/image', () => {
    expect(getFilePath('trip-123', 'audio', 'poi-456')).toBe('file:///mock-documents/trips/trip-123/audio/poi-456.mp3');
    expect(getFilePath('trip-123', 'image', 'poi-456')).toBe('file:///mock-documents/trips/trip-123/images/poi-456.jpg');
    expect(() => getFilePath('trip-123', 'other' as any, 'poi-456')).toThrow();
  });

  test('deleteTripFiles deletes trip directory', async () => {
    await deleteTripFiles('trip-123');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///mock-documents/trips/trip-123/', { idempotent: true });
  });

  test('fileExists returns true when file exists and is not a directory', async () => {
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: true, isDirectory: false });
    const exists = await fileExists('some-file');
    expect(exists).toBe(true);
  });

  test('saveBase64File writes file and returns path and size', async () => {
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: true, isDirectory: false, size: 500 });
    const result = await saveBase64File('base64String', 'some-path');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith('some-path', 'base64String', { encoding: 'base64' });
    expect(result).toEqual({ path: 'some-path', sizeBytes: 500 });
  });

  test('saveAudioFile and saveImageFile convert ArrayBuffer, ensure directories, and save', async () => {
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: true, isDirectory: false, size: 1000 });
    
    // Create an ArrayBuffer with some data
    const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello" in UTF-8
    
    const audioPath = await saveAudioFile('trip-123', 'poi-456', buffer);
    expect(audioPath).toBe('file:///mock-documents/trips/trip-123/audio/poi-456.mp3');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-documents/trips/trip-123/audio/poi-456.mp3',
      'SGVsbG8=', // "Hello" in base64
      { encoding: 'base64' }
    );

    const imagePath = await saveImageFile('trip-123', 'poi-456', buffer);
    expect(imagePath).toBe('file:///mock-documents/trips/trip-123/images/poi-456.jpg');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-documents/trips/trip-123/images/poi-456.jpg',
      'SGVsbG8=',
      { encoding: 'base64' }
    );
  });

  test('getTripStorageSize and getTripFileSizeMB calculate correctly', async () => {
    // getInfoAsync needs to return exists: true for the directory
    (FileSystem.getInfoAsync as any).mockImplementation((uri: string) => {
      if (uri === 'file:///mock-documents/trips/trip-123/') {
        return Promise.resolve({ exists: true, isDirectory: true });
      }
      if (uri.endsWith('/audio/') || uri.endsWith('/images/')) {
        return Promise.resolve({ exists: true, isDirectory: true });
      }
      if (uri.endsWith('file1.mp3')) {
        return Promise.resolve({ exists: true, isDirectory: false, size: 1024 * 1024 }); // 1MB
      }
      if (uri.endsWith('file2.jpg')) {
        return Promise.resolve({ exists: true, isDirectory: false, size: 2 * 1024 * 1024 }); // 2MB
      }
      return Promise.resolve({ exists: false });
    });

    (FileSystem.readDirectoryAsync as any).mockImplementation((uri: string) => {
      if (uri.endsWith('/audio/')) {
        return Promise.resolve(['file1.mp3']);
      }
      if (uri.endsWith('/images/')) {
        return Promise.resolve(['file2.jpg']);
      }
      return Promise.resolve([]);
    });

    const bytes = await getTripStorageSize('trip-123');
    expect(bytes).toBe(3 * 1024 * 1024);

    const mb = await getTripFileSizeMB('trip-123');
    expect(mb).toBe(3);
  });

  test('downloadFile handles successful and failed downloads', async () => {
    // Success
    (FileSystem.downloadAsync as any).mockResolvedValue({ status: 200 });
    (FileSystem.getInfoAsync as any).mockResolvedValue({ exists: true, isDirectory: false, size: 1234 });
    const successResult = await downloadFile('http://url', 'some-path');
    expect(successResult).toEqual({ path: 'some-path', sizeBytes: 1234 });

    // Fail
    (FileSystem.downloadAsync as any).mockResolvedValue({ status: 404 });
    const failResult = await downloadFile('http://url', 'some-path');
    expect(failResult).toBeNull();
  });
});
