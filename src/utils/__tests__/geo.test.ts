import {
  toRadians,
  toDegrees,
  haversineDistance,
  bearing,
  decodePolyline,
  samplePointsAlongPolyline,
} from '../geo';

function encodeValue(value: number): string {
  let val = value < 0 ? ~(value << 1) : (value << 1);
  let chunks = '';
  while (val >= 0x20) {
    chunks += String.fromCharCode(((val & 0x1f) | 0x20) + 63);
    val >>= 5;
  }
  chunks += String.fromCharCode(val + 63);
  return chunks;
}

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);

    const dLat = lat - prevLat;
    const dLng = lng - prevLng;

    prevLat = lat;
    prevLng = lng;

    encoded += encodeValue(dLat) + encodeValue(dLng);
  }
  return encoded;
}

describe('Geo Utilities', () => {
  describe('toRadians & toDegrees', () => {
    it('should convert degrees to radians correctly', () => {
      expect(toRadians(0)).toBe(0);
      expect(toRadians(180)).toBeCloseTo(Math.PI, 5);
      expect(toRadians(360)).toBeCloseTo(2 * Math.PI, 5);
      expect(toRadians(-90)).toBeCloseTo(-Math.PI / 2, 5);
    });

    it('should convert radians to degrees correctly', () => {
      expect(toDegrees(0)).toBe(0);
      expect(toDegrees(Math.PI)).toBeCloseTo(180, 5);
      expect(toDegrees(2 * Math.PI)).toBeCloseTo(360, 5);
      expect(toDegrees(-Math.PI / 2)).toBeCloseTo(-90, 5);
    });
  });

  describe('haversineDistance', () => {
    it('should return 0 for the same point', () => {
      expect(haversineDistance(40.7128, -74.0060, 40.7128, -74.0060)).toBe(0);
    });

    it('should be accurate to within 0.1% of known values', () => {
      // Rome (41.8902, 12.4922) to Florence (43.7696, 11.2558)
      // Expected distance: ~232,026 meters
      const dRomeFlorence = haversineDistance(41.8902, 12.4922, 43.7696, 11.2558);
      expect(dRomeFlorence).toBeCloseTo(232026, -2);
      const errRomeFlorence = Math.abs(dRomeFlorence - 232026) / 232026;
      expect(errRomeFlorence).toBeLessThan(0.001); // within 0.1%

      // London (51.5074, -0.1278) to Paris (48.8566, 2.3522)
      const dLondonParis = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
      const expectedLondonParis = 343556;
      const errLondonParis = Math.abs(dLondonParis - expectedLondonParis) / expectedLondonParis;
      expect(errLondonParis).toBeLessThan(0.001);
    });
  });

  describe('bearing', () => {
    it('should calculate bearing correctly for cardinal directions', () => {
      expect(bearing(0, 0, 1, 0)).toBeCloseTo(0, 2);
      expect(bearing(0, 0, 0, 1)).toBeCloseTo(90, 2);
      expect(bearing(0, 0, -1, 0)).toBeCloseTo(180, 2);
      expect(bearing(0, 0, 0, -1)).toBeCloseTo(270, 2);
    });

    it('should calculate diagonal bearings correctly', () => {
      expect(bearing(0, 0, 1, 1)).toBeCloseTo(45, 0);
    });
  });

  describe('decodePolyline', () => {
    it('should return empty array for empty string', () => {
      expect(decodePolyline('')).toEqual([]);
    });

    it('should correctly decode Google polyline example', () => {
      const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq' + String.fromCharCode(96) + '@';
      const decoded = decodePolyline(encoded);
      expect(decoded.length).toBe(3);
      expect(decoded[0].lat).toBeCloseTo(38.5, 5);
      expect(decoded[0].lng).toBeCloseTo(-120.2, 5);
      expect(decoded[1].lat).toBeCloseTo(40.7, 5);
      expect(decoded[1].lng).toBeCloseTo(-120.95, 5);
      expect(decoded[2].lat).toBeCloseTo(43.252, 5);
      expect(decoded[2].lng).toBeCloseTo(-126.453, 5);
    });
  });

  describe('samplePointsAlongPolyline', () => {
    it('should handle empty or single point polylines', () => {
      expect(samplePointsAlongPolyline('', 1000)).toEqual([]);
      const encodedSingle = '_p~iF~ps|U';
      expect(samplePointsAlongPolyline(encodedSingle, 1000)).toEqual([
        { lat: 38.5, lng: -120.2 },
      ]);
    });

    it('should return start and end points if total distance is less than interval', () => {
      const encoded = '_p~iF~ps|U_ulLnnqC';
      const sampled = samplePointsAlongPolyline(encoded, 500000);
      expect(sampled.length).toBe(2);
      expect(sampled[0].lat).toBeCloseTo(38.5, 5);
      expect(sampled[0].lng).toBeCloseTo(-120.2, 5);
      expect(sampled[1].lat).toBeCloseTo(40.7, 5);
      expect(sampled[1].lng).toBeCloseTo(-120.95, 5);
    });

    it('should sample points evenly at regular intervals along a straight path', () => {
      // Create a straight vertical polyline along a meridian
      const points = [];
      for (let i = 0; i <= 20; i++) {
        points.push({ lat: 40.0 + i * 0.1, lng: -120.0 });
      }
      
      const encoded = encodePolyline(points);
      const interval = 25000; // 25km
      const sampled = samplePointsAlongPolyline(encoded, interval);
      
      expect(sampled.length).toBeGreaterThan(3);
      
      // For a straight line, direct distance should equal path distance,
      // so each interval should be extremely close to the requested 25km interval.
      for (let i = 1; i < sampled.length - 1; i++) {
        const d = haversineDistance(
          sampled[i-1].lat,
          sampled[i-1].lng,
          sampled[i].lat,
          sampled[i].lng
        );
        // Expect within 0.1% error (25 meters)
        expect(Math.abs(d - interval)).toBeLessThan(25);
      }
    });
  });
});
