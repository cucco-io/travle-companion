import * as FileSystem from 'expo-file-system/legacy';

export interface AppSettings {
  ttsProvider: 'gemini' | 'device';
  themePreference?: 'system' | 'light' | 'dark';
}

const DEFAULT_SETTINGS: AppSettings = {
  ttsProvider: 'gemini',
  themePreference: 'system',
};

const SETTINGS_FILE_PATH = `${FileSystem.documentDirectory}settings.json`;

/**
 * Loads settings from file storage. Falls back to defaults if not found.
 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    if (typeof FileSystem?.getInfoAsync !== 'function' || typeof FileSystem?.readAsStringAsync !== 'function') {
      return DEFAULT_SETTINGS;
    }
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE_PATH);
    if (info.exists && !info.isDirectory) {
      const content = await FileSystem.readAsStringAsync(SETTINGS_FILE_PATH);
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    }
  } catch (error) {
    console.warn('[settingsStorage] Failed to load settings, using defaults:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Saves settings to file storage.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    if (typeof FileSystem?.writeAsStringAsync !== 'function') {
      return;
    }
    await FileSystem.writeAsStringAsync(SETTINGS_FILE_PATH, JSON.stringify(settings));
  } catch (error) {
    console.error('[settingsStorage] Failed to save settings:', error);
    throw error;
  }
}

/**
 * Updates a subset of settings.
 */
export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const updated = { ...current, ...updates };
  await saveSettings(updated);
  return updated;
}
