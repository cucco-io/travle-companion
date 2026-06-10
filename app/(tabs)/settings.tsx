import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { loadSettings, updateSettings, AppSettings } from '@/src/services/storage/settingsStorage';
import { synthesizeSpeech } from '@/src/services/api/ttsService';
import { playAudioFile, playTTSFallback, stopAudio } from '@/src/services/audio/audioPlayer';
import { getAllTrips, deleteTrip } from '@/src/services/storage/tripStorage';
import { Trip } from '@/src/types/trip';

// ─── Design tokens ──────────────────────────────────────────────────────────
const COLORS = {
  navy: '#0A1628',
  navyLight: '#122040',
  navyMid: '#1A2E4A',
  gold: '#F5A623',
  goldLight: '#FFD166',
  teal: '#06B6D4',
  tealDark: '#0891B2',
  white: '#FFFFFF',
  whiteAlpha80: 'rgba(255,255,255,0.8)',
  whiteAlpha50: 'rgba(255,255,255,0.5)',
  whiteAlpha20: 'rgba(255,255,255,0.2)',
  whiteAlpha10: 'rgba(255,255,255,0.1)',
  whiteAlpha05: 'rgba(255,255,255,0.05)',
  error: '#FF6B6B',
  success: '#10B981',
};

/**
 * Helper to convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [tripCount, setTripCount] = useState<number>(0);
  const [previewing, setPreviewing] = useState<boolean>(false);
  const [clearingCache, setClearingCache] = useState<boolean>(false);
  const [deletingTrips, setDeletingTrips] = useState<boolean>(false);

  // Load settings and data sizes
  const loadData = useCallback(async () => {
    try {
      const s = await loadSettings();
      setSettings(s);

      const trips = await getAllTrips();
      setTripCount(trips.length);

      // Sum sizes of all trips
      const size = trips.reduce((sum, t) => sum + (t.total_size_mb || 0), 0);
      setCacheSize(size);
    } catch (err) {
      console.warn('[settings] Failed to load settings details:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle TTS Switch Toggle
  const handleToggle = async (value: boolean) => {
    try {
      const provider = value ? 'gemini' : 'device';
      const updated = await updateSettings({ ttsProvider: provider });
      setSettings(updated);
    } catch (err) {
      Alert.alert('Error', 'Failed to save settings changes.');
    }
  };

  // Test Speech Playback
  const handleTestSpeech = async () => {
    if (!settings) return;
    try {
      setPreviewing(true);
      await stopAudio();
      
      const testText = settings.ttsProvider === 'gemini'
        ? "This is a preview of the Gemini high fidelity voice."
        : "This is a preview of your device's native speech engine.";

      if (settings.ttsProvider === 'gemini') {
        const buffer = await synthesizeSpeech(testText, 'en-US');
        const base64 = arrayBufferToBase64(buffer);
        const tempPath = `${FileSystem.documentDirectory}temp_test_speech.wav`;
        
        await FileSystem.writeAsStringAsync(tempPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await playAudioFile(tempPath, (status) => {
          if (status === 'finished' || status === 'error') {
            setPreviewing(false);
          }
        });
      } else {
        await playTTSFallback(testText, 'en-US', (status) => {
          if (status === 'finished' || status === 'error') {
            setPreviewing(false);
          }
        });
      }
    } catch (error: any) {
      setPreviewing(false);
      Alert.alert(
        'Speech Preview Failed',
        error.message || 'Please check your internet connection or Gemini API key configurations.'
      );
    }
  };

  // Clear Cached Audio
  const handleClearCache = () => {
    Alert.alert(
      'Clear Cached Audio?',
      'This will delete all locally saved audio files. Narrations will fall back to on-device TTS when offline.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              // Deletes the trips directory contents containing audio & images
              const tripsDir = `${FileSystem.documentDirectory}trips/`;
              const info = await FileSystem.getInfoAsync(tripsDir);
              if (info.exists) {
                // Read all subdirectories (which are tripIds)
                const trips = await getAllTrips();
                for (const trip of trips) {
                  const audioDir = `${tripsDir}${trip.id}/audio/`;
                  const audioDirInfo = await FileSystem.getInfoAsync(audioDir);
                  if (audioDirInfo.exists) {
                    await FileSystem.deleteAsync(audioDir, { idempotent: true });
                    // recreate empty audio dir
                    await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
                  }
                }
              }
              await loadData();
              Alert.alert('Success', 'Cached audio cleared successfully.');
            } catch (err) {
              Alert.alert('Error', 'Failed to clear cached audio files.');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  // Delete All Trips
  const handleDeleteAllTrips = () => {
    Alert.alert(
      'Delete All Trips?',
      'This will permanently delete all trips, POIs, bookmarks, and files. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setDeletingTrips(true);
            try {
              const trips = await getAllTrips();
              for (const trip of trips) {
                await deleteTrip(trip.id);
              }
              // Delete main trips folder recursively
              const tripsDir = `${FileSystem.documentDirectory}trips/`;
              await FileSystem.deleteAsync(tripsDir, { idempotent: true });
              await loadData();
              Alert.alert('Success', 'All trips deleted successfully.');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete all trips.');
            } finally {
              setDeletingTrips(false);
            }
          },
        },
      ]
    );
  };

  if (!settings) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>Customize your travel companion preferences</Text>
      </View>

      {/* TTS Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎙️ Text-to-Speech Settings</Text>
        <View style={styles.divider} />

        <View style={styles.settingRow}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingLabel}>Use Gemini TTS</Text>
            <Text style={styles.settingDesc}>
              {settings.ttsProvider === 'gemini'
                ? 'High-fidelity, human-like voice generated during trip preparation.'
                : 'Using your device’s native local speech engine.'}
            </Text>
          </View>
          <Switch
            value={settings.ttsProvider === 'gemini'}
            onValueChange={handleToggle}
            trackColor={{ false: COLORS.navy, true: COLORS.tealDark }}
            thumbColor={settings.ttsProvider === 'gemini' ? COLORS.gold : '#f4f3f4'}
          />
        </View>

        <View style={styles.divider} />

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>
            {settings.ttsProvider === 'gemini' ? '🚀 Gemini TTS (Cloud)' : '🔌 On-Device TTS (Local)'}
          </Text>
          <Text style={styles.infoDesc}>
            {settings.ttsProvider === 'gemini'
              ? 'Provides warm, professional narration. Requires internet during the trip planning stage to pre-generate audio files, but plays 100% offline once prepared.'
              : 'Skips audio generation entirely during planning (making trip preparation super fast). Narrations are spoken in real-time by your device\'s built-in speech system.'}
          </Text>
        </View>

        {/* Test Voice Button */}
        <TouchableOpacity
          style={[styles.btn, previewing && styles.btnDisabled]}
          onPress={handleTestSpeech}
          disabled={previewing}
        >
          {previewing ? (
            <ActivityIndicator size="small" color={COLORS.navy} />
          ) : (
            <Text style={styles.btnText}>🔊 Test Voice Preview</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Storage & Cache */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💾 Storage & Cache</Text>
        <View style={styles.divider} />

        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>Saved Trips</Text>
          <Text style={styles.storageValue}>{tripCount}</Text>
        </View>
        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>Total Cached Audio Size</Text>
          <Text style={styles.storageValue}>{cacheSize.toFixed(1)} MB</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, clearingCache && styles.btnDisabled]}
            onPress={handleClearCache}
            disabled={clearingCache}
          >
            <Text style={styles.actionBtnText}>🧹 Clear Cached Audio</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dangerBtn, deletingTrips && styles.btnDisabled]}
            onPress={handleDeleteAllTrips}
            disabled={deletingTrips}
          >
            <Text style={styles.dangerBtnText}>🗑 Delete All Trips</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* About */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ℹ️ About</Text>
        <View style={styles.divider} />
        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>App Version</Text>
          <Text style={styles.storageValue}>1.0.0</Text>
        </View>
        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>Developer Mode</Text>
          <Text style={[styles.storageValue, { color: COLORS.teal }]}>Active</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.whiteAlpha50,
  },
  card: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.whiteAlpha10,
    marginVertical: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: COLORS.whiteAlpha50,
    lineHeight: 18,
  },
  infoBox: {
    backgroundColor: COLORS.whiteAlpha05,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.teal,
    marginBottom: 6,
  },
  infoDesc: {
    fontSize: 13,
    color: COLORS.whiteAlpha80,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  storageLabel: {
    fontSize: 14,
    color: COLORS.whiteAlpha80,
  },
  storageValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.whiteAlpha10,
    borderRadius: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  dangerBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.error,
  },
});
