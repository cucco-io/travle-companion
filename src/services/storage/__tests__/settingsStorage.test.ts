import * as FileSystem from 'expo-file-system/legacy';
import { loadSettings, saveSettings, updateSettings } from '../settingsStorage';

jest.mock('expo-file-system/legacy', () => {
  return {
    documentDirectory: 'file:///mock-documents/',
    getInfoAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  };
});

describe('settingsStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loadSettings returns default settings when file does not exist', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    const settings = await loadSettings();
    expect(settings).toEqual({ ttsProvider: 'gemini' });
    expect(FileSystem.getInfoAsync).toHaveBeenCalled();
  });

  test('loadSettings returns saved settings when file exists', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ ttsProvider: 'device' })
    );

    const settings = await loadSettings();
    expect(settings).toEqual({ ttsProvider: 'device' });
    expect(FileSystem.readAsStringAsync).toHaveBeenCalled();
  });

  test('saveSettings writes stringified settings to file path', async () => {
    await saveSettings({ ttsProvider: 'device' });

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-documents/settings.json',
      JSON.stringify({ ttsProvider: 'device' })
    );
  });

  test('updateSettings merges updates and saves them', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ ttsProvider: 'gemini' })
    );

    const updated = await updateSettings({ ttsProvider: 'device' });
    expect(updated).toEqual({ ttsProvider: 'device' });

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-documents/settings.json',
      JSON.stringify({ ttsProvider: 'device' })
    );
  });
});
