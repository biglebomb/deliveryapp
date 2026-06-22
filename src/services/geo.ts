import { requireSupabase } from '../lib/supabase';
import type { GeoPoint } from '../lib/route';

/** True if the string looks like a Google Maps share link. */
export function isMapsLink(text: string): boolean {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\./i.test(text);
}

/** Resolve a Google Maps link to coordinates via the resolve-maps-link edge function. */
export async function resolveMapsLink(url: string): Promise<GeoPoint | null> {
  const { data, error } = await requireSupabase().functions.invoke('resolve-maps-link', { body: { url } });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'lat' in data && 'lng' in data) {
    return { lat: Number((data as { lat: number }).lat), lng: Number((data as { lng: number }).lng) };
  }
  return null;
}
