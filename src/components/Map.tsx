'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { JAIPUR_CENTER, JAIPUR_ZOOM, bearing, haversine } from '@/lib/fare';
import type { LatLng } from '@/lib/types';

export interface MapFocus {
  position: LatLng;
  key: number;
}

export interface MapProps {
  pickup: LatLng | null;
  drop: LatLng | null;
  route: LatLng[];
  driverLocation: LatLng | null;
  onMapClick?: (position: LatLng) => void;
  clickEnabled?: boolean;
  followDriver?: boolean;
  focus?: MapFocus | null;
}

// ---------------------------------------------------------------- Modern glowing SVG markers

function pinSvg(fill: string, ring: string, letter: string): string {
  return `
    <svg width="42" height="52" viewBox="0 0 42 52" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 8px 14px rgba(0,0,0,0.5));">
      <defs>
        <radialGradient id="glow-${letter}" cx="50%" cy="38%" r="50%">
          <stop offset="0%" stop-color="${ring}" stop-opacity="1"/>
          <stop offset="100%" stop-color="${fill}" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <path d="M21 2C10.5 2 2 10.4 2 20.8 2 34.5 21 50 21 50s19-15.5 19-29.2C40 10.4 31.5 2 21 2z"
        fill="url(#glow-${letter})" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="21" cy="20" r="10.5" fill="#0F172A" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <text x="21" y="24.2" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
        font-size="11.5" font-weight="800" fill="#FFFFFF">${letter}</text>
    </svg>`;
}

const CAB_HTML = `
  <div class="cab-rot">
    <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="carBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#818CF8"/>
          <stop offset="100%" stop-color="#4F46E5"/>
        </linearGradient>
      </defs>
      <!-- Headlight beams -->
      <polygon points="15,6 11,0 19,0" fill="rgba(165, 243, 252, 0.35)"/>
      <polygon points="33,6 29,0 37,0" fill="rgba(165, 243, 252, 0.35)"/>
      <!-- Wheels -->
      <rect x="10" y="11" width="3" height="7" rx="1.5" fill="#0F172A"/>
      <rect x="35" y="11" width="3" height="7" rx="1.5" fill="#0F172A"/>
      <rect x="10" y="29" width="3" height="7" rx="1.5" fill="#0F172A"/>
      <rect x="35" y="29" width="3" height="7" rx="1.5" fill="#0F172A"/>
      <!-- Sleek Car Body -->
      <rect x="12.5" y="5" width="23" height="38" rx="8" fill="url(#carBody)" stroke="#E0E7FF" stroke-width="1.8"/>
      <!-- Windshield & Rear Window -->
      <path d="M15.5 15 C15.5 12.5, 32.5 12.5, 32.5 15 L31 20.5 L17 20.5 Z" fill="#0F172A"/>
      <rect x="16.5" y="21.5" width="15" height="9" rx="3" fill="#6366F1" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
      <path d="M17 32 L31 32 L32 36.5 C32 37.5, 16 37.5, 16 36.5 Z" fill="#0F172A"/>
      <!-- Headlights & Taillights -->
      <rect x="15" y="6" width="4.5" height="2" rx="1" fill="#A5F3FC"/>
      <rect x="28.5" y="6" width="4.5" height="2" rx="1" fill="#A5F3FC"/>
      <rect x="15.5" y="40.5" width="4.5" height="1.8" rx="0.9" fill="#FB7185"/>
      <rect x="28" y="40.5" width="4.5" height="1.8" rx="0.9" fill="#FB7185"/>
    </svg>
  </div>`;

