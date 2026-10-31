export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

function computeDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export interface ProjectedRadarPoint {
  /** Normalized X in [-1, 1], where 0 is center, -1 is left (West), +1 is right (East) */
  nx: number;
  /** Normalized Y in [-1, 1], where 0 is center, -1 is top (North), +1 is bottom (South) */
  ny: number;
  /** Left percentage (0% to 100%) suitable for absolute positioning */
  leftPercent: number;
  /** Top percentage (0% to 100%) suitable for absolute positioning */
  topPercent: number;
  /** True distance in miles from center */
  distanceMiles: number;
  /** Bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West) */
  bearingDegrees: number;
  /** True if the point was beyond radiusMiles and clamped to the radar perimeter */
  isClamped: boolean;
}

export const DEFAULT_RADAR_CENTER: GeoCoordinates = {
  latitude: 51.5362,
  longitude: -0.0385,
};

const MILES_PER_DEGREE_LAT = 69.0;

/**
 * Projects a geographic coordinate onto a normalized 2D radar plane relative
 * to `center` and `radiusMiles`.
 */
export function projectCoordsToRadar(
  target: GeoCoordinates,
  center: GeoCoordinates,
  radiusMiles: number = 2.0,
  maxNormRadius: number = 0.82
): ProjectedRadarPoint {
  const safeRadius = Math.max(radiusMiles, 0.1);
  const latRad = (center.latitude * Math.PI) / 180;
  const milesPerDegreeLon = Math.max(MILES_PER_DEGREE_LAT * Math.cos(latRad), 0.01);

  const deltaEastMiles = (target.longitude - center.longitude) * milesPerDegreeLon;
  const deltaNorthMiles = (target.latitude - center.latitude) * MILES_PER_DEGREE_LAT;

  const rawDistMiles = computeDistanceMiles(
    center.latitude,
    center.longitude,
    target.latitude,
    target.longitude
  );

  // Bearing: 0 deg = North, 90 deg = East
  const bearingRad = Math.atan2(deltaEastMiles, deltaNorthMiles);
  const bearingDegrees = (Math.round((bearingRad * 180) / Math.PI) + 360) % 360;

  // Normalize relative to safeRadius
  let nx = (deltaEastMiles / safeRadius) * maxNormRadius;
  let ny = (-deltaNorthMiles / safeRadius) * maxNormRadius; // North is negative Y (top of screen)

  const normMag = Math.sqrt(nx * nx + ny * ny);
  let isClamped = false;

  if (normMag > maxNormRadius && normMag > 0) {
    const scale = maxNormRadius / normMag;
    nx *= scale;
    ny *= scale;
    isClamped = true;
  }

  const leftPercent = Number((50 + nx * 50).toFixed(2));
  const topPercent = Number((50 + ny * 50).toFixed(2));

  return {
    nx: Number(nx.toFixed(4)),
    ny: Number(ny.toFixed(4)),
    leftPercent,
    topPercent,
    distanceMiles: rawDistMiles,
    bearingDegrees,
    isClamped,
  };
}

/**
 * Converts a normalized canvas tap offset (nx, ny in [-1, 1] where (0,0) is center)
 * back into geographic coordinates given the radar `center` and `radiusMiles`.
 */
export function canvasTapToCoords(
  nx: number,
  ny: number,
  center: GeoCoordinates,
  radiusMiles: number = 2.0,
  maxNormRadius: number = 0.82
): GeoCoordinates {
  const safeRadius = Math.max(radiusMiles, 0.1);
  const clampedNx = Math.max(-1, Math.min(1, nx));
  const clampedNy = Math.max(-1, Math.min(1, ny));

  const latRad = (center.latitude * Math.PI) / 180;
  const milesPerDegreeLon = Math.max(MILES_PER_DEGREE_LAT * Math.cos(latRad), 0.01);

  const deltaEastMiles = (clampedNx / maxNormRadius) * safeRadius;
  const deltaNorthMiles = (-clampedNy / maxNormRadius) * safeRadius;

  const latitude = Number((center.latitude + deltaNorthMiles / MILES_PER_DEGREE_LAT).toFixed(6));
  const longitude = Number((center.longitude + deltaEastMiles / milesPerDegreeLon).toFixed(6));

  return { latitude, longitude };
}

/**
 * Computes the visual pixel radius of the 200m Geo-Shield privacy buffer
 * given the canvas pixel width and active radar radius in miles.
 */
export function getPrivacyShieldPixelRadius(
  canvasDiameterPx: number,
  radiusMiles: number,
  shieldMeters: number = 200,
  maxNormRadius: number = 0.82
): number {
  const shieldMiles = shieldMeters / 1609.34;
  const safeRadius = Math.max(radiusMiles, 0.1);
  const usableRadiusPx = (canvasDiameterPx / 2) * maxNormRadius;
  const rawPx = (shieldMiles / safeRadius) * usableRadiusPx;
  return Math.max(14, Math.min(64, Math.round(rawPx)));
}
