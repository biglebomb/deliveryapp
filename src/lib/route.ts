export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteStop extends GeoPoint {
  id: string;
  label: string;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points in kilometres. */
export function haversine(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Order stops by repeatedly hopping to the nearest unvisited stop from `start`.
 * Free, offline fallback used when the Directions API is unavailable. Good enough
 * for a handful of dense local stops; not a true optimum.
 * Returns the stops in visit order.
 */
export function nearestNeighborOrder(start: GeoPoint, stops: RouteStop[]): RouteStop[] {
  const remaining = [...stops];
  const ordered: RouteStop[] = [];
  let current: GeoPoint = start;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, index) => {
      const distance = haversine(current, stop);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = next;
  }

  return ordered;
}

/**
 * Round-trip ordering for a run that returns to base: go to the stop farthest
 * from `base` first, then repeatedly hop to the nearest unvisited stop — so the
 * far deliveries are cleared early and the run ends near base. Offline fallback
 * when the Directions API isn't available.
 */
export function farthestFirstOrder(base: GeoPoint, stops: RouteStop[]): RouteStop[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];

  // Start at the farthest stop from base.
  let startIndex = 0;
  let maxDistance = -Infinity;
  remaining.forEach((stop, index) => {
    const distance = haversine(base, stop);
    if (distance > maxDistance) {
      maxDistance = distance;
      startIndex = index;
    }
  });
  const ordered: RouteStop[] = [remaining.splice(startIndex, 1)[0]];
  let current: GeoPoint = ordered[0];

  // Then nearest-neighbor back toward base.
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, index) => {
      const distance = haversine(current, stop);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = next;
  }
  return ordered;
}

/** Ray-casting point-in-polygon test. Polygon is an ordered ring of points. */
export function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Name of the first area whose polygon contains the point, or null. */
export function assignArea(
  point: GeoPoint,
  areas: { name: string; polygon: GeoPoint[] }[]
): string | null {
  for (const area of areas) {
    if (pointInPolygon(point, area.polygon)) return area.name;
  }
  return null;
}

/**
 * Default delivery fee for an order: the assigned area's fee when it has one,
 * otherwise the branch default. `areaName` is the resolved area (from assignArea).
 */
export function resolveDeliveryFee(
  areaName: string | null,
  areas: { name: string; delivery_fee: number | null }[],
  branchFee: number
): number {
  if (areaName) {
    const area = areas.find((a) => a.name === areaName);
    if (area && area.delivery_fee !== null && area.delivery_fee !== undefined) {
      return Number(area.delivery_fee);
    }
  }
  return Number(branchFee ?? 0);
}

/**
 * Estimated road distance for a delivery run: origin → each stop in order →
 * back to origin, scaled by a road factor (straight-line undercounts real roads).
 * Used for driver mileage; good enough for reimbursement, no API cost.
 */
export function estimateMileageKm(
  origin: GeoPoint,
  stops: GeoPoint[],
  roadFactor = 1.3,
  returnToOrigin = true
): number {
  if (!stops.length) return 0;
  let distance = 0;
  let prev = origin;
  for (const stop of stops) {
    distance += haversine(prev, stop);
    prev = stop;
  }
  if (returnToOrigin) distance += haversine(prev, origin);
  return distance * roadFactor;
}

/** Total path length in km for an ordered list of stops starting from `start`. */
export function routeDistanceKm(start: GeoPoint, ordered: GeoPoint[]): number {
  let total = 0;
  let current = start;
  for (const point of ordered) {
    total += haversine(current, point);
    current = point;
  }
  return total;
}

/** Parse "lat,lng" or a Google Maps URL/share text into a point, or null. */
export function parseLatLng(input: string): GeoPoint | null {
  const text = input.trim();
  if (!text) return null;

  // Plain "lat,lng" (also handles "lat, lng")
  const plain = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (plain) {
    return validPoint(Number(plain[1]), Number(plain[2]));
  }

  // Google Maps "@lat,lng" segment (e.g. .../@-6.21,106.84,17z/...)
  const at = text.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) {
    return validPoint(Number(at[1]), Number(at[2]));
  }

  // "?q=lat,lng" / "query=lat,lng" / "ll=lat,lng" style params
  const param = text.match(/(?:[?&](?:q|query|ll|destination)=)(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (param) {
    return validPoint(Number(param[1]), Number(param[2]));
  }

  return null;
}

function validPoint(lat: number, lng: number): GeoPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Google Maps directions deep link that opens the driver's Maps app with the
 * stops already ordered. Free — no API call. The last stop is the destination,
 * the rest become waypoints in order.
 */
export function googleMapsDirectionsUrl(start: GeoPoint | null, ordered: GeoPoint[]): string {
  if (!ordered.length) return '';
  const destination = ordered[ordered.length - 1];
  const waypoints = ordered.slice(0, -1).map((p) => `${p.lat},${p.lng}`).join('|');

  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`
  });
  if (start) params.set('origin', `${start.lat},${start.lng}`);
  if (waypoints) params.set('waypoints', waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
