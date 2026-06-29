import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { haversine, type GeoPoint, type RouteStop } from './route';

export function getMapsApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
}

export const isMapsConfigured = Boolean(getMapsApiKey());

let mapsPromise: Promise<typeof google.maps> | null = null;

/** Load the Google Maps JS SDK once and return the `google.maps` namespace. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  const apiKey = getMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps is not configured. Set VITE_GOOGLE_MAPS_API_KEY.'));
  }
  if (!mapsPromise) {
    setOptions({ key: apiKey, v: 'weekly' });
    mapsPromise = Promise.all([
      importLibrary('maps'),
      importLibrary('routes'),
      importLibrary('geocoding')
    ]).then(() => google.maps);
  }
  return mapsPromise;
}

/** Geocode a free-text address to coordinates (needs the Geocoding API enabled). */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const maps = await loadGoogleMaps();
  const geocoder = new maps.Geocoder();
  const { results } = await geocoder.geocode({ address });
  const loc = results[0]?.geometry?.location;
  return loc ? { lat: Number(loc.lat().toFixed(6)), lng: Number(loc.lng().toFixed(6)) } : null;
}

export interface OptimizedRoute {
  /** Stops in optimal visit order. */
  orderedStops: RouteStop[];
  /** Raw Directions result for rendering the road path. */
  directions: google.maps.DirectionsResult;
}

/**
 * Real road-distance route optimization via the Directions API.
 *
 * When `returnTo` is given (e.g. the branch), it's a round trip: every stop is
 * an optimized waypoint and the route ends back at `returnTo`, so the run clears
 * the far stops and finishes near base. Without it, the farthest stop becomes
 * the destination — an open path with no forced return.
 */
export async function optimizeRoute(
  start: GeoPoint,
  stops: RouteStop[],
  returnTo?: GeoPoint | null
): Promise<OptimizedRoute> {
  const maps = await loadGoogleMaps();
  const service = new maps.DirectionsService();

  if (returnTo) {
    const waypoints = stops.map((stop) => ({
      location: { lat: stop.lat, lng: stop.lng },
      stopover: true
    }));
    const directions = await service.route({
      origin: { lat: start.lat, lng: start.lng },
      destination: { lat: returnTo.lat, lng: returnTo.lng },
      waypoints,
      optimizeWaypoints: true,
      travelMode: maps.TravelMode.DRIVING,
      // Motorbikes can't use Indonesian toll roads — keep the route on roads they can ride.
      avoidTolls: true
    });
    const order = directions.routes[0]?.waypoint_order ?? stops.map((_, i) => i);
    return { orderedStops: order.map((i) => stops[i]), directions };
  }

  const pool = [...stops];
  // Destination = stop farthest from the start point.
  let destIndex = 0;
  let farthest = -Infinity;
  pool.forEach((stop, index) => {
    const distance = haversine(start, stop);
    if (distance > farthest) {
      farthest = distance;
      destIndex = index;
    }
  });
  const [destination] = pool.splice(destIndex, 1);

  const waypoints = pool.map((stop) => ({
    location: { lat: stop.lat, lng: stop.lng },
    stopover: true
  }));

  const directions = await service.route({
    origin: { lat: start.lat, lng: start.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    waypoints,
    optimizeWaypoints: true,
    travelMode: maps.TravelMode.DRIVING,
    avoidTolls: true
  });

  const order = directions.routes[0]?.waypoint_order ?? pool.map((_, i) => i);
  const orderedMiddle = order.map((i) => pool[i]);
  const orderedStops = [...orderedMiddle, destination];

  return { orderedStops, directions };
}
