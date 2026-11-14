'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeTrip } from '@/lib/db';
import { cumulativeDistances, formatINR, progressAlong } from '@/lib/fare';
import type { Trip } from '@/lib/types';

const LiveMap = dynamic(() => import('@/components/Map'), { ssr: false });

export default function PublicTrackPage({ params }: { params: { tripId: string } }) {
  const tripId = decodeURIComponent(params.tripId);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    return subscribeTrip(
      tripId,
      (t) => {
        setTrip(t);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [tripId]);

  const cumulative = useMemo(
    () => (trip ? cumulativeDistances(trip.routeCoordinates) : []),
    [trip?.id, trip?.routeCoordinates.length],
  );
  const progress =
    !trip
      ? 0
      : trip.status === 'completed'
        ? 1
        : trip.status === 'in_transit' && trip.driverLocation
          ? progressAlong(trip.routeCoordinates, cumulative, trip.driverLocation)
          : 0;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#090D16] text-slate-100">
      <div className="absolute inset-0">
        <LiveMap
          pickup={trip?.from.position ?? null}
          drop={trip?.to.position ?? null}
          route={trip?.routeCoordinates ?? []}
          driverLocation={trip?.driverLocation ?? null}
          followDriver={trip?.status === 'in_transit'}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1100] p-3 md:p-4">
        <div className="pointer-events-auto mx-auto flex h-14 max-w-5xl items-center justify-between rounded-2xl border border-white/10 bg-slate-900/85 px-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-extrabold text-white">
              UR
            </div>
            <div>
              <div className="text-xs font-bold text-white">UniRide Live Safety Share</div>
              <div className="font-mono text-[10px] text-slate-400">Trip ID: {tripId}</div>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-110"
          >
            Open App
          </Link>
        </div>
      </header>

      <div className="absolute inset-x-3 bottom-3 z-[1100] max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-5 shadow-glass-lg backdrop-blur-2xl md:left-4 md:bottom-4">
        {!loaded ? (
          <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300">
            <span className="h-2 w-2 animate-ping rounded-full bg-indigo-400" />
            <span>Loading live trip telemetry…</span>
          </div>
        ) : !trip ? (
          <div className="text-xs font-semibold text-rose-400">Trip not found or no longer active.</div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">
                Driver: {trip.driverName}{' '}
                {trip.driverVerified && <span className="text-emerald-400">✓</span>}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {trip.status} ({Math.round(progress * 100)}%)
              </span>
            </div>
            {trip.vehicle && (
              <div className="inline-block rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                🚘 {trip.vehicle.color} {trip.vehicle.model} · {trip.vehicle.plate}
              </div>
            )}
            <div className="space-y-1 rounded-xl bg-slate-950/50 p-2.5">
              <div className="truncate text-slate-200">🟢 {trip.from.label}</div>
              <div className="truncate text-slate-300">🔴 {trip.to.label}</div>
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {trip.distanceKm.toFixed(1)} km · {formatINR(trip.pricePerSeat)}/seat
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
