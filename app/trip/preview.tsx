/**
 * app/trip/preview.tsx
 *
 * Research Preview Screen
 * Lets the user preview narration text and play audio for all finished POI research.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getTripById } from '@/src/services/storage/tripStorage';
import { useNarrationPlayer } from '@/src/hooks/useNarrationPlayer';
import { Trip } from '@/src/types/trip';
import { POI } from '@/src/types/poi';
import { SymbolView } from 'expo-symbols';

import { useAppTheme } from '@/src/theme/ThemeContext';
import {
  PrimaryButton,
  SecondaryButton,
  Badge,
  Icon,
} from '@/src/theme/UIComponents';
import { Icons, getCategoryIcon } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

export default function ResearchPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ?? '';
  const { colors, colorScheme } = useAppTheme();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPois, setExpandedPois] = useState<Set<string>>(new Set());

  // Narration player controls
  const narration = useNarrationPlayer(true); // Pause on navigation

  useEffect(() => {
    async function loadTrip() {
      try {
        if (!tripId) {
          setLoading(false);
          return;
        }
        const t = await getTripById(tripId);
        setTrip(t);
      } catch (err) {
        console.error('Failed to load trip details for preview:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTrip();
  }, [tripId]);

  const toggleExpand = useCallback((poiId: string) => {
    setExpandedPois((prev) => {
      const next = new Set(prev);
      if (next.has(poiId)) {
        next.delete(poiId);
      } else {
        next.add(poiId);
      }
      return next;
    });
  }, []);

  const handlePlayPress = useCallback((poi: POI) => {
    const isCurrent = narration.currentPOI?.id === poi.id;
    if (isCurrent) {
      if (narration.isPaused) {
        narration.resume();
      } else {
        narration.pause();
      }
    } else {
      narration.stop();
      narration.enqueue(poi);
    }
  }, [narration]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Research Preview' }} />
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.base }]}>Loading research data...</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Research Preview' }} />
        <Text style={[Typography.body, { color: colors.destructive, marginBottom: Spacing.xl }]}>Trip not found.</Text>
        <SecondaryButton title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  // Filter for POIs that have some narration text generated
  const finishedPOIs = trip.pois.filter((p) => p.narration_text && p.narration_text.length > 0 && p.narration_text !== 'Failed to generate narration');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack.Screen
        options={{
          title: 'Research Preview',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={[styles.banner, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <View style={[styles.bannerIconContainer, { backgroundColor: colors.fillTertiary }]}>
            <Icon name={Icons.docText} size={36} color={colors.tint} />
          </View>
          <Text style={[Typography.title2, { color: colors.textPrimary, textAlign: 'center', marginBottom: Spacing.xs }]}>{trip.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SymbolView name={Icons.mappin} tintColor={colors.textSecondary} size={13} style={{ marginRight: 4 }} />
            <Text style={[Typography.subheadline, { color: colors.textSecondary }]}>
              {trip.destination.name} · {finishedPOIs.length} Points of Interest
            </Text>
          </View>
        </View>

        {finishedPOIs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
            <Icon name={Icons.clock} size={48} color={colors.textQuaternary} style={{ marginBottom: Spacing.md }} />
            <Text style={[Typography.headline, { color: colors.textPrimary, marginBottom: Spacing.xs }]}>No research content finished yet</Text>
            <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Content will appear here as Gemini writes narrations and synthesizes audio.
            </Text>
          </View>
        ) : (
          finishedPOIs.map((poi) => {
            const isExpanded = expandedPois.has(poi.id);
            const isCurrent = narration.currentPOI?.id === poi.id;
            const isPlaying = isCurrent && !narration.isPaused && narration.playbackStatus === 'playing';
            const isLoading = isCurrent && narration.playbackStatus === 'loading';

            return (
              <View
                key={poi.id}
                style={[
                  styles.poiCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: isCurrent ? colors.tint : colors.cardBorder,
                  },
                  isCurrent && { borderWidth: 1.5 },
                ]}
              >
                {/* POI Info row */}
                <TouchableOpacity
                  style={styles.poiHeader}
                  onPress={() => toggleExpand(poi.id)}
                  activeOpacity={0.7}
                >
                  <Icon name={getCategoryIcon(poi.category)} size={22} color={colors.textSecondary} style={{ marginRight: Spacing.sm }} />
                  <View style={styles.poiMetaContainer}>
                    <Text style={[Typography.headline, { color: colors.textPrimary }]} numberOfLines={1}>{poi.name}</Text>
                    <Text style={[Typography.footnote, { color: colors.textSecondary, textTransform: 'capitalize', marginTop: 2 }]}>
                      {poi.category.replace(/_/g, ' ')} · ⭐ {poi.rating.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.poiHeaderRight}>
                    {/* Audio Play/Pause button */}
                    <TouchableOpacity
                      style={[
                        styles.playButton,
                        {
                          backgroundColor: isPlaying ? colors.tint : colors.buttonSecondary,
                        },
                      ]}
                      onPress={() => handlePlayPress(poi)}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                      ) : (
                        <SymbolView
                          name={isPlaying ? Icons.pause : Icons.play}
                          tintColor={isPlaying ? '#FFFFFF' : colors.tint}
                          size={16}
                        />
                      )}
                    </TouchableOpacity>
                    <SymbolView
                      name={isExpanded ? Icons.chevronUp : Icons.chevronDown}
                      tintColor={colors.textQuaternary}
                      size={12}
                    />
                  </View>
                </TouchableOpacity>

                {/* Expanded Narration Text */}
                {isExpanded && (
                  <View style={[styles.poiContent, { borderTopColor: colors.separator, backgroundColor: colors.fillTertiary }]}>
                    {poi.image_url ? (
                      <Image
                        source={{ uri: poi.image_local_path || poi.image_url }}
                        style={styles.poiImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={[Typography.caption2, { color: colors.tint, fontWeight: '700', letterSpacing: 1.0, marginBottom: Spacing.sm }]}>NARRATION TEXT</Text>
                    <Text style={[Typography.body, { color: colors.textPrimary, lineHeight: 22, marginBottom: Spacing.base }]}>{poi.narration_text}</Text>
                    <View style={[styles.infoRow, { borderTopColor: colors.separator }]}>
                      <Text style={[Typography.caption1, { color: colors.textSecondary }]}>⏱ Word count: {poi.narration_word_count}</Text>
                      <Text style={[Typography.caption1, { color: colors.textSecondary }]}>🔊 Listen duration: {Math.max(1, Math.round(poi.estimated_listen_minutes))} min</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl * 2,
  },
  // Banner
  banner: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.base,
  },
  bannerIconContainer: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },

  // Empty state
  emptyCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },

  // POI Cards
  poiCard: {
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  poiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
  },
  poiMetaContainer: {
    flex: 1,
  },
  poiHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poiContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.base,
  },
  poiImage: {
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    marginBottom: Spacing.base,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
  },
});
