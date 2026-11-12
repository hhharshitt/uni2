import type { LatLng, Place, RouteResult } from './types';

export const RATE_PER_KM = 32;
export const JAIPUR_CENTER: LatLng = [26.9124, 75.7873];
export const JAIPUR_ZOOM = 13;
export const JAIPUR_VIEWBOX = '75.6,26.7,76.0,27.1';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const MAX_ROUTE_POINTS = 400;

export const JAIPUR_PLACES: Place[] = [
  { label: 'MI Road', position: [26.9172, 75.8095] },
  { label: 'Mansarovar', position: [26.859, 75.764] },
  { label: 'MUJ Campus', position: [26.8436, 75.5652] },
  { label: 'Malviya Nagar', position: [26.8535, 75.8145] },
  { label: 'Hawa Mahal', position: [26.9239, 75.8267] },
  { label: 'Jaipur Junction', position: [26.9196, 75.788] },
  { label: 'Vaishali Nagar', position: [26.912, 75.743] },
  { label: 'Jaipur Airport', position: [26.8242, 75.8122] },
];

// ---------------------------------------------------------------- fare

export function calculateFare(distanceInMeters: number): number {
  return Math.round((distanceInMeters / 1000) * RATE_PER_KM);
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatLatLng(p: LatLng): string {
  return `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`;
}

/** Simulated trip length for the driver demo: real ETA compressed 8x, clamped to 25–90 s. */
export function simulationDuration(durationSeconds: number): number {
  return Math.min(90000, Math.max(25000, Math.round((durationSeconds * 1000) / 8)));
}

// ---------------------------------------------------------------- polyline

/** Decodes a Google/OSRM encoded polyline into [lat, lng] pairs. */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const coords: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

export function simplifyRoute(coords: LatLng[], maxPoints = MAX_ROUTE_POINTS): LatLng[] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => coords[Math.round(i * step)]);
}

// ---------------------------------------------------------------- routing

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: { distance: number; duration: number; geometry: string }[];
}

export async function fetchRoute(pickup: LatLng, drop: LatLng, signal?: AbortSignal): Promise<RouteResult> {
  const url =
    `${OSRM_URL}/${pickup[1]},${pickup[0]};${drop[1]},${drop[0]}` +
    '?overview=full&geometries=polyline&alternatives=false&steps=false';

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error('Routing server unreachable. Check your connection.');
  }
  if (res.status === 429) throw new Error('Routing server is rate-limiting. Retry in a few seconds.');
  if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status}).`);

  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(data.message ?? 'No drivable route between these points.');
  }

  const route = data.routes[0];
  const decoded = decodePolyline(route.geometry);
  const coordinates = simplifyRoute(decoded.length >= 2 ? decoded : [pickup, drop]).map(
    (p) => [round6(p[0]), round6(p[1])] as LatLng,
  );

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    distanceKm: Math.round(route.distance / 100) / 10,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    fare: calculateFare(route.distance),
    coordinates,
  };
}

// ---------------------------------------------------------------- geocoding

interface NominatimSearchResult {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

function shortLabel(displayName: string, name?: string): string {
  const parts = displayName
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const head = name && name.length > 0 ? name : parts[0] ?? displayName;
  const rest = parts.filter((p) => p !== head).slice(0, 2);
  return [head, ...rest].join(', ');
}

export async function searchPlaces(term: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: term,
    viewbox: JAIPUR_VIEWBOX,
    bounded: '1',
    limit: '6',
    countrycodes: 'in',
    'accept-language': 'en',
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('Search is rate-limited. Slow down a little.');
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}).`);
  const data = (await res.json()) as NominatimSearchResult[];
  return data.map((d) => ({
    label: shortLabel(d.display_name, d.name),
    position: [Number(d.lat), Number(d.lon)] as LatLng,
  }));
}

export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(p[0]),
    lon: String(p[1]),
    zoom: '17',
    'accept-language': 'en',
  });
  try {
    const res = await fetch(`${NOMINATIM_URL}/reverse?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return formatLatLng(p);
    const data = (await res.json()) as { display_name?: string; name?: string };
    return data.display_name ? shortLabel(data.display_name, data.name) : formatLatLng(p);
  } catch {
    return formatLatLng(p);
  }
}

// ---------------------------------------------------------------- geometry

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing in degrees (0 = north, clockwise). */
export function bearing(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a[0]);
  const phi2 = toRad(b[0]);
  const dLambda = toRad(b[1] - a[1]);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function cumulativeDistances(coords: LatLng[]): number[] {
  const out: number[] = coords.length ? [0] : [];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  return out;
}

/** Interpolated position at `fraction` (0..1) of the route's length. */
export function pointAlong(coords: LatLng[], cumulative: number[], fraction: number): LatLng {
  if (coords.length === 0) return [0, 0];
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (coords.length === 1 || total <= 0 || fraction <= 0) return coords[0];
  if (fraction >= 1) return coords[coords.length - 1];

  const target = total * fraction;
  let lo = 1;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const segStart = cumulative[lo - 1];
  const segLen = cumulative[lo] - segStart;
  const t = segLen > 0 ? (target - segStart) / segLen : 0;
  const a = coords[lo - 1];
  const b = coords[lo];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Fraction of the route completed, based on the nearest route vertex to `point`. */
export function progressAlong(coords: LatLng[], cumulative: number[], point: LatLng): number {
  if (coords.length < 2) return 0;
  const total = cumulative[cumulative.length - 1];
  if (!total) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(coords[i], point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return Math.min(1, cumulative[best] / total);
}

