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
} from 'react-native';
import { router } from 'expo-router';
import { getAllTrips, deleteTrip, updateTripName, getAllResearchedPOIs } from '@/src/services/storage/tripStorage';
import type { Trip, TripStatus } from '@/src/types/trip';
import type { POI } from '@/src/types/poi';
import { manager } from '@/src/services/api/preparationManager';
import * as Speech from 'expo-speech';

// ─── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0e1a',
  surface: '#131929',
  card: '#1a2236',
  border: '#252f47',
  gold: '#f5c842',
  teal: '#2dd4bf',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  muted: '#6b7280',
  text: '#f1f5f9',
  textSub: '#94a3b8',
};

// ─── Status badge config ────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  TripStatus,
  { label: string; color: string; bg: string }
> = {
  preparing: { label: 'Preparing', color: '#000', bg: C.amber },
  ready: { label: 'Ready', color: '#fff', bg: C.blue },
  active: { label: 'Active', color: '#000', bg: C.green },
  completed: { label: 'Completed', color: C.textSub, bg: '#1e293b' },
};

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

  const statusCfg = STATUS_CONFIG[trip.status];
  const poiCount = (trip as Trip & { poi_count?: number }).poi_count ?? trip.pois.length;

  return (
    <View style={card.wrapper}>
      {/* Delete reveal */}
      <View style={card.deleteReveal}>
        <TouchableOpacity
          style={card.deleteBtn}
          onPress={() => {
            closeSwipe();
            onDelete(trip.id, trip.name);
          }}
        >
          <Text style={card.deleteBtnText}>🗑{'\n'}Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Main card */}
      <Animated.View
        style={[card.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (swiped) { closeSwipe(); return; }
            onPress(trip);
          }}
          style={card.inner}
        >
          {/* Top row: name + status */}
          <View style={card.topRow}>
            <Text style={card.name} numberOfLines={1}>
              {trip.name}
            </Text>
            {activePrep ? (
              <View style={[card.badge, { backgroundColor: C.gold }]}>
                <Text style={[card.badgeText, { color: '#000' }]}>
                  ⚡ Researching
                </Text>
              </View>
            ) : trip.status === 'preparing' ? (
              <View style={[card.badge, { backgroundColor: C.amber }]}>
                <Text style={[card.badgeText, { color: '#000' }]}>
                  ⚠️ Interrupted
                </Text>
              </View>
            ) : (
              <View style={[card.badge, { backgroundColor: statusCfg.bg }]}>
                <Text style={[card.badgeText, { color: statusCfg.color }]}>
                  {statusCfg.label}
                </Text>
              </View>
            )}
          </View>

          {/* Destination */}
          <Text style={card.dest} numberOfLines={1}>
            📍 {trip.destination.name}
          </Text>

          {/* Active Preparation Progress Bar */}
          {activePrep && (
            <View style={card.progressWrapper}>
              <Text style={card.progressStatusText} numberOfLines={1}>
                {activePrep.statusMessage}
              </Text>
              <View style={card.progressContainer}>
                <View style={card.progressTrack}>
                  <View style={[card.progressFill, { width: `${Math.round(activePrep.progress * 100)}%` }]} />
                </View>
                <Text style={card.progressPctText}>{Math.round(activePrep.progress * 100)}%</Text>
                {onStopPrep && (
                  <TouchableOpacity
                    style={card.stopButton}
                    onPress={() => onStopPrep(trip.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={card.stopButtonText}>🛑 Stop</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Bottom meta row */}
          {!activePrep && (
            <View style={card.metaRow}>
              <Text style={card.meta}>🗓 {formatDate(trip.created_at)}</Text>
              <Text style={card.meta}>
                📌 {poiCount} POI{poiCount !== 1 ? 's' : ''}
              </Text>
              <Text style={card.meta}>
                {trip.mode === 'route' ? '🚗 Route' : '🏙 City'}
              </Text>
            </View>
          )}

          {/* Navigate hint */}
          <Text style={card.chevron}>›</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const card = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    position: 'relative',
  },
  deleteReveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: C.red,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  inner: {
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  dest: {
    fontSize: 13,
    color: C.textSub,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  meta: { fontSize: 12, color: C.muted },
  chevron: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    fontSize: 22,
    color: C.muted,
  },
  progressWrapper: {
    marginTop: 4,
    marginBottom: 8,
  },
  progressStatusText: {
    fontSize: 12,
    color: C.teal,
    fontWeight: '600',
    marginBottom: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: C.teal,
    borderRadius: 3,
  },
  progressPctText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
    width: 30,
    textAlign: 'right',
  },
  stopButton: {
    backgroundColor: C.red,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});

// ─── Empty state ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={empty.container}>
      <Text style={empty.globe}>🌍</Text>
      <Text style={empty.title}>No Trips Yet</Text>
      <Text style={empty.subtitle}>
        Your travel adventures will appear here.{'\n'}
        Start by exploring a destination!
      </Text>
      <TouchableOpacity
        style={empty.cta}
        onPress={() => router.push('/(tabs)')}
      >
        <Text style={empty.ctaText}>✈️  Explore Destinations</Text>
      </TouchableOpacity>
    </View>
  );
}

const empty = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  globe: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: C.textSub,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  cta: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#000' },
});

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

