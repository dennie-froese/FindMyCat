import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RADAR_CENTER,
  projectCoordsToRadar,
  canvasTapToCoords,
  getPrivacyShieldPixelRadius,
} from '../src/services/radarGeometry.ts';

describe('Mobile: Interactive Radar Map Geometry & Pin Drop Projection', () => {
  test('projectCoordsToRadar projects center coordinate to exact origin (50%, 50%)', () => {
    const result = projectCoordsToRadar(DEFAULT_RADAR_CENTER, DEFAULT_RADAR_CENTER, 2.0);
    assert.strictEqual(result.nx, 0);
    assert.strictEqual(result.ny, 0);
    assert.strictEqual(result.leftPercent, 50);
    assert.strictEqual(result.topPercent, 50);
    assert.strictEqual(result.distanceMiles, 0);
    assert.strictEqual(result.isClamped, false);
  });

  test('projectCoordsToRadar projects North-East coordinate into upper-right quadrant', () => {
    const target = {
      latitude: DEFAULT_RADAR_CENTER.latitude + 0.008, // North
      longitude: DEFAULT_RADAR_CENTER.longitude + 0.012, // East
    };
    const result = projectCoordsToRadar(target, DEFAULT_RADAR_CENTER, 2.0);
    assert.ok(result.nx > 0, 'East should have positive nx');
    assert.ok(result.ny < 0, 'North should have negative ny');
    assert.ok(result.leftPercent > 50, 'East should be > 50% left');
    assert.ok(result.topPercent < 50, 'North should be < 50% top');
    assert.ok(result.bearingDegrees > 0 && result.bearingDegrees < 90, 'Bearing should be NE (0..90)');
    assert.strictEqual(result.isClamped, false);
  });

  test('projectCoordsToRadar clamps distant coordinates to radar perimeter', () => {
    const distantTarget = {
      latitude: DEFAULT_RADAR_CENTER.latitude + 0.2, // ~13.8 miles North
      longitude: DEFAULT_RADAR_CENTER.longitude,
    };
    const result = projectCoordsToRadar(distantTarget, DEFAULT_RADAR_CENTER, 1.0, 0.82);
    assert.strictEqual(result.isClamped, true);
    assert.ok(Math.abs(result.ny - -0.82) < 0.01, 'Clamped ny should be at -maxNormRadius');
    assert.ok(result.distanceMiles > 10, 'True distance in miles is preserved when clamped');
  });

  test('canvasTapToCoords is the inverse of projectCoordsToRadar for unclamped points', () => {
    const radiusMiles = 2.0;
    const originalTapNx = 0.35;
    const originalTapNy = -0.25;

    const droppedCoords = canvasTapToCoords(
      originalTapNx,
      originalTapNy,
      DEFAULT_RADAR_CENTER,
      radiusMiles
    );
    const reprojected = projectCoordsToRadar(
      droppedCoords,
      DEFAULT_RADAR_CENTER,
      radiusMiles
    );

    assert.ok(Math.abs(reprojected.nx - originalTapNx) < 0.01, 'Reprojected nx should match tap nx');
    assert.ok(Math.abs(reprojected.ny - originalTapNy) < 0.01, 'Reprojected ny should match tap ny');
  });

  test('getPrivacyShieldPixelRadius scales inversely with radar zoom radius', () => {
    const pxAtHalfMile = getPrivacyShieldPixelRadius(340, 0.5);
    const pxAtTwoMiles = getPrivacyShieldPixelRadius(340, 2.0);
    assert.ok(
      pxAtHalfMile > pxAtTwoMiles,
      `200m halo should appear larger at 0.5mi zoom (${pxAtHalfMile}px) than 2.0mi zoom (${pxAtTwoMiles}px)`
    );
  });
});