const pickupIcon = L.divIcon({
  className: 'uni-icon',
  html: pinSvg('#059669', '#34D399', 'A'),
  iconSize: [42, 52],
  iconAnchor: [21, 50],
});
const dropIcon = L.divIcon({
  className: 'uni-icon',
  html: pinSvg('#E11D48', '#FB7185', 'B'),
  iconSize: [42, 52],
  iconAnchor: [21, 50],
});
const cabIcon = L.divIcon({
  className: 'uni-icon',
  html: CAB_HTML,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

// ---------------------------------------------------------------- behaviours

function ClickCapture({ enabled, onClick }: { enabled: boolean; onClick?: (p: LatLng) => void }) {
  const map = useMapEvents({
    click(e) {
      if (enabled && onClick) onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = enabled ? 'crosshair' : '';
  }, [enabled, map]);
  return null;
}

function FitView({ points }: { points: LatLng[] }) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const first = points[0];
  const last = points[points.length - 1];
  const signature = first && last ? `${points.length}:${first[0]},${first[1]}:${last[0]},${last[1]}` : 'none';

  useEffect(() => {
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    map.fitBounds(L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1]))), {
      paddingTopLeft: desktop ? L.point(480, 100) : L.point(30, 100),
      paddingBottomRight: desktop ? L.point(70, 70) : L.point(30, Math.round(window.innerHeight * 0.5)),
      maxZoom: 16,
      animate: true,
    });
  }, [signature, map]);
  return null;
}

function FocusOn({ focus }: { focus: MapFocus | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo(focus.position, Math.max(map.getZoom(), 15), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, map]);
  return null;
}

/** Cab marker that tweens between 1 Hz Firebase updates with requestAnimationFrame. */
function CabMarker({ position, follow }: { position: LatLng; follow: boolean }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const initialPosition = useRef<LatLng>(position);
  const current = useRef<LatLng>(position);
  const heading = useRef(0);

  const lat = position[0];
  const lng = position[1];

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const from = current.current;
    const to: LatLng = [lat, lng];
    const distance = haversine(from, to);

    if (distance > 2) heading.current = bearing(from, to);
    const rotor = marker.getElement()?.querySelector<HTMLElement>('.cab-rot');
    if (rotor) rotor.style.transform = `rotate(${heading.current}deg)`;

    if (follow) map.panTo(to, { animate: true, duration: 0.9 });

    if (distance < 0.5 || distance > 3000) {
      marker.setLatLng(to);
      current.current = to;
      return;
    }

    const start = performance.now();
    const DURATION = 950;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const next: LatLng = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      marker.setLatLng(next);
      current.current = next;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng, follow, map]);

  return <Marker ref={markerRef} position={initialPosition.current} icon={cabIcon} zIndexOffset={1000} keyboard={false} />;
}

// ---------------------------------------------------------------- map

export default function LiveMap({
  pickup,
  drop,
  route,
  driverLocation,
  onMapClick,
  clickEnabled = false,
  followDriver = false,
  focus = null,
}: MapProps) {
  const fitPoints: LatLng[] = route.length >= 2 ? route : pickup && drop ? [pickup, drop] : [];

  return (
    <MapContainer
      center={JAIPUR_CENTER}
      zoom={JAIPUR_ZOOM}
      zoomControl={false}
      className="h-full w-full"
      worldCopyJump={false}
    >
      <TileLayer
        className="map-tiles"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Routing <a href="https://project-osrm.org">OSRM</a>'
        maxZoom={19}
      />
      <ZoomControl position="topright" />
      <ClickCapture enabled={clickEnabled} onClick={onMapClick} />
      <FitView points={fitPoints} />
      <FocusOn focus={focus} />

      {route.length >= 2 && (
        <>
          <Polyline
            positions={route}
            pathOptions={{ color: '#4F46E5', weight: 11, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }}
          />
          <Polyline
            positions={route}
            pathOptions={{ color: '#818CF8', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
          />
        </>
      )}

      {pickup && <Marker position={pickup} icon={pickupIcon} keyboard={false} />}
      {drop && <Marker position={drop} icon={dropIcon} keyboard={false} />}
      {driverLocation && <CabMarker position={driverLocation} follow={followDriver} />}
    </MapContainer>
  );
}
