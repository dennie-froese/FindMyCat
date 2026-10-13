/**
 * Find My Cat — Dual-Zone Privacy Shield Engine
 * Implements differential geo-jittering to safeguard residential privacy
 * and prevent pet-theft targeting while preserving local discovery utility.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Applies a randomized 150m – 250m buffer (averaging ~200m) to a coordinate.
 * Uses uniform random angle and distance distribution.
 */
export function applyPrivacyShield(
  latitude: number,
  longitude: number,
  minRadiusMeters: number = 150,
  maxRadiusMeters: number = 250
): { latitude: number; longitude: number; offsetMeters: number } {
  // Random distance between min and max radius
  const distance = minRadiusMeters + Math.random() * (maxRadiusMeters - minRadiusMeters);
  
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

  const jitteredLat = (jitteredLatRad * 180) / Math.PI;
  const jitteredLon = (jitteredLonRad * 180) / Math.PI;

  return {
    latitude: Number(jitteredLat.toFixed(6)),
    longitude: Number(jitteredLon.toFixed(6)),
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
