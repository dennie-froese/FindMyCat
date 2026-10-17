import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPrivacyShield,
  calculateDistanceMiles,
  formatDistance,
} from '../src/services/privacyEngine.ts';

describe('Mobile: Dual-Zone Privacy Shield Engine', () => {
  const homeLat = 51.5362;
  const homeLon = -0.0385;

  test('applyPrivacyShield offsets coordinates within expected radius range', () => {
    const minRadius = 150;
    const maxRadius = 250;

    for (let i = 0; i < 20; i++) {
      const result = applyPrivacyShield(homeLat, homeLon, minRadius, maxRadius);

      assert.ok(result.offsetMeters >= minRadius, `Offset ${result.offsetMeters}m is less than min ${minRadius}m`);
      assert.ok(result.offsetMeters <= maxRadius, `Offset ${result.offsetMeters}m exceeds max ${maxRadius}m`);

      // Coordinates should be close (within ~0.005 degrees), but NOT identical
      assert.notStrictEqual(result.latitude, homeLat, 'Jittered latitude must not equal raw residential coordinate');
      assert.notStrictEqual(result.longitude, homeLon, 'Jittered longitude must not equal raw residential coordinate');
      assert.ok(Math.abs(result.latitude - homeLat) < 0.005, 'Latitude delta should be reasonable for 200m');
      assert.ok(Math.abs(result.longitude - homeLon) < 0.005, 'Longitude delta should be reasonable for 200m');
    }
  });

  test('calculateDistanceMiles accurately computes Haversine formula', () => {
    // 1. Identical coordinates
    const zeroDist = calculateDistanceMiles(homeLat, homeLon, homeLat, homeLon);
    assert.strictEqual(zeroDist, 0);

    // 2. Known distance: Trafalgar Square (51.5080, -0.1281) to Victoria Park (51.5362, -0.0385)
    // Actual distance is approx 4.3 - 4.6 miles
    const distMiles = calculateDistanceMiles(51.5080, -0.1281, 51.5362, -0.0385);
    assert.ok(distMiles >= 4.0 && distMiles <= 5.0, `Calculated distance ${distMiles} mi should be ~4.5 mi`);
  });

  test('formatDistance formats immediate vicinity vs neighborhood miles', () => {
    assert.strictEqual(formatDistance(0.04), 'Immediate vicinity (<500 ft)');
    assert.strictEqual(formatDistance(0.09), 'Immediate vicinity (<500 ft)');
    assert.strictEqual(formatDistance(0.5), '0.5 mi away');
    assert.strictEqual(formatDistance(2.3), '2.3 mi away');
  });
});
