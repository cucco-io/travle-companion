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
  TouchableOpacity,
  ScrollView,
  Switch,
  Animated,
  ActivityIndicator,
  Platform,
  StatusBar,
  Easing,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTripPreparation, PreparationStage } from '@/src/hooks/useTripPreparation';
import { TripPreferences, TripMode, InterestCategory, NarrationDepth } from '@/src/types/trip';
import { deleteTrip } from '@/src/services/storage/tripStorage';
import { SymbolView } from 'expo-symbols';

import { useAppTheme } from '@/src/theme/ThemeContext';
import {
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  Badge,
  Icon,
} from '@/src/theme/UIComponents';
import { Icons, SymbolName } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

// ─── Interest categories config ───────────────────────────────────────────────
const INTEREST_OPTIONS: { id: InterestCategory; label: string; icon: SymbolName }[] = [
  { id: 'history', label: 'History', icon: Icons.interestHistory },
  { id: 'nature', label: 'Nature', icon: Icons.interestNature },
  { id: 'architecture', label: 'Architecture', icon: Icons.interestArchitecture },
  { id: 'food_culture', label: 'Food & Culture', icon: Icons.interestFoodCulture },
  { id: 'quirky', label: 'Quirky', icon: Icons.interestQuirky },
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
  icon: SymbolName;
};

