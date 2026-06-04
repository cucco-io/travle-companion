import * as SQLite from 'expo-sqlite';
import {
  initializeDatabase,
  createTrip,
  getTrip,
  getTripById,
  getAllTrips,
  listTrips,
  updateTripStatus,
  savePOIs,
  updatePOI,
  addTripLogEntry,
  saveLogEntries,
  addBreadcrumb,
  saveBreadcrumbs,
  getTripLog,
  getBreadcrumbs,
  deleteTrip
} from '../tripStorage';
import { getTripFileSizeMB, deleteTripFiles } from '../fileStorage';

// Mock fileStorage
jest.mock('../fileStorage', () => ({
  getTripFileSizeMB: jest.fn().mockResolvedValue(1.5),
  deleteTripFiles: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-sqlite with inner definition to avoid hoisting ReferenceError
jest.mock('expo-sqlite', () => {
  const localMockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    withTransactionAsync: jest.fn().mockImplementation(async (cb) => {
      return await cb();
    }),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(localMockDb),
  };
});

async function getMockDb() {
  return await SQLite.openDatabaseAsync('travel_companion.db');
}

const mockTrip = {
  id: 'trip-123',
  name: 'Rome Adventure',
  mode: 'city' as const,
  status: 'preparing' as const,
  preferences: {
    interests: ['history' as const],
    narration_depth: 'standard' as const,
    kid_friendly: false,
    language: 'en',
  },
  origin: null,
  destination: {
    name: 'Rome',
    lat: 41.9028,
    lng: 12.4964,
  },
  pois: [],
  route_polyline: null,
  created_at: '2026-06-03T00:00:00.000Z',
  started_at: null,
  completed_at: null,
  total_size_mb: 0.0,
};

const mockPOI = {
  id: 'poi-456',
  name: 'Colosseum',
  category: 'historical_landmark' as const,
  coordinates: {
    lat: 41.8902,
    lng: 12.4922,
  },
  rating: 4.8,
  narration_text: 'The Colosseum is...',
  narration_word_count: 200,
  estimated_listen_minutes: 1.5,
  audio_file_path: 'local/path/colosseum.mp3',
  trigger_radius_meters: 50,
  priority: 5,
  image_url: 'http://image',
  image_local_path: 'local/path/colosseum.jpg',
  bookmarked: false,
  played_at: null,
};

describe('tripStorage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDb = await getMockDb();
    (mockDb.execAsync as any).mockResolvedValue(undefined);
    (mockDb.runAsync as any).mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    (mockDb.getFirstAsync as any).mockReset();
    (mockDb.getAllAsync as any).mockReset();
  });

  test('initializeDatabase sets up DB correctly', async () => {
    const mockDb = await getMockDb();
    await initializeDatabase();
    expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL;');
    expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
    expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS trips'));
  });

  test('createTrip inserts trip and saves POIs', async () => {
    const mockDb = await getMockDb();
    const tripWithPOI = {
      ...mockTrip,
      pois: [mockPOI],
    };
    const id = await createTrip(tripWithPOI);
    expect(id).toBe('trip-123');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trips'),
      expect.any(String), expect.any(String), expect.any(String), expect.any(String),
      expect.any(String), null, expect.any(String), null,
      expect.any(String), null, null, 0.0
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO pois'),
      'poi-456', 'trip-123', 'Colosseum', 'historical_landmark', 41.8902, 12.4922,
      4.8, 'The Colosseum is...', 200, 1.5, 'local/path/colosseum.mp3', 50, 5,
      'http://image', 'local/path/colosseum.jpg', 0, null
    );
  });

  test('getTripById reconstructs full Trip object with POIs', async () => {
    const mockDb = await getMockDb();
    (mockDb.getFirstAsync as any).mockResolvedValueOnce({
      id: 'trip-123',
      name: 'Rome Adventure',
      mode: 'city',
      status: 'preparing',
      preferences: JSON.stringify(mockTrip.preferences),
      origin: null,
      destination: JSON.stringify(mockTrip.destination),
      route_polyline: null,
      created_at: '2026-06-03T00:00:00.000Z',
      started_at: null,
      completed_at: null,
      total_size_mb: 0.0,
    });

    (mockDb.getAllAsync as any).mockResolvedValueOnce([
      {
        id: 'poi-456',
        name: 'Colosseum',
        category: 'historical_landmark',
        lat: 41.8902,
        lng: 12.4922,
        rating: 4.8,
        narration_text: 'The Colosseum is...',
        narration_word_count: 200,
        estimated_listen_minutes: 1.5,
        audio_file_path: 'local/path/colosseum.mp3',
        trigger_radius_meters: 50,
        priority: 5,
        image_url: 'http://image',
        image_local_path: 'local/path/colosseum.jpg',
        bookmarked: 1, // 1 in DB -> true in TS
        played_at: '2026-06-03T01:00:00.000Z',
      }
    ]);

    const result = await getTripById('trip-123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('trip-123');
    expect(result!.pois).toHaveLength(1);
    expect(result!.pois[0].id).toBe('poi-456');
    expect(result!.pois[0].bookmarked).toBe(true);
    expect(result!.pois[0].coordinates).toEqual({ lat: 41.8902, lng: 12.4922 });
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('FROM trips'), 'trip-123');
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('FROM pois'), 'trip-123');
  });

  test('getTrip is alias for getTripById', async () => {
    const mockDb = await getMockDb();
    (mockDb.getFirstAsync as any).mockResolvedValueOnce(null);
    const result = await getTrip('trip-123');
    expect(result).toBeNull();
  });

  test('listTrips fetches trips with count but without POIs details', async () => {
    const mockDb = await getMockDb();
    (mockDb.getAllAsync as any).mockResolvedValueOnce([
      {
        id: 'trip-123',
        name: 'Rome Adventure',
        mode: 'city',
        status: 'preparing',
        preferences: JSON.stringify(mockTrip.preferences),
        origin: null,
        destination: JSON.stringify(mockTrip.destination),
        route_polyline: null,
        created_at: '2026-06-03T00:00:00.000Z',
        started_at: null,
        completed_at: null,
        total_size_mb: 0.0,
        poi_count: 3,
      }
    ]);

    const result = await listTrips('preparing', 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('trip-123');
    expect(result[0].pois).toEqual([]);
    expect((result[0] as any).poi_count).toBe(3);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('COUNT(p.id)'), 'preparing', 10);
  });

  test('getAllTrips is alias of listTrips', async () => {
    const mockDb = await getMockDb();
    (mockDb.getAllAsync as any).mockResolvedValueOnce([]);
    const result = await getAllTrips();
    expect(result).toEqual([]);
  });

  test('updateTripStatus active sets started_at', async () => {
    const mockDb = await getMockDb();
    await updateTripStatus('trip-123', 'active');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('started_at = ?'),
      'active',
      expect.any(String),
      'trip-123'
    );
  });

  test('updateTripStatus completed sets completed_at', async () => {
    const mockDb = await getMockDb();
    await updateTripStatus('trip-123', 'completed');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('completed_at = ?'),
      'completed',
      expect.any(String),
      'trip-123'
    );
  });

  test('updateTripStatus ready computes total_size_mb', async () => {
    const mockDb = await getMockDb();
    await updateTripStatus('trip-123', 'ready');
    expect(getTripFileSizeMB).toHaveBeenCalledWith('trip-123');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('total_size_mb = ?'),
      'ready',
      1.5,
      'trip-123'
    );
  });

  test('updatePOI updates a POI correctly', async () => {
    const mockDb = await getMockDb();
    await updatePOI(mockPOI);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE pois'),
      'Colosseum', 'historical_landmark', 41.8902, 12.4922, 4.8, 'The Colosseum is...',
      200, 1.5, 'local/path/colosseum.mp3', 50, 5, 'http://image', 'local/path/colosseum.jpg',
      0, null, 'poi-456'
    );
  });

  test('addTripLogEntry and saveLogEntries insert logs correctly', async () => {
    const mockDb = await getMockDb();
    const entry = {
      poi_id: 'poi-456',
      played_at: '2026-06-03T01:00:00.000Z',
      location: { lat: 41.8902, lng: 12.4922 },
      skipped: true,
    };

    await addTripLogEntry('trip-123', entry);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trip_log'),
      'trip-123', 'poi-456', '2026-06-03T01:00:00.000Z', 41.8902, 12.4922, 1
    );

    await saveLogEntries('trip-123', [entry]);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
  });

  test('addBreadcrumb and saveBreadcrumbs insert breadcrumbs correctly', async () => {
    const mockDb = await getMockDb();
    const breadcrumb = {
      timestamp: '2026-06-03T01:00:00.000Z',
      lat: 41.8902,
      lng: 12.4922,
    };

    await addBreadcrumb('trip-123', breadcrumb);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO gps_breadcrumbs'),
      'trip-123', '2026-06-03T01:00:00.000Z', 41.8902, 12.4922
    );

    await saveBreadcrumbs('trip-123', [breadcrumb]);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
  });

  test('getTripLog and getBreadcrumbs retrieve entries correctly', async () => {
    const mockDb = await getMockDb();
    (mockDb.getAllAsync as any).mockResolvedValueOnce([
      {
        poi_id: 'poi-456',
        played_at: '2026-06-03T01:00:00.000Z',
        lat: 41.8902,
        lng: 12.4922,
        skipped: 1,
      }
    ]);
    const log = await getTripLog('trip-123');
    expect(log).toHaveLength(1);
    expect(log[0].skipped).toBe(true);
    expect(log[0].location).toEqual({ lat: 41.8902, lng: 12.4922 });

    (mockDb.getAllAsync as any).mockResolvedValueOnce([
      {
        timestamp: '2026-06-03T01:00:00.000Z',
        lat: 41.8902,
        lng: 12.4922,
      }
    ]);
    const crumbs = await getBreadcrumbs('trip-123');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].timestamp).toBe('2026-06-03T01:00:00.000Z');
  });

  test('deleteTrip deletes trip and cleans up files', async () => {
    const mockDb = await getMockDb();
    await deleteTrip('trip-123');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM trips WHERE id = ?', 'trip-123');
    expect(deleteTripFiles).toHaveBeenCalledWith('trip-123');
  });
});
