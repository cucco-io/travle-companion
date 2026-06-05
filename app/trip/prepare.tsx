/**
 * app/trip/prepare.tsx
 *
 * Trip Preparation Screen — two-phase UI:
 *
 * Phase 1: Preferences form
 *   - Interest category chips (multi-select)
 *   - Narration depth radio group
 *   - Kid-friendly toggle
 *   - Language picker
 *   - "Prepare Trip" button
 *
 * Phase 2: Animated pipeline progress
 *   - Step-by-step progress with status messages
 *   - Spinner + progress bar per step
 *   - Smooth animated transitions
 *   - Error state with retry button
 *   - Cancel button
 *   - Success state with "Start Trip" button
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Animated,
  ActivityIndicator,
  Platform,
  StatusBar,
  Easing,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTripPreparation, PreparationStage } from '@/src/hooks/useTripPreparation';
import { TripPreferences, TripMode, InterestCategory, NarrationDepth } from '@/src/types/trip';

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

// ─── Interest categories config ───────────────────────────────────────────────
const INTEREST_OPTIONS: { id: InterestCategory; label: string; emoji: string }[] = [
  { id: 'history', label: 'History', emoji: '🏛️' },
  { id: 'nature', label: 'Nature', emoji: '🌿' },
  { id: 'architecture', label: 'Architecture', emoji: '🏗️' },
  { id: 'food_culture', label: 'Food & Culture', emoji: '🍽️' },
  { id: 'quirky', label: 'Quirky', emoji: '🎭' },
];

// ─── Narration depth options ──────────────────────────────────────────────────
const DEPTH_OPTIONS: { id: NarrationDepth; label: string; desc: string }[] = [
  { id: 'brief', label: 'Brief', desc: '~2–3 min' },
  { id: 'standard', label: 'Standard', desc: '~5–8 min' },
  { id: 'deep_dive', label: 'Deep Dive', desc: '~8–12 min' },
];

// ─── Language options ─────────────────────────────────────────────────────────
const LANGUAGE_OPTIONS: { code: string; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

// ─── Pipeline step config ─────────────────────────────────────────────────────
type PipelineStep = {
  stage: PreparationStage;
  label: string;
  icon: string;
};

const PIPELINE_STEPS: PipelineStep[] = [
  { stage: 'fetching_route', label: 'Plotting route...', icon: '🗺️' },
  { stage: 'fetching_pois', label: 'Finding points of interest...', icon: '📍' },
  { stage: 'curating', label: 'Curating best POIs...', icon: '✨' },
  { stage: 'generating_narrations', label: 'Generating narrations...', icon: '🎙️' },
  { stage: 'synthesizing_audio', label: 'Creating audio...', icon: '🔊' },
  { stage: 'caching', label: 'Downloading images...', icon: '📸' },
  { stage: 'ready', label: 'Trip ready!', icon: '🎉' },
];

// ─── Stage ordering ────────────────────────────────────────────────────────────
const STAGE_ORDER: PreparationStage[] = [
  'fetching_route',
  'fetching_pois',
  'curating',
  'generating_narrations',
  'synthesizing_audio',
  'caching',
  'ready',
];

function getStageIndex(stage: PreparationStage): number {
  return STAGE_ORDER.indexOf(stage);
}

// ─── Step Item Component ──────────────────────────────────────────────────────
function PipelineStepItem({
  step,
  currentStage,
  statusMessage,
  isRouteMode,
}: {
  step: PipelineStep;
  currentStage: PreparationStage;
  statusMessage: string;
  isRouteMode: boolean;
}) {
  const currentIndex = getStageIndex(currentStage);
  const stepIndex = getStageIndex(step.stage);

  // Skip route step if city mode
  if (step.stage === 'fetching_route' && !isRouteMode) return null;

  const isCompleted = stepIndex < currentIndex || currentStage === 'ready';
  const isActive = step.stage === currentStage;
  const isPending = stepIndex > currentIndex && currentStage !== 'ready';

  const spinAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(isPending ? 0.4 : 1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [isActive]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isPending ? 0.4 : 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [isPending]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const label = isActive ? statusMessage || step.label : step.label;

  return (
    <Animated.View style={[styles.stepItem, { opacity: fadeAnim }]}>
      <View style={[
        styles.stepIconContainer,
        isCompleted && styles.stepIconCompleted,
        isActive && styles.stepIconActive,
      ]}>
        {isActive ? (
          <Animated.Text style={[styles.stepEmoji, { transform: [{ rotate: spin }] }]}>
            ⚙️
          </Animated.Text>
        ) : isCompleted ? (
          <Text style={styles.stepEmoji}>✅</Text>
        ) : (
          <Text style={[styles.stepEmoji, { opacity: 0.4 }]}>{step.icon}</Text>
        )}
      </View>
      <View style={styles.stepContent}>
        <Text style={[
          styles.stepLabel,
          isCompleted && styles.stepLabelCompleted,
          isActive && styles.stepLabelActive,
          isPending && styles.stepLabelPending,
        ]}>
          {label}
        </Text>
        {isActive && (
          <View style={styles.stepProgressBar}>
            <Animated.View
              style={[
                styles.stepProgressFill,
                { width: '60%' },
              ]}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function TripPrepareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    tripName?: string;
    destinationName?: string;
    originName?: string;
  }>();

  const {
    stage,
    progress,
    statusMessage,
    poiCount,
    trip,
    error,
    isCancellable,
    startPreparation,
    cancelPreparation,
    retryPreparation,
  } = useTripPreparation();

  // ── Derived route params ──────────────────────────────────────────────────
  const tripMode: TripMode = params.mode === 'route' ? 'route' : 'city';
  const tripName = params.tripName ?? 'My Trip';
  const destinationName = params.destinationName ?? 'Unknown';
  const originName = params.originName ?? '';

  // ── Preferences state ─────────────────────────────────────────────────────
  const [interests, setInterests] = useState<InterestCategory[]>(['history', 'architecture']);
  const [narrationDepth, setNarrationDepth] = useState<NarrationDepth>('standard');
  const [kidFriendly, setKidFriendly] = useState(false);
  const [language, setLanguage] = useState('en');

  // ── Phase state ──────────────────────────────────────────────────────────
  const isPipelinePhase = stage !== 'idle' && stage !== 'error';
  const isError = stage === 'error';
  const isReady = stage === 'ready';

  // ── Animations ────────────────────────────────────────────────────────────
  const formFadeAnim = useRef(new Animated.Value(1)).current;
  const pipelineFadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPipelinePhase) {
      // Fade out form, fade in pipeline
      Animated.parallel([
        Animated.timing(formFadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(pipelineFadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isPipelinePhase]);

  useEffect(() => {
    if (isReady) {
      Animated.spring(successScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [isReady]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ── Interest toggle ────────────────────────────────────────────────────────
  const toggleInterest = useCallback((cat: InterestCategory) => {
    setInterests((prev) => {
      if (prev.includes(cat)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((c) => c !== cat);
      }
      return [...prev, cat];
    });
  }, []);

  // ── Handle start ──────────────────────────────────────────────────────────
  const handlePrepareTripPress = useCallback(() => {
    const prefs: TripPreferences = {
      interests,
      narration_depth: narrationDepth,
      kid_friendly: kidFriendly,
      language,
    };

    if (tripMode === 'city') {
      startPreparation({
        name: tripName,
        mode: 'city',
        destination: {
          name: destinationName,
          lat: 0, // coordinates resolved by services
          lng: 0,
        },
        preferences: prefs,
      });
    } else {
      startPreparation({
        name: tripName,
        mode: 'route',
        origin: {
          name: originName,
          lat: 0,
          lng: 0,
        },
        destination: {
          name: destinationName,
          lat: 0,
          lng: 0,
        },
        preferences: prefs,
      });
    }
  }, [interests, narrationDepth, kidFriendly, language, tripMode, tripName, destinationName, originName, startPreparation]);

  // ── Navigate to active trip ──────────────────────────────────────────────
  const handleStartTrip = useCallback(() => {
    if (!trip) return;
    router.replace({
      pathname: '/trip/active',
      params: { tripId: trip.id },
    });
  }, [trip, router]);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Prepare Trip',
          headerStyle: { backgroundColor: COLORS.navy },
          headerTintColor: COLORS.white,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" />

        {/* Decorative bg circles */}
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Trip info banner ───────────────────────────────────────── */}
          <View style={styles.tripInfoBanner}>
            <View style={styles.tripInfoLeft}>
              <Text style={styles.tripInfoName}>{tripName}</Text>
              <Text style={styles.tripInfoMode}>
                {tripMode === 'city' ? '🏙 City Mode' : '🛣 Route Mode'}
              </Text>
            </View>
            <View style={styles.tripInfoRight}>
              {tripMode === 'route' && !!originName && (
                <Text style={styles.tripInfoRoute}>{originName}</Text>
              )}
              <Text style={styles.tripInfoDest}>📍 {destinationName}</Text>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              PHASE 1: Preferences Form
              ══════════════════════════════════════════════════════════════ */}
          {!isPipelinePhase && !isError && (
            <Animated.View style={{ opacity: formFadeAnim }}>
              {/* Interest categories */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎯 What interests you?</Text>
                <Text style={styles.sectionSubtitle}>Select all that apply</Text>
                <View style={styles.chipsRow}>
                  {INTEREST_OPTIONS.map((opt) => {
                    const selected = interests.includes(opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => toggleInterest(opt.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Narration depth */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎙️ Narration depth</Text>
                <View style={styles.depthRow}>
                  {DEPTH_OPTIONS.map((opt) => {
                    const selected = narrationDepth === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.depthOption, selected && styles.depthOptionSelected]}
                        onPress={() => setNarrationDepth(opt.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.depthLabel, selected && styles.depthLabelSelected]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.depthDesc, selected && styles.depthDescSelected]}>
                          {opt.desc}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Kid-friendly toggle */}
              <View style={styles.section}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLeft}>
                    <Text style={styles.sectionTitle}>👶 Kid-friendly mode</Text>
                    <Text style={styles.sectionSubtitle}>
                      Simpler language, family-safe content
                    </Text>
                  </View>
                  <Switch
                    value={kidFriendly}
                    onValueChange={setKidFriendly}
                    trackColor={{ false: COLORS.whiteAlpha20, true: COLORS.teal }}
                    thumbColor={kidFriendly ? COLORS.white : COLORS.whiteAlpha50}
                  />
                </View>
              </View>

              {/* Language picker */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🌍 Language</Text>
                <View style={styles.languageRow}>
                  {LANGUAGE_OPTIONS.map((opt) => {
                    const selected = language === opt.code;
                    return (
                      <TouchableOpacity
                        key={opt.code}
                        style={[styles.langChip, selected && styles.langChipSelected]}
                        onPress={() => setLanguage(opt.code)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.langFlag}>{opt.flag}</Text>
                        <Text style={[styles.langLabel, selected && styles.langLabelSelected]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Prepare Trip Button */}
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handlePrepareTripPress}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>🚀 Prepare Trip</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PHASE 2: Pipeline Progress
              ══════════════════════════════════════════════════════════════ */}
          {isPipelinePhase && (
            <Animated.View style={{ opacity: pipelineFadeAnim }}>
              {/* Overall progress bar */}
              <View style={styles.overallProgressContainer}>
                <View style={styles.overallProgressTrack}>
                  <Animated.View
                    style={[styles.overallProgressFill, { width: progressWidth }]}
                  />
                </View>
                <Text style={styles.overallProgressLabel}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>

              {/* Steps list */}
              <View style={styles.stepsCard}>
                {PIPELINE_STEPS.map((step) => (
                  <PipelineStepItem
                    key={step.stage}
                    step={step}
                    currentStage={stage}
                    statusMessage={statusMessage}
                    isRouteMode={tripMode === 'route'}
                  />
                ))}
              </View>

              {/* Success state */}
              {isReady && (
                <Animated.View
                  style={[
                    styles.successCard,
                    { transform: [{ scale: successScaleAnim }] },
                  ]}
                >
                  <Text style={styles.successEmoji}>🎉</Text>
                  <Text style={styles.successTitle}>Trip Ready!</Text>
                  <Text style={styles.successSubtitle}>{statusMessage}</Text>
                  {poiCount > 0 && (
                    <Text style={styles.successPoiCount}>
                      {poiCount} points of interest ready to explore
                    </Text>
                  )}
                  <View style={styles.offlineReadyBadge}>
                    <Text style={styles.offlineReadyText}>✅ Offline Ready</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleStartTrip}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>🗺️ Start Trip</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Cancel button (while pipeline is running) */}
              {!isReady && isCancellable && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={cancelPreparation}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              Error State
              ══════════════════════════════════════════════════════════════ */}
          {isError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorTitle}>Something went wrong</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={retryPreparation}
                activeOpacity={0.8}
              >
                <Text style={styles.retryButtonText}>🔄 Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  bgCircle1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: COLORS.tealDark,
    opacity: 0.07,
    top: -60,
    right: -80,
  },
  bgCircle2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.gold,
    opacity: 0.05,
    bottom: 100,
    left: -60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
  },

  // Trip info banner
  tripInfoBanner: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripInfoLeft: {
    flex: 1,
  },
  tripInfoName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 4,
  },
  tripInfoMode: {
    fontSize: 13,
    color: COLORS.teal,
    fontWeight: '600',
  },
  tripInfoRight: {
    alignItems: 'flex-end',
    maxWidth: '45%',
  },
  tripInfoRoute: {
    fontSize: 12,
    color: COLORS.whiteAlpha50,
    marginBottom: 2,
  },
  tripInfoDest: {
    fontSize: 13,
    color: COLORS.whiteAlpha80,
    fontWeight: '600',
    textAlign: 'right',
  },

  // Sections
  section: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.whiteAlpha50,
    marginBottom: 12,
  },

  // Interest chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: COLORS.whiteAlpha10,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: COLORS.tealDark,
    borderColor: COLORS.teal,
  },
  chipEmoji: {
    fontSize: 16,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.whiteAlpha80,
  },
  chipLabelSelected: {
    color: COLORS.white,
  },

  // Narration depth
  depthRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  depthOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: COLORS.whiteAlpha10,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
    alignItems: 'center',
  },
  depthOptionSelected: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.goldLight,
  },
  depthLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.whiteAlpha80,
    marginBottom: 2,
  },
  depthLabelSelected: {
    color: COLORS.navy,
  },
  depthDesc: {
    fontSize: 11,
    color: COLORS.whiteAlpha50,
  },
  depthDescSelected: {
    color: COLORS.navy,
    opacity: 0.7,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLeft: {
    flex: 1,
    marginRight: 12,
  },

  // Language chips
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: COLORS.whiteAlpha10,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
    gap: 6,
  },
  langChipSelected: {
    backgroundColor: COLORS.purple,
    borderColor: '#C4B5FD',
  },
  langFlag: {
    fontSize: 18,
  },
  langLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.whiteAlpha80,
  },
  langLabelSelected: {
    color: COLORS.white,
  },

  // Buttons
  primaryButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.navy,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.whiteAlpha50,
  },
  retryButton: {
    backgroundColor: COLORS.tealDark,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Overall progress bar
  overallProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  overallProgressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.whiteAlpha20,
    borderRadius: 4,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: 8,
    backgroundColor: COLORS.teal,
    borderRadius: 4,
  },
  overallProgressLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.teal,
    width: 38,
    textAlign: 'right',
  },

  // Steps card
  stepsCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    marginBottom: 16,
    gap: 14,
  },

  // Step item
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.whiteAlpha10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconCompleted: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  stepIconActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.teal,
  },
  stepEmoji: {
    fontSize: 20,
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.whiteAlpha80,
  },
  stepLabelActive: {
    color: COLORS.teal,
    fontWeight: '700',
  },
  stepLabelCompleted: {
    color: COLORS.green,
  },
  stepLabelPending: {
    color: COLORS.whiteAlpha50,
  },
  stepProgressBar: {
    height: 3,
    backgroundColor: COLORS.whiteAlpha20,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  stepProgressFill: {
    height: 3,
    backgroundColor: COLORS.teal,
    borderRadius: 2,
  },

  // Success card
  successCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    marginBottom: 16,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  successEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 15,
    color: COLORS.whiteAlpha80,
    marginBottom: 8,
    textAlign: 'center',
  },
  successPoiCount: {
    fontSize: 14,
    color: COLORS.teal,
    fontWeight: '600',
    marginBottom: 14,
  },
  offlineReadyBadge: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  offlineReadyText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.navy,
  },

  // Error card
  errorCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    marginBottom: 16,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.error,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: COLORS.whiteAlpha80,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
});
