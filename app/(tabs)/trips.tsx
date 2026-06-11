/**
 * app/(tabs)/trips.tsx
 *
 * Trip History Screen — lists all trips sorted newest-first.
 * Supports pull-to-refresh, swipe-to-delete, and tap navigation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAllTrips, deleteTrip, updateTripName, getAllResearchedPOIs } from '@/src/services/storage/tripStorage';
import type { Trip } from '@/src/types/trip';
import type { POI } from '@/src/types/poi';
import { manager } from '@/src/services/api/preparationManager';
import * as Speech from 'expo-speech';
import { SymbolView } from 'expo-symbols';

import { useAppTheme } from '@/src/theme/ThemeContext';
import {
  GroupedSection,
  GroupedRow,
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  SegmentedControl,
  Badge,
  Icon,
} from '@/src/theme/UIComponents';
import { Icons, getCategoryIcon } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Swipeable Trip Card ────────────────────────────────────────────────────────
interface TripCardProps {
  trip: Trip & { poi_count?: number };
  onDelete: (id: string, name: string) => void;
  onPress: (trip: Trip) => void;
  activePrep?: { stage: string; progress: number; statusMessage: string };
  onStopPrep?: (id: string) => void;
}

function TripCard({ trip, onDelete, onPress, activePrep, onStopPrep }: TripCardProps) {
  const { colors } = useAppTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(Math.max(g.dx, -100));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          // Snap to reveal delete button
          Animated.spring(translateX, {
            toValue: -80,
            useNativeDriver: true,
          }).start();
          setSwiped(true);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          setSwiped(false);
        }
      },
    })
  ).current;

  const closeSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    setSwiped(false);
  }, [translateX]);

  const poiCount = (trip as Trip & { poi_count?: number }).poi_count ?? trip.pois.length;

  return (
    <View style={cardStyles.wrapper}>
      {/* Delete reveal */}
      <View style={[cardStyles.deleteReveal, { backgroundColor: colors.destructive }]}>
        <TouchableOpacity
          style={cardStyles.deleteBtn}
          onPress={() => {
            closeSwipe();
            onDelete(trip.id, trip.name);
          }}
        >
          <SymbolView name={Icons.trash} tintColor="#FFFFFF" size={20} />
          <Text style={cardStyles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Main card */}
      <Animated.View
        style={[
          cardStyles.card,
          {
            transform: [{ translateX }],
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (swiped) {
              closeSwipe();
              return;
            }
            onPress(trip);
          }}
          style={cardStyles.inner}
        >
          {/* Top row: name + status */}
          <View style={cardStyles.topRow}>
            <Text style={[cardStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {trip.name}
            </Text>
            {activePrep ? (
              <Badge
                label="Researching"
                color={colors.backgroundElevated}
                backgroundColor={colors.warning}
              />
            ) : trip.status === 'preparing' ? (
              <Badge
                label="Interrupted"
                color={colors.backgroundElevated}
                backgroundColor={colors.destructive}
              />
            ) : trip.status === 'ready' ? (
              <Badge
                label="Ready"
                color={colors.backgroundElevated}
                backgroundColor={colors.success}
              />
            ) : trip.status === 'active' ? (
              <Badge
                label="Active"
                color={colors.backgroundElevated}
                backgroundColor={colors.tint}
              />
            ) : (
              <Badge
                label="Completed"
                color={colors.textSecondary}
                backgroundColor={colors.fillSecondary}
              />
            )}
          </View>

          {/* Destination */}
          <View style={cardStyles.destRow}>
            <SymbolView name={Icons.mappin} tintColor={colors.textSecondary} size={13} style={{ marginRight: 4 }} />
            <Text style={[cardStyles.dest, { color: colors.textSecondary }]} numberOfLines={1}>
              {trip.destination.name}
            </Text>
          </View>

          {/* Active Preparation Progress Bar */}
          {activePrep && (
            <View style={cardStyles.progressWrapper}>
              <Text style={[cardStyles.progressStatusText, { color: colors.tint }]} numberOfLines={1}>
                {activePrep.statusMessage}
              </Text>
              <View style={cardStyles.progressContainer}>
                <View style={[cardStyles.progressTrack, { backgroundColor: colors.fillSecondary }]}>
                  <View style={[cardStyles.progressFill, { width: `${Math.round(activePrep.progress * 100)}%`, backgroundColor: colors.tint }]} />
                </View>
                <Text style={[cardStyles.progressPctText, { color: colors.textPrimary }]}>{Math.round(activePrep.progress * 100)}%</Text>
                {onStopPrep && (
                  <TouchableOpacity
                    style={[cardStyles.stopButton, { backgroundColor: colors.destructive }]}
                    onPress={() => onStopPrep(trip.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={cardStyles.stopButtonText}>Stop</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Bottom meta row */}
          {!activePrep && (
            <View style={cardStyles.metaRow}>
              <View style={cardStyles.metaItem}>
                <SymbolView name={Icons.calendar} tintColor={colors.textTertiary} size={11} style={{ marginRight: 3 }} />
                <Text style={[cardStyles.metaText, { color: colors.textTertiary }]}>{formatDate(trip.created_at)}</Text>
              </View>
              <View style={cardStyles.metaItem}>
                <SymbolView name={Icons.mappinCircle} tintColor={colors.textTertiary} size={11} style={{ marginRight: 3 }} />
                <Text style={[cardStyles.metaText, { color: colors.textTertiary }]}>
                  {poiCount} POI{poiCount !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={cardStyles.metaItem}>
                <SymbolView name={trip.mode === 'route' ? Icons.route : Icons.city} tintColor={colors.textTertiary} size={11} style={{ marginRight: 3 }} />
                <Text style={[cardStyles.metaText, { color: colors.textTertiary }]}>
                  {trip.mode === 'route' ? 'Route' : 'City'}
                </Text>
              </View>
            </View>
          )}

          {/* Navigate hint */}
          <SymbolView
            name={Icons.chevronRight}
            tintColor={colors.textQuaternary}
            size={14}
            style={cardStyles.chevron}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.sm + 2,
    position: 'relative',
  },
  deleteReveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: Spacing.sm,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  inner: {
    padding: Spacing.base,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingRight: Spacing.md,
  },
  name: {
    ...Typography.headline,
    flex: 1,
    marginRight: Spacing.sm,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingRight: Spacing.md,
  },
  dest: {
    ...Typography.footnote,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    ...Typography.caption2,
  },
  chevron: {
    position: 'absolute',
    right: Spacing.base,
    top: '50%',
    marginTop: -7,
  },
  progressWrapper: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  progressStatusText: {
    ...Typography.caption2,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressPctText: {
    ...Typography.caption2,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },
  stopButton: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  stopButtonText: {
    color: '#FFFFFF',
    ...Typography.caption2,
    fontWeight: '800',
  },
});

// ─── Empty state ────────────────────────────────────────────────────────────────
function EmptyState() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View style={emptyStyles.container}>
      <Icon name={Icons.globe} size={64} color={colors.textQuaternary} style={{ marginBottom: Spacing.base }} />
      <Text style={[Typography.title2, { color: colors.textPrimary, marginBottom: Spacing.sm }]}>No Trips Yet</Text>
      <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl }]}>
        Your travel adventures will appear here.{"\n"}
        Start by exploring a destination!
      </Text>
      <PrimaryButton
        title="Explore Destinations"
        icon={Icons.compass}
        onPress={() => router.push('/(tabs)')}
        style={{ paddingHorizontal: Spacing.xl }}
      />
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl * 2,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['3xl'] * 2,
  },
});

function PlaceCard({ poi, onPress }: { poi: POI; onPress: (poi: POI) => void }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(poi)}
      style={[
        placeCardStyles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      <View style={[placeCardStyles.iconContainer, { backgroundColor: colors.fillTertiary }]}>
        <Icon name={getCategoryIcon(poi.category)} size={20} color={colors.tint} />
      </View>
      <View style={placeCardStyles.content}>
        <Text style={[Typography.subheadline, { fontWeight: '600', color: colors.textPrimary }]} numberOfLines={1}>{poi.name}</Text>
        <Text style={[Typography.footnote, { color: colors.textSecondary, textTransform: 'capitalize', marginTop: 2 }]}>
          {poi.category.replace(/_/g, ' ')} · ⭐ {poi.rating.toFixed(1)}
        </Text>
      </View>
      <View style={[placeCardStyles.action, { backgroundColor: colors.buttonSecondary }]}>
        <Text style={[Typography.caption2, { color: colors.buttonSecondaryText, fontWeight: '700' }]}>View Text</Text>
      </View>
    </TouchableOpacity>
  );
}

const placeCardStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm + 2,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.base,
  },
  content: {
    flex: 1,
    marginRight: Spacing.base,
  },
  action: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
  },
});