const PIPELINE_STEPS: PipelineStep[] = [
  { stage: 'fetching_route', label: 'Plotting route...', icon: Icons.route },
  { stage: 'fetching_pois', label: 'Finding points of interest...', icon: Icons.mappinCircle },
  { stage: 'curating', label: 'Curating best POIs...', icon: Icons.wand },
  { stage: 'generating_narrations', label: 'Generating narrations...', icon: Icons.docText },
  { stage: 'synthesizing_audio', label: 'Creating audio...', icon: Icons.speaker },
  { stage: 'caching', label: 'Downloading images...', icon: Icons.storage },
  { stage: 'ready', label: 'Trip ready!', icon: Icons.checkmarkCircle },
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
  const { colors } = useAppTheme();
  const currentIndex = getStageIndex(currentStage);
  const stepIndex = getStageIndex(step.stage);

  // Skip route step if city mode
  if (step.stage === 'fetching_route' && !isRouteMode) return null;

  const isCompleted = stepIndex < currentIndex || currentStage === 'ready';
  const isActive = step.stage === currentStage;
  const isPending = stepIndex > currentIndex && currentStage !== 'ready';

  const fadeAnim = useRef(new Animated.Value(isPending ? 0.4 : 1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isPending ? 0.4 : 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [isPending]);

  const label = isActive ? statusMessage || step.label : step.label;

  return (
    <Animated.View style={[styles.stepItem, { opacity: fadeAnim }]}>
      <View style={[
        styles.stepIconContainer,
        {
          backgroundColor: isCompleted
            ? colors.success + '15'
            : isActive
            ? colors.tint + '15'
            : colors.fillTertiary,
          borderColor: isActive ? colors.tint : 'transparent',
          borderWidth: isActive ? 1 : 0,
        }
      ]}>
        {isActive ? (
          <ActivityIndicator size="small" color={colors.tint} />
        ) : isCompleted ? (
          <SymbolView name={Icons.checkmarkCircle} tintColor={colors.success} size={20} />
        ) : (
          <SymbolView name={step.icon} tintColor={colors.textQuaternary} size={20} />
        )}
      </View>
      <View style={styles.stepContent}>
        <Text style={[
          Typography.subheadline,
          {
            fontWeight: '600',
            color: isCompleted
              ? colors.success
              : isActive
              ? colors.tint
              : colors.textSecondary,
          }
        ]}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function TripPrepareScreen() {
  const router = useRouter();
  const { colors, colorScheme } = useAppTheme();
  const params = useLocalSearchParams<{
    mode?: string;
    tripName?: string;
    destinationName?: string;
    originName?: string;
    tripId?: string;
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
  } = useTripPreparation(params.tripId);

  // ── Derived route params ──────────────────────────────────────────────────
  const tripMode: TripMode = params.mode === 'route' || (trip && trip.mode === 'route') ? 'route' : 'city';
  const tripName = params.tripName ?? (trip ? trip.name : 'My Trip');
  const destinationName = params.destinationName ?? (trip ? trip.destination.name : 'Unknown');
  const originName = params.originName ?? (trip && trip.origin ? trip.origin.name : '');

  // ── Preferences state ─────────────────────────────────────────────────────
  const [interests, setInterests] = useState<InterestCategory[]>(['history', 'architecture']);
  const [narrationDepth, setNarrationDepth] = useState<NarrationDepth>('standard');
  const [kidFriendly, setKidFriendly] = useState(false);
  const [language, setLanguage] = useState('en');

  // Load preferences from existing trip if editing/resuming
  useEffect(() => {
    if (trip && trip.preferences) {
      setInterests(trip.preferences.interests);
      setNarrationDepth(trip.preferences.narration_depth);
      setKidFriendly(trip.preferences.kid_friendly);
      setLanguage(trip.preferences.language);
    }
  }, [trip]);

  // ── Interrupted research state ────────────────────────────────────────────
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const isInterrupted = trip !== null && trip.status === 'preparing' && stage === 'idle' && statusMessage === 'Interrupted';

  const handleDeleteResearch = useCallback(() => {
    if (!trip) return;
    Alert.alert(
      'Delete Trip?',
      `"${trip.name}" and all its partial data will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrip(trip.id);
              router.back();
            } catch {
              Alert.alert('Error', 'Could not delete the trip.');
            }
          },
        },
      ]
    );
  }, [trip, router]);

  // ── Phase state ──────────────────────────────────────────────────────────
  const isPipelinePhase = stage !== 'idle' && stage !== 'error';
  const isError = stage === 'error';
  const isReady = stage === 'ready';

  // ── Animations ────────────────────────────────────────────────────────────
  const formFadeAnim = useRef(new Animated.Value(1)).current;
  const pipelineFadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
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

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Prepare Trip',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Trip info banner ───────────────────────────────────────── */}
          <View style={[styles.tripInfoBanner, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
            <View style={styles.tripInfoLeft}>
              <Text style={[styles.tripInfoName, { color: colors.textPrimary }]}>{tripName}</Text>
              <View style={styles.bannerRow}>
                <SymbolView name={tripMode === 'route' ? Icons.route : Icons.city} tintColor={colors.tint} size={13} style={{ marginRight: 4 }} />
                <Text style={[styles.tripInfoMode, { color: colors.tint }]}>
                  {tripMode === 'city' ? 'City Mode' : 'Route Mode'}
                </Text>
              </View>
            </View>
            <View style={styles.tripInfoRight}>
              {tripMode === 'route' && !!originName && (
                <Text style={[styles.tripInfoRoute, { color: colors.textSecondary }]} numberOfLines={1}>{originName}</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' }}>
                <SymbolView name={Icons.mappin} tintColor={colors.textSecondary} size={13} style={{ marginRight: 4 }} />
                <Text style={[styles.tripInfoDest, { color: colors.textSecondary }]} numberOfLines={1}>{destinationName}</Text>
              </View>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              Research Interrupted View
              ══════════════════════════════════════════════════════════════ */}
          {isInterrupted && !isEditingPreferences && (
            <View style={[styles.errorCard, { backgroundColor: colors.cardBackground, borderColor: colors.destructive + '30' }]}>
              <SymbolView name={Icons.warningTriangle} tintColor={colors.destructive} size={48} style={{ marginBottom: Spacing.md }} />
              <Text style={[Typography.title3, { color: colors.destructive, marginBottom: Spacing.sm }]}>Research Interrupted</Text>
              <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl }]}>
                The preparation for this trip was stopped or failed previously. You can resume researching, modify your preferences, or delete this trip.
              </Text>
              
              <PrimaryButton
                title="Resume Research"
                icon={Icons.arrowClockwise}
                onPress={retryPreparation}
                style={{ width: '100%' }}
              />

              <SecondaryButton
                title="Edit Preferences"
                icon={Icons.pencil}
                onPress={() => setIsEditingPreferences(true)}
                style={{ width: '100%', marginTop: Spacing.md }}
              />

              <DestructiveButton
                title="Delete Trip"
                icon={Icons.trash}
                onPress={handleDeleteResearch}
                style={{ width: '100%', marginTop: Spacing.md }}
              />

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={[Typography.subheadline, { fontWeight: '600', color: colors.textSecondary }]}>Go Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PHASE 1: Preferences Form
              ══════════════════════════════════════════════════════════════ */}
          {!isPipelinePhase && !isError && (!isInterrupted || isEditingPreferences) && (
            <Animated.View style={{ opacity: formFadeAnim }}>
              {/* Interest categories */}
              <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
                <Text style={[Typography.headline, { color: colors.textPrimary, marginBottom: Spacing.xs }]}>What interests you?</Text>
                <Text style={[Typography.footnote, { color: colors.textSecondary, marginBottom: Spacing.md }]}>Select all that apply</Text>
                <View style={styles.chipsRow}>
                  {INTEREST_OPTIONS.map((opt) => {
                    const selected = interests.includes(opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? colors.tint : colors.fillTertiary,
                            borderColor: selected ? colors.tint : colors.cardBorder,
                          }
                        ]}
                        onPress={() => toggleInterest(opt.id)}
                        activeOpacity={0.7}
                      >
                        <SymbolView name={opt.icon} tintColor={selected ? colors.buttonPrimaryText : colors.textSecondary} size={16} />
                        <Text style={[
                          Typography.subheadline,
                          {
                            fontWeight: '600',
                            color: selected ? colors.buttonPrimaryText : colors.textPrimary,
                          }
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Narration depth */}
              <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
                <Text style={[Typography.headline, { color: colors.textPrimary, marginBottom: Spacing.md }]}>Narration depth</Text>
                <View style={styles.depthRow}>
                  {DEPTH_OPTIONS.map((opt) => {
                    const selected = narrationDepth === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.depthOption,
                          {
                            backgroundColor: selected ? colors.tint : colors.fillTertiary,
                            borderColor: selected ? colors.tint : colors.cardBorder,
                          }
                        ]}
                        onPress={() => setNarrationDepth(opt.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          Typography.subheadline,
                          {
                            fontWeight: '700',
                            color: selected ? colors.buttonPrimaryText : colors.textPrimary,
                            marginBottom: 2,
                          }
                        ]}>
                          {opt.label}
                        </Text>
                        <Text style={[
                          Typography.caption2,
                          {
                            color: selected ? colors.buttonPrimaryText : colors.textSecondary,
                            opacity: 0.8,
                          }
                        ]}>
                          {opt.desc}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Kid-friendly toggle */}
              <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLeft}>
                    <Text style={[Typography.headline, { color: colors.textPrimary, marginBottom: Spacing.xs }]}>Kid-friendly mode</Text>
                    <Text style={[Typography.footnote, { color: colors.textSecondary }]}>
                      Simpler language, family-safe content
                    </Text>
                  </View>
                  <Switch
                    value={kidFriendly}
                    onValueChange={setKidFriendly}
                    trackColor={{ false: colors.fillSecondary, true: colors.tint }}
                    thumbColor={Platform.OS === 'ios' ? undefined : colors.backgroundElevated}
                  />
                </View>
              </View>

              {/* Language picker */}
              <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
                <Text style={[Typography.headline, { color: colors.textPrimary, marginBottom: Spacing.xs }]}>Language</Text>
                <Text style={[Typography.footnote, { color: colors.textSecondary, marginBottom: Spacing.md }]}>Choose output narration language</Text>
                <View style={styles.languageRow}>
                  {LANGUAGE_OPTIONS.map((opt) => {
                    const selected = language === opt.code;
                    return (
                      <TouchableOpacity
                        key={opt.code}
                        style={[
                          styles.langChip,
                          {
                            backgroundColor: selected ? colors.tintSecondary : colors.fillTertiary,
                            borderColor: selected ? colors.tintSecondary : colors.cardBorder,
                          }
                        ]}
                        onPress={() => setLanguage(opt.code)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.langFlag}>{opt.flag}</Text>
                        <Text style={[
                          Typography.footnote,
                          {
                            fontWeight: '600',
                            color: selected ? colors.buttonPrimaryText : colors.textPrimary,
                          }
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Prepare Trip Button */}
              <PrimaryButton
                title="Prepare Trip"
                icon={Icons.wand}
                onPress={handlePrepareTripPress}
                style={{ marginTop: Spacing.md }}
              />
            </Animated.View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PHASE 2: Pipeline Progress
              ══════════════════════════════════════════════════════════════ */}
          {isPipelinePhase && (
            <Animated.View style={{ opacity: pipelineFadeAnim }}>
              {/* Overall progress bar */}
              <View style={styles.overallProgressContainer}>
                <View style={[styles.overallProgressTrack, { backgroundColor: colors.fillSecondary }]}>
                  <Animated.View
                    style={[styles.overallProgressFill, { width: progressWidth, backgroundColor: colors.tint }]}
                  />
                </View>
                <Text style={[Typography.headline, { color: colors.tint, width: 44, textAlign: 'right' }]}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>

              {/* Steps list */}
              <View style={[styles.stepsCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
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
                    {
                      transform: [{ scale: successScaleAnim }],
                      backgroundColor: colors.cardBackground,
                      borderColor: colors.success + '40',
                    },
                  ]}
                >
                  <SymbolView name={Icons.checkmarkCircle} tintColor={colors.success} size={56} style={{ marginBottom: Spacing.md }} />
                  <Text style={[Typography.title1, { color: colors.textPrimary, marginBottom: Spacing.xs }]}>Trip Ready!</Text>
                  <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.sm, textAlign: 'center' }]}>{statusMessage}</Text>
                  {poiCount > 0 && (
                    <Text style={[Typography.subheadline, { color: colors.tint, fontWeight: '600', marginBottom: Spacing.md }]}>
                      {poiCount} points of interest ready to explore
                    </Text>
                  )}
                  <View style={[styles.offlineReadyBadge, { backgroundColor: colors.success + '15', borderColor: colors.success, borderWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[Typography.caption1, { fontWeight: '700', color: colors.success }]}>Offline Ready</Text>
                  </View>
                  <PrimaryButton
                    title="Start Trip"
                    icon={Icons.trips}
                    onPress={handleStartTrip}
                    style={{ width: '100%' }}
                  />
                  <SecondaryButton
                    title="Preview Research"
                    icon={Icons.docText}
                    onPress={() => {
                      if (trip) {
                        router.push(`/trip/preview?tripId=${trip.id}`);
                      }
                    }}
                    style={{ width: '100%', marginTop: Spacing.md }}
                  />
                </Animated.View>
              )}

              {/* Cancel button (while pipeline is running) */}
              {!isReady && isCancellable && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={cancelPreparation}
                  activeOpacity={0.7}
                >
                  <Text style={[Typography.subheadline, { fontWeight: '600', color: colors.destructive }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              Error State
              ══════════════════════════════════════════════════════════════ */}
          {isError && (
            <View style={[styles.errorCard, { backgroundColor: colors.cardBackground, borderColor: colors.destructive + '30' }]}>
              <SymbolView name={Icons.warningTriangle} tintColor={colors.destructive} size={48} style={{ marginBottom: Spacing.md }} />
              <Text style={[Typography.title2, { color: colors.destructive, marginBottom: Spacing.sm }]}>Something went wrong</Text>
              <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 20 }]}>{error}</Text>
              <PrimaryButton
                title="Retry"
                icon={Icons.arrowClockwise}
                onPress={retryPreparation}
                style={{ width: '100%' }}
              />
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={[Typography.subheadline, { fontWeight: '600', color: colors.textSecondary }]}>Go Back</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: Spacing['2xl'] }} />
        </ScrollView>
      </View>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl * 2,
    paddingTop: Spacing.base,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  // Trip info banner
  tripInfoBanner: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripInfoLeft: {
    flex: 1,
  },
  tripInfoName: {
    ...Typography.headline,
    fontWeight: '800',
  },
  tripInfoMode: {
    ...Typography.caption1,
    fontWeight: '600',
  },
  tripInfoRight: {
    alignItems: 'flex-end',
    maxWidth: '45%',
  },
  tripInfoRoute: {
    ...Typography.caption2,
    marginBottom: 2,
  },
  tripInfoDest: {
    ...Typography.caption1,
    fontWeight: '600',
    textAlign: 'right',
  },

  // Sections
  section: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Interest chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },

  // Narration depth
  depthRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  depthOption: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },

  // Language chips
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },
  langFlag: {
    fontSize: 16,
  },

  // Buttons
  cancelButton: {
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },

  // Overall progress bar
  overallProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  overallProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: 8,
    borderRadius: 4,
  },

  // Steps card
  stepsCard: {
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.base,
    gap: Spacing.md,
  },

  // Step item
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
  },

  // Success card
  successCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  offlineReadyBadge: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    marginBottom: Spacing.xl,
  },

  // Error card
  errorCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.base,
  },
});
