import OpenLocationCodePkg from 'open-location-code';

// The package's default export is a module object whose `OpenLocationCode` is the class.
const OLClass =
  OpenLocationCodePkg.OpenLocationCode ?? OpenLocationCodePkg.default?.OpenLocationCode ?? OpenLocationCodePkg;
const olc = typeof OLClass === 'function' ? new OLClass() : OLClass;

const MAPS_URL_RE =
  /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\/\S+)/i;
const PLUS_CODE_RE = /([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i;

export function extractMapsUrl(text: string): string | null {
  const match = text.match(MAPS_URL_RE);
  return match ? match[1] : null;
}

function mk(lat: number, lng: number): { lat: number; lng: number } | null {
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  }
  return null;
}

/** Coordinates embedded directly in a Google Maps URL (older @lat,lng / !3d!4d / q= styles). */
function extractCoords(s: string): { lat: number; lng: number } | null {
  let m = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) return mk(Number(m[1]), Number(m[2]));
  m = s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (m) return mk(Number(m[1]), Number(m[2]));
  m = s.match(/(?:[?&](?:q|query|ll|destination|center|sll)=)(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) return mk(Number(m[1]), Number(m[2]));
  return null;
}

/** The decoded place name from a `/maps/place/<name>/` URL. */
function placeName(url: string): string | null {
  const m = url.match(/\/maps\/place\/([^/]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() : null;
}

async function geocodeNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'milk-delivery-bot/1.0' } });
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  return data[0] ? mk(Number(data[0].lat), Number(data[0].lon)) : null;
}

/** Coarse reference point for recovering a short Plus Code: geocode trailing address parts. */
async function referencePoint(address: string): Promise<{ lat: number; lng: number } | null> {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  for (let n = 2; n <= Math.min(4, parts.length); n++) {
    const hit = await geocodeNominatim(parts.slice(parts.length - n).join(', '));
    if (hit) return hit;
  }
  return null;
}

/** Follow a Google Maps share link → coordinates (URL coords, Plus Code, or geocoded address). */
export async function resolveMapsLink(url: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' }
  });
  const finalUrl = res.url;
  let coords = extractCoords(finalUrl);
  if (coords) return coords;
  coords = extractCoords(await res.text());
  if (coords) return coords;

  const name = placeName(finalUrl);
  if (!name) return null;

  const plus = name.match(PLUS_CODE_RE)?.[1]?.toUpperCase();
  const address = name.replace(PLUS_CODE_RE, '').replace(/^[\s,]+/, '').trim();
  try {
    if (plus && olc.isFull(plus)) {
      const a = olc.decode(plus);
      return mk(a.latitudeCenter, a.longitudeCenter);
    }
    if (plus && olc.isShort(plus)) {
      const ref = await referencePoint(address || name);
      if (ref) {
        const a = olc.decode(olc.recoverNearest(plus, ref.lat, ref.lng));
        return mk(a.latitudeCenter, a.longitudeCenter);
      }
    }
  } catch {
    // fall through to a coarse address geocode
  }
  return address ? geocodeNominatim(address) : null;
}
