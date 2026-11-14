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
    <main className="min-h-[100dvh] bg-[#090D16] text-slate-100">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/15 blur-[130px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-[130px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/80 px-4 py-3.5 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-extrabold text-white shadow-md shadow-indigo-500/30">
              UR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">UniRide Control Center</span>
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">
                  Admin
                </span>
              </div>
              <div className="text-[11px] text-slate-400">Live Telemetry, Verification & Safety Operations</div>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            ← Back to Live Map
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Registered Users
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-white">{users.length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Total Trips (Done)
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-white">
              {trips.length} <span className="text-sm font-normal text-slate-400">({completedTrips})</span>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 to-violet-600/10 p-5 shadow-xl backdrop-blur-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              Carpool Volume
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-white">{formatINR(totalVolume)}</div>
          </div>
          <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/20 to-red-600/10 p-5 shadow-xl backdrop-blur-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">
              Active SOS Alerts
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-rose-200">{openSos.length}</div>
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 backdrop-blur-xl">
          {(['overview', 'users', 'trips', 'sos'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold capitalize transition ${
                tab === t
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'sos' ? 'SOS Alerts' : t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-xl">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Recent Bookings ({bookings.length})
              </h2>
              <ul className="mt-4 space-y-2.5 text-xs">
                {bookings.length === 0 ? (
                  <li className="text-slate-500">No bookings recorded yet.</li>
                ) : (
                  bookings.slice(0, 10).map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/50 px-3.5 py-2.5"
                    >
                      <span className="truncate pr-2 text-slate-300">
                        <strong className="text-white">{b.riderName}</strong> · {b.fromLabel} → {b.toLabel} (
                        {b.seats} seat)
                      </span>
                      <span className="shrink-0 rounded-lg bg-indigo-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-indigo-300">
                        {formatINR(b.fare)} · {b.status}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-xl">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                SOS Feed ({sosList.length})
              </h2>
              <ul className="mt-4 space-y-2.5 text-xs">
                {sosList.length === 0 ? (
                  <li className="text-slate-500">No SOS alerts triggered.</li>
                ) : (
                  sosList.slice(0, 8).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/50 px-3.5 py-2.5"
                    >
                      <span className="text-slate-300">
                        🚨 <strong className="text-white">{s.name}</strong> ({s.phone}) · Trip {s.tripId}
                      </span>
                      {s.resolved ? (
                        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                          Resolved
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => resolveSos(s.id)}
                          className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-emerald-400"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl backdrop-blur-xl">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-4">Name / College ID</th>
                  <th className="p-4">Email / Phone</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Verification</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-white/[0.02]">
                    <td className="p-4 font-semibold text-white">
                      {u.name}{' '}
                      <span className="ml-1 font-mono text-[11px] font-normal text-slate-400">
                        ({u.collegeId || '—'})
                      </span>
                    </td>
                    <td className="p-4 font-mono text-slate-300">
                      {u.email} · {u.phone}
                    </td>
                    <td className="p-4">
                      <select
                        value={u.role}
                        onChange={(e) => adminUpdateUser(u.uid, { role: e.target.value as Role })}
                        className="rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1 font-mono text-xs font-semibold text-slate-200 outline-none focus:border-indigo-500"
                      >
                        <option value="rider">rider</option>
                        <option value="driver">driver</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => adminUpdateUser(u.uid, { verified: !u.verified })}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                          u.verified
                            ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                            : 'border border-white/10 bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {u.verified ? '✓ Verified' : 'Unverified'}
                      </button>
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => adminDeleteUser(u.uid)}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/30"
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
          <div className="space-y-3">
            {trips.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-xs shadow-lg backdrop-blur-xl"
              >
                <div className="text-slate-300">
                  <strong className="text-white">{t.driverName}</strong> · {t.from.label} → {t.to.label} (
                  {t.seatsAvailable}/{t.seatsTotal} seats · {formatINR(t.pricePerSeat)}/seat){' '}
                  <span className="ml-1.5 rounded-full bg-indigo-500/15 px-2 py-0.5 font-mono text-[10px] uppercase text-indigo-300">
                    {t.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/track/${encodeURIComponent(t.id)}`}
                    className="rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/25"
                  >
                    Live Track
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteTrip(t.id)}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'sos' && (
          <div className="space-y-3">
            {sosList.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-slate-900/80 p-4 text-xs shadow-lg backdrop-blur-xl"
              >
                <div className="text-slate-300">
                  🚨 <strong className="text-white">{s.name}</strong> ({s.phone}) · Trip{' '}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-indigo-300">
                    {s.tripId}
                  </code>
                  {s.location && (
                    <span className="ml-2 font-mono text-slate-400">
                      [{s.location[0].toFixed(4)}, {s.location[1].toFixed(4)}]
                    </span>
                  )}
                </div>
                {!s.resolved && (
                  <button
                    type="button"
                    onClick={() => resolveSos(s.id)}
                    className="rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Resolve Alert
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
