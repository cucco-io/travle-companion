import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Switch,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as FileSystem from 'expo-file-system/legacy';
import { loadSettings, updateSettings, AppSettings } from '@/src/services/storage/settingsStorage';
import { synthesizeSpeech } from '@/src/services/api/ttsService';
import { playAudioFile, playTTSFallback, stopAudio, isAudioAvailable } from '@/src/services/audio/audioPlayer';
import { getAllTrips, deleteTrip } from '@/src/services/storage/tripStorage';
import { Trip } from '@/src/types/trip';
import { useAppTheme, type ThemePreference } from '@/src/theme/ThemeContext';
import {
  GroupedSection,
  GroupedRow,
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  SegmentedControl,
  Icon,
} from '@/src/theme/UIComponents';
import { Icons } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THEME_SEGMENTS = ['System', 'Light', 'Dark'] as const;
const THEME_VALUES: ThemePreference[] = ['system', 'light', 'dark'];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { colors, colorScheme, themePreference, setThemePreference } = useAppTheme();

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
        if (!isAudioAvailable()) {
          // Play fallback speech directly without blocking Alert, since the UI already clearly shows the fallback status
          await playTTSFallback(
            "This is your device's native speech engine playing as a fallback for Gemini voice.",
            'en-US',
            (status) => {
              if (status === 'finished' || status === 'error') {
                setPreviewing(false);
              }
            }
          );
          return;
        }

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
              const tripsDir = `${FileSystem.documentDirectory}trips/`;
              const info = await FileSystem.getInfoAsync(tripsDir);
              if (info.exists) {
                const trips = await getAllTrips();
                for (const trip of trips) {
                  const audioDir = `${tripsDir}${trip.id}/audio/`;
                  const audioDirInfo = await FileSystem.getInfoAsync(audioDir);
                  if (audioDirInfo.exists) {
                    await FileSystem.deleteAsync(audioDir, { idempotent: true });
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

  // ── Theme segment index ───────────────────────────────────────────────────
  const themeIndex = THEME_VALUES.indexOf(themePreference);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!settings) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }, styles.center]}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* ── Appearance ──────────────────────────────────────────────────────── */}
      <GroupedSection header="Appearance">
        <View style={styles.segmentRow}>
          <SegmentedControl
            segments={[...THEME_SEGMENTS]}
            selectedIndex={themeIndex >= 0 ? themeIndex : 0}
            onSelect={(index) => setThemePreference(THEME_VALUES[index])}
          />
        </View>
      </GroupedSection>

      {/* ── Text-to-Speech ─────────────────────────────────────────────────── */}
      <GroupedSection
        header="Text-to-Speech"
        footer={
          !isAudioAvailable()
            ? '⚠️ Note: The native audio player (expo-av) is not available in this build. You can still prepare trips with Gemini TTS (generating custom text/audio), but playback will fall back to native device speech.'
            : settings.ttsProvider === 'gemini'
            ? 'Provides warm, professional narration. Requires internet during trip planning to pre-generate audio, but plays 100% offline once prepared.'
            : 'Skips audio generation during planning (making trip preparation super fast). Narrations are spoken in real-time by your device’s built-in speech system.'
        }
      >
        <GroupedRow
          label="Use Gemini TTS"
          icon={Icons.microphone}
          iconBackground={colors.tint}
          showSeparator={false}
          onPress={() => handleToggle(settings.ttsProvider !== 'gemini')}
          accessory={
            <View pointerEvents="none">
              <Switch
                value={settings.ttsProvider === 'gemini'}
                trackColor={{ false: colors.fill, true: colors.tint }}
                thumbColor="#FFFFFF"
              />
            </View>
          }
        />
      </GroupedSection>

      {/* Info callout */}
      <View style={[styles.infoBox, { backgroundColor: colors.fillTertiary }]}>
        <View style={styles.infoHeader}>
          <Icon
            name={
              settings.ttsProvider === 'gemini'
                ? (isAudioAvailable() ? Icons.wand : Icons.warningTriangle)
                : Icons.speakerSlash
            }
            size={16}
            color={
              settings.ttsProvider === 'gemini'
                ? (isAudioAvailable() ? colors.tint : colors.warning)
                : colors.tint
            }
          />
          <Text
            style={[
              Typography.subheadline,
              {
                color: settings.ttsProvider === 'gemini' && !isAudioAvailable() ? colors.warning : colors.tint,
                fontWeight: '600',
                marginLeft: Spacing.sm,
              },
            ]}
          >
            {settings.ttsProvider === 'gemini'
              ? (isAudioAvailable() ? 'Gemini TTS (Cloud)' : 'Gemini TTS (Cloud - Fallback Active)')
              : 'On-Device TTS (Local)'}
          </Text>
        </View>
        <Text style={[Typography.footnote, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
          {settings.ttsProvider === 'gemini'
            ? (isAudioAvailable()
                ? 'High-fidelity, human-like voice generated during trip preparation.'
                : "High-fidelity audio will be pre-generated, but since expo-av is missing in this build, playback uses your device's local speech engine.")
            : 'Using your device’s native local speech engine.'}
        </Text>
      </View>

      {/* Test Voice */}
      <View style={styles.buttonRow}>
        <PrimaryButton
          title="Test Voice Preview"
          icon={Icons.speaker}
          onPress={handleTestSpeech}
          disabled={previewing}
          loading={previewing}
        />
      </View>

      {/* ── Storage & Cache ────────────────────────────────────────────────── */}
      <GroupedSection header="Storage & Cache">
        <GroupedRow
          label="Saved Trips"
          icon={Icons.trips}
          iconBackground={colors.success}
          value={String(tripCount)}
        />
        <GroupedRow
          label="Cached Audio Size"
          icon={Icons.storage}
          iconBackground={colors.warning}
          value={`${cacheSize.toFixed(1)} MB`}
          showSeparator={false}
        />
      </GroupedSection>

      <View style={styles.buttonGroup}>
        <SecondaryButton
          title="Clear Cached Audio"
          onPress={handleClearCache}
          disabled={clearingCache}
          loading={clearingCache}
        />
        <View style={{ height: Spacing.sm }} />
        <DestructiveButton
          title="Delete All Trips"
          icon={Icons.trash}
          onPress={handleDeleteAllTrips}
          disabled={deletingTrips}
          loading={deletingTrips}
        />
      </View>

      {/* ── About ──────────────────────────────────────────────────────────── */}
      <GroupedSection header="About">
        <GroupedRow
          label="App Version"
          icon={Icons.info}
          iconBackground={colors.textSecondary}
          value="1.0.0"
        />
        <GroupedRow
          label="Developer Mode"
          icon={Icons.gearshape}
          iconBackground={colors.tintSecondary}
          value="Active"
          textColor={colors.textPrimary}
          showSeparator={false}
        />
      </GroupedSection>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: Platform.OS === 'ios' ? Spacing.lg : Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  segmentRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  infoBox: {
    marginHorizontal: Spacing.base * 2,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonRow: {
    paddingHorizontal: Spacing.base * 2,
    marginBottom: Spacing.xl,
  },
  buttonGroup: {
    paddingHorizontal: Spacing.base * 2,
    marginBottom: Spacing.xl,
  },
});