function PlaceCard({ poi, onPress }: { poi: POI; onPress: (poi: POI) => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(poi)}
      style={placeCard.card}
    >
      <Text style={placeCard.icon}>{categoryIcon(poi.category)}</Text>
      <View style={placeCard.content}>
        <Text style={placeCard.name} numberOfLines={1}>{poi.name}</Text>
        <Text style={placeCard.details}>
          {poi.category.replace(/_/g, ' ')} · ⭐ {poi.rating.toFixed(1)}
        </Text>
      </View>
      <View style={placeCard.action}>
        <Text style={placeCard.actionText}>📄 View Text</Text>
      </View>
    </TouchableOpacity>
  );
}

const placeCard = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  icon: {
    fontSize: 24,
    marginRight: 14,
    width: 32,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 3,
  },
  details: {
    fontSize: 12,
    color: C.textSub,
    textTransform: 'capitalize',
  },
  action: {
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  actionText: {
    fontSize: 11,
    color: C.teal,
    fontWeight: '700',
  },
});

// ─── Main screen ────────────────────────────────────────────────────────────────
export default function TripsScreen() {
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
  }, [activePreparations]);

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
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.headerTitle}>{activeTab === 'trips' ? 'My Trips' : 'Researched Places'}</Text>
          <Text style={s.headerSub}>
            {activeTab === 'trips' 
              ? `${trips.length} trip${trips.length !== 1 ? 's' : ''}`
              : `${researchedPois.length} place${researchedPois.length !== 1 ? 's' : ''}`}
          </Text>
        </View>

        {/* Tab Toggle Row */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabButton, activeTab === 'trips' && s.tabButtonActive]}
            onPress={() => setActiveTab('trips')}
            activeOpacity={0.8}
          >
            <Text style={[s.tabButtonText, activeTab === 'trips' && s.tabButtonTextActive]}>
              🗺️ Trips
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabButton, activeTab === 'places' && s.tabButtonActive]}
            onPress={() => setActiveTab('places')}
            activeOpacity={0.8}
          >
            <Text style={[s.tabButtonText, activeTab === 'places' && s.tabButtonTextActive]}>
              📚 Library
            </Text>
          </TouchableOpacity>
        </View>
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
              tintColor={C.gold}
              colors={[C.gold]}
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
            <View style={empty.container}>
              <Text style={empty.globe}>📚</Text>
              <Text style={empty.title}>No Places Researched Yet</Text>
              <Text style={empty.subtitle}>
                Complete a trip research to populate your places library!
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.teal}
              colors={[C.teal]}
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
            <View style={s.modalSheet}>
              {/* Handle bar */}
              <View style={s.modalHandle} />
              
              <Text style={s.modalTitle} numberOfLines={1}>{selectedTrip.name}</Text>
              <Text style={s.modalSubtitle}>📍 {selectedTrip.destination.name}</Text>

              <View style={s.modalDivider} />

              {/* Status specific actions */}
              {selectedTrip.status === 'preparing' && (
                <TouchableOpacity
                  style={s.modalOptionBtn}
                  onPress={() => {
                    setActionModalVisible(false);
                    router.push(`/trip/prepare?tripId=${selectedTrip.id}`);
                  }}
                >
                  <Text style={[s.modalOptionText, { color: C.teal }]}>🔄 Resume Research</Text>
                </TouchableOpacity>
              )}

              {selectedTrip.status === 'ready' && (
                <TouchableOpacity
                  style={s.modalOptionBtn}
                  onPress={() => {
                    setActionModalVisible(false);
                    router.push(`/trip/active?tripId=${selectedTrip.id}`);
                  }}
                >
                  <Text style={[s.modalOptionText, { color: C.green }]}>🗺️ Start Trip</Text>
                </TouchableOpacity>
              )}

              {selectedTrip.status === 'active' && (
                <TouchableOpacity
                  style={s.modalOptionBtn}
                  onPress={() => {
                    setActionModalVisible(false);
                    router.push(`/trip/active?tripId=${selectedTrip.id}`);
                  }}
                >
                  <Text style={[s.modalOptionText, { color: C.green }]}>🗺️ Resume Active Trip</Text>
                </TouchableOpacity>
              )}

              {selectedTrip.status === 'completed' && (
                <TouchableOpacity
                  style={s.modalOptionBtn}
                  onPress={() => {
                    setActionModalVisible(false);
                    router.push(`/trip/review?tripId=${selectedTrip.id}`);
                  }}
                >
                  <Text style={[s.modalOptionText, { color: C.blue }]}>🏆 View Trip Summary</Text>
                </TouchableOpacity>
              )}

              {/* Preview Research Action (for non-interrupted ready/active/completed trips, or preparing trips with POIs) */}
              {(selectedTrip.status !== 'preparing' || selectedTrip.pois.length > 0) && (
                <TouchableOpacity
                  style={s.modalOptionBtn}
                  onPress={() => {
                    setActionModalVisible(false);
                    router.push(`/trip/preview?tripId=${selectedTrip.id}`);
                  }}
                >
                  <Text style={s.modalOptionText}>📚 Preview Research (Text & Audio)</Text>
                </TouchableOpacity>
              )}

              {/* Rename Trip */}
              <TouchableOpacity
                style={s.modalOptionBtn}
                onPress={() => setRenameModalVisible(true)}
              >
                <Text style={s.modalOptionText}>✏️ Rename Trip</Text>
              </TouchableOpacity>

              {/* Delete Trip */}
              <TouchableOpacity
                style={[s.modalOptionBtn, { borderBottomWidth: 0 }]}
                onPress={() => handleDelete(selectedTrip.id, selectedTrip.name)}
              >
                <Text style={[s.modalOptionText, { color: C.red }]}>🗑 Delete Trip</Text>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setActionModalVisible(false)}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
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
          <View style={s.renameModalContent}>
            <Text style={s.renameModalTitle}>Rename Trip</Text>
            <TextInput
              style={s.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter new trip name..."
              placeholderTextColor={C.muted}
              selectionColor={C.gold}
              autoFocus={true}
            />
            <View style={s.renameActions}>
              <TouchableOpacity
                style={s.renameCancelBtn}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={s.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.renameSaveBtn}
                onPress={handleRename}
              >
                <Text style={s.renameSaveText}>Save</Text>
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
            <View style={[s.modalSheet, { maxHeight: '85%' }]}>
              {/* Handle bar */}
              <View style={s.modalHandle} />
              
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {/* Header */}
                <View style={s.poiDetailHeader}>
                  <Text style={s.poiDetailEmoji}>{categoryIcon(selectedPoi.category)}</Text>
                  <Text style={s.poiDetailTitle}>{selectedPoi.name}</Text>
                  <Text style={s.poiDetailSubtitle}>
                    {selectedPoi.category.replace(/_/g, ' ')} · ⭐ {selectedPoi.rating.toFixed(1)}
                  </Text>

                  {/* Read Aloud Toggle */}
                  <TouchableOpacity
                    style={[s.readAloudBtn, isSpeaking && s.readAloudBtnActive]}
                    onPress={handleReadAloud}
                    activeOpacity={0.7}
                  >
                    <Text style={s.readAloudText}>
                      {isSpeaking ? '🛑 Stop Reading' : '🔊 Read Aloud (Device TTS)'}
                    </Text>
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

                <View style={s.modalDivider} />

                {/* Research Text Label */}
                <Text style={s.poiDetailLabel}>RESEARCH DOCUMENT</Text>

                {/* Content body */}
                <Text style={s.poiDetailText}>{selectedPoi.narration_text}</Text>

                <View style={s.modalDivider} />

                {/* Meta details footer */}
                <View style={s.poiDetailMetaRow}>
                  <Text style={s.poiDetailMetaText}>📝 Word Count: {selectedPoi.narration_word_count}</Text>
                  <Text style={s.poiDetailMetaText}>⏱ Reading Time: ~{Math.max(1, Math.round(selectedPoi.narration_word_count / 200))} min</Text>
                </View>
              </ScrollView>

              {/* Close Button */}
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={handleClosePoiModal}
              >
                <Text style={s.modalCancelText}>Close Document</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
  },
  headerSub: {
    fontSize: 13,
    color: C.textSub,
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
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
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: C.textSub,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  modalOptionBtn: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
  },
  modalCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textSub,
    textAlign: 'center',
  },
  // Rename Modal
  renameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  renameModalContent: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  renameModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 16,
  },
  renameInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    color: C.text,
    fontSize: 15,
    marginBottom: 20,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  renameCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  renameCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSub,
  },
  renameSaveBtn: {
    backgroundColor: C.gold,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  renameSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#1a2236',
    borderWidth: 1,
    borderColor: '#252f47',
  },
  tabButtonText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#f1f5f9',
    fontWeight: '700',
  },
  poiDetailHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  poiDetailEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  poiDetailTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  poiDetailSubtitle: {
    fontSize: 14,
    color: C.textSub,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  poiDetailImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginVertical: 16,
  },
  poiDetailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.teal,
    letterSpacing: 1.0,
    marginBottom: 10,
  },
  poiDetailText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
    marginBottom: 16,
  },
  poiDetailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  poiDetailMetaText: {
    fontSize: 12,
    color: C.textSub,
  },
  readAloudBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(245, 200, 66, 0.1)',
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  readAloudBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: C.red,
  },
  readAloudText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
  },
});