// ─── Main screen ────────────────────────────────────────────────────────────────
export default function TripsScreen() {
  const router = useRouter();
  const { colors, colorScheme } = useAppTheme();

  const [trips, setTrips] = useState<(Trip & { poi_count?: number })[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activePreparations, setActivePreparations] = useState<Record<string, any>>({});

  // Library State
  const [activeTab, setActiveTab] = useState<'trips' | 'places'>('trips');
  const [researchedPois, setResearchedPois] = useState<POI[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [poiModalVisible, setPoiModalVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Modal / Sheet State
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

  const loadTrips = useCallback(async () => {
    try {
      const all = await getAllTrips();
      // Sort newest first
      all.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTrips(all as (Trip & { poi_count?: number })[]);

      // Load researched POIs
      const poisList = await getAllResearchedPOIs();
      setResearchedPois(poisList);
    } catch {
      Alert.alert('Error', 'Could not load trips.');
    }
  }, []);

  // Sync active preparations on mount
  useEffect(() => {
    const active = manager.getAllActive();
    setActivePreparations(active);

    const unsubscribe = manager.subscribe((id, state) => {
      setActivePreparations((prev) => {
        const next = { ...prev };
        if (state.stage === 'idle' && state.statusMessage === 'Cancelled') {
          delete next[id];
        } else if (state.stage === 'ready' || state.stage === 'idle') {
          delete next[id];
          // Reload trips when a prep is complete
          loadTrips();
        } else {
          next[id] = state;
        }
        return next;
      });
    });

    return unsubscribe;
  }, [loadTrips]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  }, [loadTrips]);

  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        'Delete Trip?',
        `"${name}" and all its data will be permanently deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Stop preparation if actively running
                manager.stop(id);
                await deleteTrip(id);
                setTrips((prev) => prev.filter((t) => t.id !== id));
                setActionModalVisible(false);
              } catch {
                Alert.alert('Error', 'Could not delete the trip.');
              }
            },
          },
        ]
      );
    },
    []
  );

  const handleStopPrep = useCallback((id: string) => {
    manager.stop(id);
    Alert.alert('Research Stopped', 'City research has been cancelled.');
  }, []);

  const handlePress = useCallback((trip: Trip) => {
    const isActivePreparing = activePreparations[trip.id] !== undefined;
    if (isActivePreparing) {
      router.push(`/trip/prepare?tripId=${trip.id}`);
      return;
    }
    setSelectedTrip(trip);
    setRenameText(trip.name);
    setActionModalVisible(true);
  }, [activePreparations, router]);

  const handleRename = useCallback(async () => {
    if (!selectedTrip || !renameText.trim()) return;
    try {
      await updateTripName(selectedTrip.id, renameText.trim());
      setTrips((prev) =>
        prev.map((t) =>
          t.id === selectedTrip.id ? { ...t, name: renameText.trim() } : t
        )
      );
      setRenameModalVisible(false);
      setActionModalVisible(false);
      setSelectedTrip(null);
    } catch {
      Alert.alert('Error', 'Could not rename the trip.');
    }
  }, [selectedTrip, renameText]);

  const handleReadAloud = useCallback(async () => {
    if (!selectedPoi) return;
    try {
      if (isSpeaking) {
        await Speech.stop();
        setIsSpeaking(false);
      } else {
        setIsSpeaking(true);
        Speech.speak(selectedPoi.narration_text, {
          onDone: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      }
    } catch (err) {
      console.warn('Speech failed:', err);
      setIsSpeaking(false);
    }
  }, [selectedPoi, isSpeaking]);

  const handleClosePoiModal = useCallback(async () => {
    if (isSpeaking) {
      try {
        await Speech.stop();
      } catch (e) {
        // ignore
      }
      setIsSpeaking(false);
    }
    setPoiModalVisible(false);
  }, [isSpeaking]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.background, borderBottomColor: colors.separator }]}>
        <View style={s.headerTop}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            {activeTab === 'trips' ? 'My Trips' : 'Researched Places'}
          </Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            {activeTab === 'trips' 
              ? `${trips.length} trip${trips.length !== 1 ? 's' : ''}`
              : `${researchedPois.length} place${researchedPois.length !== 1 ? 's' : ''}`}
          </Text>
        </View>

        {/* Tab Toggle Row using SegmentedControl */}
        <SegmentedControl
          segments={['Trips', 'Library']}
          selectedIndex={activeTab === 'trips' ? 0 : 1}
          onSelect={(index) => setActiveTab(index === 0 ? 'trips' : 'places')}
          style={{ marginTop: Spacing.sm }}
        />
      </View>

      {activeTab === 'trips' ? (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={[
            s.listContent,
            trips.length === 0 && s.listContentEmpty,
          ]}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onDelete={handleDelete}
              onPress={handlePress}
              activePrep={activePreparations[item.id]}
              onStopPrep={handleStopPrep}
            />
          )}
          ListEmptyComponent={<EmptyState />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={researchedPois}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[
            s.listContent,
            researchedPois.length === 0 && s.listContentEmpty,
          ]}
          renderItem={({ item }) => (
            <PlaceCard
              poi={item}
              onPress={async (poi) => {
                if (isSpeaking) {
                  try { await Speech.stop(); } catch (e) {}
                  setIsSpeaking(false);
                }
                setSelectedPoi(poi);
                setPoiModalVisible(true);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={emptyStyles.container}>
              <Icon name={Icons.docText} size={64} color={colors.textQuaternary} style={{ marginBottom: Spacing.base }} />
              <Text style={[Typography.title2, { color: colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' }]}>
                No Places Researched
              </Text>
              <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Complete trip research to populate your library!
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ─── Manage Trip Action Sheet Modal ─────────────────────────────── */}
      {selectedTrip && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={actionModalVisible}
          onRequestClose={() => setActionModalVisible(false)}
        >
          <TouchableOpacity
            style={s.modalOverlay}
            activeOpacity={1}
            onPress={() => setActionModalVisible(false)}
          >
            <View style={[s.modalSheet, { backgroundColor: colors.backgroundGrouped, borderColor: colors.cardBorder }]}>
              {/* Handle bar */}
              <View style={[s.modalHandle, { backgroundColor: colors.separator }]} />
              
              <Text style={[s.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>{selectedTrip.name}</Text>
              <Text style={[s.modalSubtitle, { color: colors.textSecondary }]}>📍 {selectedTrip.destination.name}</Text>

              <GroupedSection style={{ marginHorizontal: 0 }}>
                {/* Status specific actions */}
                {selectedTrip.status === 'preparing' && (
                  <GroupedRow
                    label="Resume Research"
                    icon={Icons.arrowClockwise}
                    iconColor={colors.tint}
                    onPress={() => {
                      setActionModalVisible(false);
                      router.push(`/trip/prepare?tripId=${selectedTrip.id}`);
                    }}
                  />
                )}

                {selectedTrip.status === 'ready' && (
                  <GroupedRow
                    label="Start Trip"
                    icon={Icons.trips}
                    iconColor={colors.success}
                    onPress={() => {
                      setActionModalVisible(false);
                      router.push(`/trip/active?tripId=${selectedTrip.id}`);
                    }}
                  />
                )}

                {selectedTrip.status === 'active' && (
                  <GroupedRow
                    label="Resume Active Trip"
                    icon={Icons.trips}
                    iconColor={colors.success}
                    onPress={() => {
                      setActionModalVisible(false);
                      router.push(`/trip/active?tripId=${selectedTrip.id}`);
                    }}
                  />
                )}

                {selectedTrip.status === 'completed' && (
                  <GroupedRow
                    label="View Trip Summary"
                    icon={Icons.trophy}
                    iconColor={colors.warning}
                    onPress={() => {
                      setActionModalVisible(false);
                      router.push(`/trip/review?tripId=${selectedTrip.id}`);
                    }}
                  />
                )}

                {/* Preview Research Action */}
                {(selectedTrip.status !== 'preparing' || selectedTrip.pois.length > 0) && (
                  <GroupedRow
                    label="Preview Research (Text & Audio)"
                    icon={Icons.docText}
                    onPress={() => {
                      setActionModalVisible(false);
                      router.push(`/trip/preview?tripId=${selectedTrip.id}`);
                    }}
                  />
                )}

                {/* Rename Trip */}
                <GroupedRow
                  label="Rename Trip"
                  icon={Icons.pencil}
                  onPress={() => setRenameModalVisible(true)}
                />

                {/* Delete Trip */}
                <GroupedRow
                  label="Delete Trip"
                  icon={Icons.trash}
                  destructive
                  showSeparator={false}
                  onPress={() => handleDelete(selectedTrip.id, selectedTrip.name)}
                />
              </GroupedSection>

              {/* Cancel */}
              <SecondaryButton
                title="Cancel"
                onPress={() => setActionModalVisible(false)}
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ─── Rename Modal ───────────────────────────────────────────────── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={renameModalVisible}
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={s.renameModalOverlay}>
          <View style={[s.renameModalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.cardBorder }]}>
            <Text style={[Typography.headline, { color: colors.textPrimary, marginBottom: Spacing.base }]}>Rename Trip</Text>
            <TextInput
              style={[
                s.renameInput,
                {
                  backgroundColor: colors.fillTertiary,
                  borderColor: colors.cardBorder,
                  color: colors.textPrimary,
                },
              ]}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter new trip name..."
              placeholderTextColor={colors.textSecondary}
              selectionColor={colors.tint}
              autoFocus={true}
            />
            <View style={s.renameActions}>
              <TouchableOpacity
                style={s.renameCancelBtn}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={[Typography.subheadline, { fontWeight: '600', color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.renameSaveBtn, { backgroundColor: colors.buttonPrimary }]}
                onPress={handleRename}
              >
                <Text style={[Typography.subheadline, { fontWeight: '700', color: colors.buttonPrimaryText }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Researched POI Text Detail Modal ─────────────────────────── */}
      {selectedPoi && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={poiModalVisible}
          onRequestClose={handleClosePoiModal}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: colors.backgroundGrouped, borderColor: colors.cardBorder, maxHeight: '85%' }]}>
              {/* Handle bar */}
              <View style={[s.modalHandle, { backgroundColor: colors.separator }]} />
              
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {/* Header */}
                <View style={s.poiDetailHeader}>
                  <View style={[s.poiDetailIconContainer, { backgroundColor: colors.fillTertiary }]}>
                    <Icon name={getCategoryIcon(selectedPoi.category)} size={32} color={colors.tint} />
                  </View>
                  <Text style={[Typography.title2, { color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }]}>
                    {selectedPoi.name}
                  </Text>
                  <Text style={[Typography.footnote, { color: colors.textSecondary, textAlign: 'center', textTransform: 'capitalize' }]}>
                    {selectedPoi.category.replace(/_/g, ' ')} · ⭐ {selectedPoi.rating.toFixed(1)}
                  </Text>

                  {/* Read Aloud Toggle */}
                  <TouchableOpacity
                    style={[
                      s.readAloudBtn,
                      {
                        backgroundColor: isSpeaking ? colors.destructive + '15' : colors.tint + '15',
                        borderColor: isSpeaking ? colors.destructive : colors.tint,
                      }
                    ]}
                    onPress={handleReadAloud}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={isSpeaking ? Icons.stop : Icons.speaker} tintColor={isSpeaking ? colors.destructive : colors.tint} size={16} />
                      <Text style={[Typography.subheadline, { fontWeight: '600', color: isSpeaking ? colors.destructive : colors.tint }]}>
                        {isSpeaking ? 'Stop Reading' : 'Read Aloud (Device TTS)'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Optional Image */}
                {selectedPoi.image_url ? (
                  <Image
                    source={{ uri: selectedPoi.image_local_path || selectedPoi.image_url }}
                    style={s.poiDetailImage}
                    resizeMode="cover"
                  />
                ) : null}

                <View style={[s.modalDivider, { backgroundColor: colors.separator }]} />

                {/* Research Text Label */}
                <Text style={[Typography.caption2, { color: colors.tint, fontWeight: '700', letterSpacing: 1.0, marginBottom: 10 }]}>
                  RESEARCH DOCUMENT
                </Text>

                {/* Content body */}
                <Text style={[Typography.body, { color: colors.textPrimary, lineHeight: 22, marginBottom: 16 }]}>
                  {selectedPoi.narration_text}
                </Text>

                <View style={[s.modalDivider, { backgroundColor: colors.separator }]} />

                {/* Meta details footer */}
                <View style={s.poiDetailMetaRow}>
                  <Text style={[Typography.caption1, { color: colors.textSecondary }]}>📝 Word Count: {selectedPoi.narration_word_count}</Text>
                  <Text style={[Typography.caption1, { color: colors.textSecondary }]}>⏱ Reading Time: ~{Math.max(1, Math.round(selectedPoi.narration_word_count / 200))} min</Text>
                </View>
              </ScrollView>

              {/* Close Button */}
              <SecondaryButton
                title="Close Document"
                onPress={handleClosePoiModal}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.title1,
  },
  headerSub: {
    ...Typography.footnote,
  },
  listContent: {
    padding: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  listContentEmpty: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalHandle: {
    width: 36,
    height: 5,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.base,
  },
  modalTitle: {
    ...Typography.title3,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    ...Typography.footnote,
    textAlign: 'center',
    marginBottom: Spacing.base,
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
  },
  // Rename Modal
  renameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  renameModalContent: {
    width: '100%',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  renameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
    ...Typography.body,
    marginBottom: Spacing.xl,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.base,
  },
  renameCancelBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  renameSaveBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  poiDetailHeader: {
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  poiDetailIconContainer: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  poiDetailImage: {
    width: '100%',
    height: 200,
    borderRadius: Radius.lg,
    marginVertical: Spacing.base,
  },
  poiDetailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  readAloudBtn: {
    marginTop: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    alignSelf: 'center',
  },
});
