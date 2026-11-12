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

// ---------------------------------------------------------------- icons (DivIcon: no PNG asset bugs)

function pinSvg(fill: string, letter: string): string {
  return `
    <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 2C9.2 2 2 9 2 17.6 2 29.4 18 44 18 44s16-14.6 16-26.4C34 9 26.8 2 18 2z"
        fill="${fill}" stroke="#000" stroke-width="3" stroke-linejoin="miter"/>
      <rect x="10" y="9.5" width="16" height="16" fill="#fff" stroke="#000" stroke-width="2.5"/>
      <text x="18" y="22.5" text-anchor="middle" font-family="ui-monospace,monospace"
        font-size="12" font-weight="800" fill="#000">${letter}</text>
    </svg>`;
}

const CAB_HTML = `
  <div class="cab-rot">
    <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="4" width="20" height="36" fill="#FBBF24" stroke="#000" stroke-width="3"/>
      <rect x="15" y="11" width="14" height="7" fill="#0A0A0A"/>
      <rect x="15" y="29" width="14" height="5" fill="#0A0A0A"/>
      <rect x="13.5" y="5.5" width="4" height="3" fill="#fff"/>
      <rect x="26.5" y="5.5" width="4" height="3" fill="#fff"/>
      <rect x="18" y="20.5" width="8" height="6" fill="#fff" stroke="#000" stroke-width="1.5"/>
      <rect x="9" y="12" width="3" height="6" fill="#000"/>
      <rect x="32" y="12" width="3" height="6" fill="#000"/>
      <rect x="9" y="27" width="3" height="6" fill="#000"/>
      <rect x="32" y="27" width="3" height="6" fill="#000"/>
    </svg>
  </div>`;

const pickupIcon = L.divIcon({ className: 'uni-icon', html: pinSvg('#22C55E', 'P'), iconSize: [36, 46], iconAnchor: [18, 44] });
const dropIcon = L.divIcon({ className: 'uni-icon', html: pinSvg('#EF4444', 'D'), iconSize: [36, 46], iconAnchor: [18, 44] });
const cabIcon = L.divIcon({ className: 'uni-icon', html: CAB_HTML, iconSize: [44, 44], iconAnchor: [22, 22] });

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
      paddingTopLeft: desktop ? L.point(470, 90) : L.point(30, 90),
      paddingBottomRight: desktop ? L.point(60, 60) : L.point(30, Math.round(window.innerHeight * 0.5)),
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
          <Polyline positions={route} pathOptions={{ color: '#000000', weight: 10, opacity: 1, lineCap: 'square', lineJoin: 'miter' }} />
          <Polyline positions={route} pathOptions={{ color: '#FBBF24', weight: 5, opacity: 1, lineCap: 'square', lineJoin: 'miter' }} />
        </>
      )}

      {pickup && <Marker position={pickup} icon={pickupIcon} keyboard={false} />}
      {drop && <Marker position={drop} icon={dropIcon} keyboard={false} />}
      {driverLocation && <CabMarker position={driverLocation} follow={followDriver} />}
    </MapContainer>
  );
}

