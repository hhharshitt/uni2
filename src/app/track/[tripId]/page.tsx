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
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#1C1C1C]">
      <div className="absolute inset-0">
        <LiveMap
          pickup={trip?.from.position ?? null}
          drop={trip?.to.position ?? null}
          route={trip?.routeCoordinates ?? []}
          driverLocation={trip?.driverLocation ?? null}
          followDriver={trip?.status === 'in_transit'}
        />
      </div>

      <header className="absolute inset-x-0 top-0 z-[1100] flex h-14 items-center justify-between border-b-2 border-black bg-[#FBBF24] px-4">
        <div className="font-mono text-xs font-bold uppercase">
          Uniride // Live Safety Share · {tripId}
        </div>
        <Link
          href="/"
          className="border-2 border-black bg-white px-3 py-1 font-mono text-xs font-bold uppercase shadow-[2px_2px_0px_0px_#000]"
        >
          Open Console
        </Link>
      </header>

      <div className="absolute inset-x-3 bottom-3 z-[1100] max-w-md border-2 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
        {!loaded ? (
          <div className="font-mono text-xs font-bold uppercase">Loading trip telemetry…</div>
        ) : !trip ? (
          <div className="font-mono text-xs font-bold uppercase text-[#EF4444]">Trip not found.</div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase">
                Driver: {trip.driverName} {trip.driverVerified ? '✓' : ''}
              </span>
              <span className="border-2 border-black bg-[#FBBF24] px-2 py-0.5 font-mono font-bold uppercase">
                {trip.status} ({Math.round(progress * 100)}%)
              </span>
            </div>
            {trip.vehicle && (
              <div className="font-mono text-[11px]">
                Vehicle: {trip.vehicle.color} {trip.vehicle.model} · {trip.vehicle.plate}
              </div>
            )}
            <div className="font-bold">🟢 {trip.from.label}</div>
            <div className="font-bold">🔴 {trip.to.label}</div>
            <div className="font-mono text-[11px] text-black/60">
              {trip.distanceKm.toFixed(1)} km · {formatINR(trip.pricePerSeat)}/seat
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

