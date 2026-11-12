'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  adminDeleteUser,
  adminUpdateUser,
  deleteTrip,
  resolveSos,
  subscribeAllBookings,
  subscribeAllTrips,
  subscribeAllUsers,
  subscribeSos,
} from '@/lib/db';
import { formatINR } from '@/lib/fare';
import type { Booking, Role, SosAlert, Trip, UserProfile } from '@/lib/types';

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sosList, setSosList] = useState<SosAlert[]>([]);
  const [tab, setTab] = useState<'overview' | 'users' | 'trips' | 'sos'>('overview');

  useEffect(() => {
    const u1 = subscribeAllUsers(setUsers);
    const u2 = subscribeAllTrips(setTrips);
    const u3 = subscribeAllBookings(setBookings);
    const u4 = subscribeSos(setSosList);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const completedTrips = trips.filter((t) => t.status === 'completed').length;
  const acceptedBookings = bookings.filter((b) => b.status === 'accepted');
  const totalVolume = acceptedBookings.reduce((acc, b) => acc + b.fare, 0);
  const openSos = sosList.filter((s) => !s.resolved);

  return (
    <main className="min-h-[100dvh] bg-[#F5F5F0] text-black">
      <header className="flex h-14 items-center justify-between border-b-2 border-black bg-[#0A0A0A] px-4 text-white">
        <div className="flex items-center gap-3">
          <span className="border-2 border-black bg-[#FBBF24] px-2 py-0.5 font-mono text-xs font-bold text-black">
            ADMIN
          </span>
          <span className="font-bold uppercase tracking-wider">Uniride Control Center</span>
        </div>
        <Link
          href="/"
          className="border-2 border-black bg-[#FBBF24] px-3 py-1 font-mono text-xs font-bold uppercase text-black"
        >
          ← Back to Map
        </Link>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000]">
            <div className="font-mono text-[10px] font-bold uppercase text-black/60">Registered Users</div>
            <div className="mt-1 font-mono text-3xl font-bold">{users.length}</div>
          </div>
          <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000]">
            <div className="font-mono text-[10px] font-bold uppercase text-black/60">Trips (Completed)</div>
            <div className="mt-1 font-mono text-3xl font-bold">
              {trips.length} <span className="text-sm">({completedTrips})</span>
            </div>
          </div>
          <div className="border-2 border-black bg-[#FBBF24] p-4 shadow-[4px_4px_0px_0px_#000]">
            <div className="font-mono text-[10px] font-bold uppercase text-black/60">Seat Volume</div>
            <div className="mt-1 font-mono text-3xl font-bold">{formatINR(totalVolume)}</div>
          </div>
          <div className="border-2 border-black bg-[#EF4444] p-4 text-white shadow-[4px_4px_0px_0px_#000]">
            <div className="font-mono text-[10px] font-bold uppercase">Active SOS Alerts</div>
            <div className="mt-1 font-mono text-3xl font-bold">{openSos.length}</div>
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="flex flex-wrap gap-2">
          {(['overview', 'users', 'trips', 'sos'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-2 border-black px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0px_0px_#000] ${
                tab === t ? 'bg-[#FBBF24]' : 'bg-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000]">
              <h2 className="font-mono text-xs font-bold uppercase">Recent Bookings ({bookings.length})</h2>
              <ul className="mt-3 space-y-2 text-xs">
                {bookings.slice(0, 10).map((b) => (
                  <li key={b.id} className="flex items-center justify-between border-b border-black/15 pb-1.5">
                    <span>
                      <strong>{b.riderName}</strong> · {b.fromLabel} → {b.toLabel} ({b.seats} seat)
                    </span>
                    <span className="font-mono font-bold uppercase">
                      {formatINR(b.fare)} [{b.status}]
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000]">
              <h2 className="font-mono text-xs font-bold uppercase">SOS Feed ({sosList.length})</h2>
              <ul className="mt-3 space-y-2 text-xs">
                {sosList.slice(0, 8).map((s) => (
                  <li key={s.id} className="flex items-center justify-between border-b border-black/15 pb-1.5">
                    <span>
                      🚨 <strong>{s.name}</strong> ({s.phone}) · Trip {s.tripId}
                    </span>
                    {s.resolved ? (
                      <span className="font-mono text-[10px] uppercase text-black/50">Resolved</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resolveSos(s.id)}
                        className="border border-black bg-[#22C55E] px-2 py-0.5 font-mono text-[10px] font-bold"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="overflow-x-auto border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-black bg-[#0A0A0A] font-mono uppercase text-white">
                <tr>
                  <th className="p-3">Name / College ID</th>
                  <th className="p-3">Email / Phone</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Verified</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid} className="border-b border-black/15">
                    <td className="p-3 font-bold">
                      {u.name} <span className="font-mono text-[10px] text-black/60">({u.collegeId || '—'})</span>
                    </td>
                    <td className="p-3 font-mono">
                      {u.email} · {u.phone}
                    </td>
                    <td className="p-3">
                      <select
                        value={u.role}
                        onChange={(e) => adminUpdateUser(u.uid, { role: e.target.value as Role })}
                        className="border border-black px-2 py-1 font-mono text-xs font-bold"
                      >
                        <option value="rider">rider</option>
                        <option value="driver">driver</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => adminUpdateUser(u.uid, { verified: !u.verified })}
                        className={`border border-black px-2 py-0.5 font-mono text-[10px] font-bold ${
                          u.verified ? 'bg-[#22C55E]' : 'bg-white'
                        }`}
                      >
                        {u.verified ? '✓ Verified' : 'Unverified'}
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => adminDeleteUser(u.uid)}
                        className="border border-black bg-[#EF4444] px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'trips' && (
          <div className="space-y-2">
            {trips.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border-2 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000] text-xs"
              >
                <div>
                  <strong>{t.driverName}</strong> · {t.from.label} → {t.to.label} ({t.seatsAvailable}/{t.seatsTotal}{' '}
                  seats · {formatINR(t.pricePerSeat)}/seat) [{t.status}]
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/track/${encodeURIComponent(t.id)}`}
                    className="border border-black bg-[#FBBF24] px-2 py-1 font-mono text-[10px] font-bold uppercase"
                  >
                    Track
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteTrip(t.id)}
                    className="border border-black bg-[#EF4444] px-2 py-1 font-mono text-[10px] font-bold uppercase text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'sos' && (
          <div className="space-y-2">
            {sosList.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between border-2 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000] text-xs"
              >
                <div>
                  🚨 <strong>{s.name}</strong> ({s.phone}) · Trip <code className="font-mono">{s.tripId}</code>
                  {s.location && (
                    <span className="ml-2 font-mono">
                      [{s.location[0].toFixed(4)}, {s.location[1].toFixed(4)}]
                    </span>
                  )}
                </div>
                {!s.resolved && (
                  <button
                    type="button"
                    onClick={() => resolveSos(s.id)}
                    className="border-2 border-black bg-[#22C55E] px-3 py-1 font-mono text-xs font-bold uppercase"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

