/**
 * Find My Cat — Dual-Zone Privacy Shield Engine
 * Implements differential geo-jittering to safeguard residential privacy
 * and prevent pet-theft targeting while preserving local discovery utility.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Applies a randomized 100m – 200m buffer (averaging ~155m) to a coordinate.
 * Uses uniform annular area distribution: r = sqrt(u * (R_max^2 - R_min^2) + R_min^2)
 */
export function applyPrivacyShield(
  latitude: number,
  longitude: number,
  minRadiusMeters: number = 100,
  maxRadiusMeters: number = 200
): { latitude: number; longitude: number; offsetMeters: number } {
  // Uniform areal sampling within the annulus to prevent center clustering
  const u = Math.random();
  const distance = Math.sqrt(u * (maxRadiusMeters ** 2 - minRadiusMeters ** 2) + minRadiusMeters ** 2);
  
  // Random bearing in radians (0 to 2*PI)
  const bearing = Math.random() * 2 * Math.PI;

  const latRad = (latitude * Math.PI) / 180;
  const lonRad = (longitude * Math.PI) / 180;

  const angularDistance = distance / EARTH_RADIUS_METERS;

  const jitteredLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
    Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const jitteredLonRad = lonRad + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
    Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(jitteredLatRad)
  );

  let finalLat = Number(((jitteredLatRad * 180) / Math.PI).toFixed(6));
  let finalLon = Number(((jitteredLonRad * 180) / Math.PI).toFixed(6));

  // If a random bearing lands exactly along a cardinal axis, rounding to 6 decimal
  // places can occasionally produce identical single-axis values (e.g. 0m latitude shift due East).
  // Guarantee that both individual coordinate axes measurably differ from the raw coordinate.
  if (finalLat === latitude) {
    finalLat = Number((finalLat + (Math.sin(bearing) >= 0 ? 0.00001 : -0.00001)).toFixed(6));
  }
  if (finalLon === longitude) {
    finalLon = Number((finalLon + (Math.cos(bearing) >= 0 ? 0.00001 : -0.00001)).toFixed(6));
  }

  return {
    latitude: finalLat,
    longitude: finalLon,
    offsetMeters: Math.round(distance),
  };
}

/**
 * Calculates distance between two coordinates in miles using Haversine formula.
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Radius of the Earth in miles
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

/**
 * Formats a distance into human-friendly string.
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) {
    return 'Immediate vicinity (<500 ft)';
  }
  return `${miles} mi away`;
}
