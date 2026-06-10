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
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getTripById } from '@/src/services/storage/tripStorage';
import { useNarrationPlayer } from '@/src/hooks/useNarrationPlayer';
import { Trip } from '@/src/types/trip';
import { POI } from '@/src/types/poi';

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
  green: '#34D399',
  purple: '#A78BFA',
} as const;

function categoryIcon(cat: POI['category']): string {
  const map: Record<POI['category'], string> = {
    historical_landmark: '🏛️',
    museum: '🏛️',
    church: '⛪',
    park: '🌿',
    natural_landmark: '🏔️',
    monument: '🗿',
    cultural_site: '🎭',
    quirky: '🎪',
    other: '📍',
  };
  return map[cat] ?? '📍';
}

export default function ResearchPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ?? '';

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
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: 'Research Preview' }} />
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading research data...</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: 'Research Preview' }} />
        <Text style={styles.errorText}>Trip not found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Filter for POIs that have some narration text generated
  const finishedPOIs = trip.pois.filter((p) => p.narration_text && p.narration_text.length > 0 && p.narration_text !== 'Failed to generate narration');

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Stack.Screen
        options={{
          title: 'Research Preview',
          headerStyle: { backgroundColor: COLORS.navy },
          headerTintColor: COLORS.white,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerEmoji}>📚</Text>
          <Text style={styles.bannerTitle}>{trip.name}</Text>
          <Text style={styles.bannerSubtitle}>
            📍 {trip.destination.name} · {finishedPOIs.length} Points of Interest
          </Text>
        </View>

        {finishedPOIs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>⏳</Text>
            <Text style={styles.emptyTitle}>No research content finished yet</Text>
            <Text style={styles.emptySubtitle}>
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
              <View key={poi.id} style={[styles.poiCard, isCurrent && styles.poiCardActive]}>
                {/* POI Info row */}
                <TouchableOpacity
                  style={styles.poiHeader}
                  onPress={() => toggleExpand(poi.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.poiIcon}>{categoryIcon(poi.category)}</Text>
                  <View style={styles.poiMetaContainer}>
                    <Text style={styles.poiName} numberOfLines={1}>{poi.name}</Text>
                    <Text style={styles.poiDetails}>
                      {poi.category.replace(/_/g, ' ')} · ⭐ {poi.rating.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.poiHeaderRight}>
                    {/* Audio Play/Pause button */}
                    <TouchableOpacity
                      style={[
                        styles.playButton,
                        isPlaying && styles.playButtonPlaying,
                        isLoading && styles.playButtonLoading,
                      ]}
                      onPress={() => handlePlayPress(poi)}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={COLORS.navy} />
                      ) : (
                        <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {/* Expanded Narration Text */}
                {isExpanded && (
                  <View style={styles.poiContent}>
                    {poi.image_url ? (
                      <Image
                        source={{ uri: poi.image_local_path || poi.image_url }}
                        style={styles.poiImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={styles.poiLabel}>NARRATION TEXT</Text>
                    <Text style={styles.narrationText}>{poi.narration_text}</Text>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoText}>⏱ Word count: {poi.narration_word_count}</Text>
                      <Text style={styles.infoText}>🔊 Listen duration: {Math.max(1, Math.round(poi.estimated_listen_minutes))} min</Text>
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
    backgroundColor: COLORS.navy,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingText: {
    color: COLORS.whiteAlpha80,
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: COLORS.tealDark,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },

  // Banner
  banner: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    marginBottom: 20,
  },
  bannerEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: COLORS.teal,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.whiteAlpha50,
    textAlign: 'center',
    lineHeight: 20,
  },

  // POI Cards
  poiCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    overflow: 'hidden',
  },
  poiCardActive: {
    borderColor: COLORS.gold,
  },
  poiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  poiIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 32,
    textAlign: 'center',
  },
  poiMetaContainer: {
    flex: 1,
  },
  poiName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  poiDetails: {
    fontSize: 13,
    color: COLORS.whiteAlpha50,
    textTransform: 'capitalize',
  },
  poiHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonPlaying: {
    backgroundColor: COLORS.teal,
  },
  playButtonLoading: {
    backgroundColor: COLORS.whiteAlpha20,
  },
  playButtonText: {
    fontSize: 16,
    color: COLORS.navy,
    fontWeight: '800',
    textAlign: 'center',
  },
  chevron: {
    fontSize: 10,
    color: COLORS.whiteAlpha50,
    width: 14,
    textAlign: 'center',
  },
  poiContent: {
    borderTopWidth: 1,
    borderTopColor: COLORS.whiteAlpha10,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  poiImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 16,
  },
  poiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.teal,
    letterSpacing: 1.0,
    marginBottom: 8,
  },
  narrationText: {
    fontSize: 14,
    color: COLORS.whiteAlpha80,
    lineHeight: 22,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.whiteAlpha10,
    paddingTop: 12,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.whiteAlpha50,
  },
});
