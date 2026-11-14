'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { EMERGENCY_NUMBER, MAX_SEATS, WOMEN_HELPLINE } from '@/lib/config';
import { JAIPUR_PLACES, RATE_PER_KM, formatINR, searchPlaces } from '@/lib/fare';
import type {
  Booking,
  ChatMessage,
  Place,
  RouteResult,
  Trip,
  UserProfile,
} from '@/lib/types';
import type { Recurrence } from '@/lib/db';

export type Target = 'from' | 'to';

export interface CarpoolHUDProps {
  user: UserProfile;
  mode: 'rider' | 'driver';
  // Planner state (shared by rider search & driver post)
  from: Place | null;
  to: Place | null;
  selecting: Target;
  onSelectingChange: (t: Target) => void;
  onPlacePicked: (t: Target, place: Place) => void;
  onClearPlace: (t: Target) => void;
  onSwap: () => void;
  onSavePlace: (name: string, place: Place) => void;
  onRemoveSavedPlace: (name: string) => void;
  route: RouteResult | null;
  routeLoading: boolean;
  routeError: string | null;
  onRetryRoute: () => void;
  // Active selected trip
  activeTrip: Trip | null;
  onSelectTrip: (tripId: string | null) => void;
  tripBookings: Booking[];
  myBookings: Booking[];
  // Rider actions
  upcomingTrips: Trip[];
  womenOnlyFilter: boolean;
  onWomenOnlyFilterChange: (v: boolean) => void;
  onRequestSeats: (trip: Trip, seats: number) => Promise<void>;
  onCancelMyBooking: (booking: Booking, seatsTotal: number) => Promise<void>;
  // Driver actions
  driverTrips: Trip[];
  onPostTrip: (opts: {
    departAt: number;
    seats: number;
    pricePerSeat: number;
    womenOnly: boolean;
    recurrence: Recurrence | null;
  }) => Promise<void>;
  onAcceptBooking: (b: Booking) => Promise<void>;
  onRejectBooking: (b: Booking) => Promise<void>;
  onStartTrip: (tripId: string) => Promise<void>;
  onCancelTrip: (tripId: string) => Promise<void>;
  // Chat & Safety
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => Promise<void>;
  onTriggerSos: () => Promise<void>;
  progress: number;
  busy: boolean;
  error: string | null;
  onClearError: () => void;
}

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition duration-150 ' +
  'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} w-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:brightness-110`;
const BTN_GHOST = `${BTN_BASE} w-full border border-white/10 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 hover:text-white`;
const BTN_DANGER = `${BTN_BASE} w-full border border-rose-500/30 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/20 hover:brightness-110`;
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400';

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-slate-800/50 backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BookingHUD(props: CarpoolHUDProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'plan' | 'trips' | 'active'>('plan');

  useEffect(() => {
    if (props.activeTrip) setTab('active');
  }, [props.activeTrip?.id]);

  const savedEntries = Object.entries(props.user.savedPlaces ?? {});

  return (
    <section className="pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90 text-slate-100 shadow-glass-lg backdrop-blur-2xl">
      {/* Console Top Header & Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/50 px-4 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left text-xs font-bold text-white"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-sm">
            {props.mode === 'rider' ? '🎓' : '🚗'}
          </span>
          <span>{props.mode === 'rider' ? 'Rider Console' : 'Driver Host'}</span>
          <span className="text-slate-400 md:hidden">{collapsed ? '▲' : '▼'}</span>
        </button>

        <div className="flex rounded-xl border border-white/10 bg-slate-900/90 p-0.5">
          <button
            type="button"
            onClick={() => setTab('plan')}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              tab === 'plan'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {props.mode === 'rider' ? 'Explore' : 'Post Ride'}
          </button>
          <button
            type="button"
            onClick={() => setTab('trips')}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              tab === 'trips'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            My Rides ({props.mode === 'rider' ? props.myBookings.length : props.driverTrips.length})
          </button>
          {props.activeTrip && (
            <button
              type="button"
              onClick={() => setTab('active')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                tab === 'active'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span>Live</span>
            </button>
          )}
        </div>
      </div>

      {/* Console Body */}
      <div className={`${collapsed ? 'hidden md:block' : 'block'} min-h-0 space-y-3.5 overflow-y-auto overscroll-contain p-4`}>
        {props.error && (
          <div className="flex items-start justify-between gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/15 px-3.5 py-2.5 text-xs font-medium text-rose-200">
            <span>⚠️ {props.error}</span>
            <button
              type="button"
              onClick={props.onClearError}
              className="rounded-lg px-1.5 text-rose-300 hover:bg-rose-500/20"
            >
              ✕
            </button>
          </div>
        )}

        {tab === 'active' && props.activeTrip ? (
          <ActiveTripView {...props} trip={props.activeTrip} />
        ) : tab === 'trips' ? (
          <MyTripsList {...props} onOpenActive={() => setTab('active')} />
        ) : (
          <PlannerView {...props} savedEntries={savedEntries} onOpenActive={() => setTab('active')} />
        )}
      </div>
    </section>
  );
}

// ================================================================ Planner (Find or Post)

function PlannerView(
  props: CarpoolHUDProps & { savedEntries: [string, Place][]; onOpenActive: () => void },
) {
  const suggestedPrice = props.route ? Math.max(20, Math.round(props.route.fare / 3)) : 60;
  const [seats, setSeats] = useState(3);
  const [pricePerSeat, setPricePerSeat] = useState(suggestedPrice);
  const [departIso, setDepartIso] = useState(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [womenOnly, setWomenOnly] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeks, setWeeks] = useState(2);
  const [seatReq, setSeatReq] = useState(1);

  useEffect(() => {
    if (props.route) setPricePerSeat(Math.max(20, Math.round(props.route.fare / 3)));
  }, [props.route?.fare]);

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const activePlace = props.selecting === 'from' ? props.from : props.to;

  return (
    <div className="space-y-3.5">
      {/* Route Endpoints */}
      <div className="relative space-y-2">
        <LocationRow
          target="from"
          place={props.from}
          active={props.selecting === 'from'}
          onActivate={() => props.onSelectingChange('from')}
          onClear={() => props.onClearPlace('from')}
        />
        <LocationRow
          target="to"
          place={props.to}
          active={props.selecting === 'to'}
          onActivate={() => props.onSelectingChange('to')}
          onClear={() => props.onClearPlace('to')}
        />
        {props.from && props.to && (
          <button
            type="button"
            onClick={props.onSwap}
            title="Swap origin & destination"
            className="absolute right-10 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-800 text-xs font-bold text-slate-200 shadow-lg transition hover:border-indigo-400 hover:bg-indigo-600 hover:text-white"
          >
            ⇅
          </button>
        )}
      </div>

      <PlaceSearch target={props.selecting} onPick={(p) => props.onPlacePicked(props.selecting, p)} />

      {/* Saved Places + Quick Jaipur chips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Quick Jaipur Hotspots</span>
          {activePlace && (
            <div className="flex gap-1.5">
              {(['Home', 'Campus'] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => props.onSavePlace(slot, activePlace)}
                  className="rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 transition hover:bg-indigo-500/25"
                >
                  + Save {slot}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {props.savedEntries.map(([name, place]) => (
            <span
              key={name}
              className="inline-flex items-center overflow-hidden rounded-full border border-amber-400/30 bg-amber-400/15 text-[11px] font-semibold text-amber-300"
            >
              <button
                type="button"
                onClick={() => props.onPlacePicked(props.selecting, place)}
                className="px-2.5 py-1 transition hover:bg-amber-400/20"
              >
                ★ {name}
              </button>
              <button
                type="button"
                onClick={() => props.onRemoveSavedPlace(name)}
                className="border-l border-amber-400/20 px-2 py-1 text-amber-300/70 hover:bg-rose-500/30 hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
          {JAIPUR_PLACES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => props.onPlacePicked(props.selecting, p)}
              className="rounded-full border border-white/10 bg-slate-800/70 px-3 py-1 text-[11px] font-medium text-slate-300 transition hover:border-indigo-500/40 hover:bg-indigo-500/20 hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* OSRM Route summary */}
      {props.routeLoading && (
        <div className="shimmer-bar flex h-12 items-center justify-center rounded-2xl border border-indigo-500/20">
          <span className="text-xs font-semibold text-indigo-200">
            Calculating fastest Jaipur road route…
          </span>
        </div>
      )}
      {props.routeError && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/15 px-3.5 py-2 text-xs font-medium text-rose-200">
          <span>{props.routeError}</span>
          <button type="button" onClick={props.onRetryRoute} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      {props.route && !props.routeLoading && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-2.5 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Distance</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-white">
              {props.route.distanceKm.toFixed(1)} km
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-2.5 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Est. Time</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-white">
              {props.route.durationMin} min
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/15 p-2.5 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-indigo-300">
              Solo Cab (₹{RATE_PER_KM}/km)
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-indigo-200">
              {formatINR(props.route.fare)}
            </div>
          </div>
        </div>
      )}

      {/* Mode-specific controls */}
      {props.mode === 'driver' ? (
        <Card className="space-y-3.5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Publish a Campus Carpool</span>
            <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300">
              Host Mode
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Departure Time</span>
              <input
                type="datetime-local"
                value={departIso}
                onChange={(e) => setDepartIso(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-xs text-white outline-none focus:border-indigo-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={LABEL}>Seats</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_SEATS}
                  value={seats}
                  onChange={(e) => setSeats(Math.min(MAX_SEATS, Math.max(1, Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-xs font-bold text-white outline-none focus:border-indigo-500"
                />
              </label>
              <label className="block">
                <span className={LABEL}>₹ / Seat</span>
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={pricePerSeat}
                  onChange={(e) => setPricePerSeat(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-xs font-bold text-emerald-400 outline-none focus:border-indigo-500"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-0.5 text-xs font-medium text-slate-300">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-1.5 transition hover:border-pink-500/30">
              <input
                type="checkbox"
                checked={womenOnly}
                onChange={(e) => setWomenOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-pink-500"
              />
              <span>🚺 Women-only ride</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-1.5 transition hover:border-indigo-500/30">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-indigo-500"
              />
              <span>🔁 Recurring schedule</span>
            </label>
          </div>

          {recurring && (
            <div className="space-y-2.5 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between">
                <span className={LABEL}>Repeat on days</span>
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 outline-none"
                >
                  <option value={1}>For 1 week</option>
                  <option value={2}>For 2 weeks</option>
                  <option value={4}>For 4 weeks</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((lbl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`flex-1 rounded-xl py-1.5 text-xs font-bold transition ${
                      days.includes(idx)
                        ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                        : 'border border-white/10 bg-slate-950/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!props.from || !props.to || !props.route || props.busy}
            onClick={() =>
              props.onPostTrip({
                departAt: new Date(departIso).getTime(),
                seats,
                pricePerSeat,
                womenOnly,
                recurrence: recurring ? { days, weeks } : null,
              })
            }
            className={BTN_PRIMARY}
          >
            {props.busy
              ? 'Publishing Ride…'
              : `Publish Ride · ${seats} seats × ${formatINR(pricePerSeat)}`}
          </button>
        </Card>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={LABEL}>Available Carpools ({props.upcomingTrips.length})</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <input
                  type="checkbox"
                  checked={props.womenOnlyFilter}
                  onChange={(e) => props.onWomenOnlyFilterChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-pink-500"
                />
                <span>🚺 Women-only</span>
              </label>
              <select
                value={seatReq}
                onChange={(e) => setSeatReq(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-white outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n} className="bg-slate-900">
                    {n} seat{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {props.upcomingTrips.length === 0 ? (
            <Card className="p-5 text-center text-xs text-slate-400">
              No matching carpools right now. Try clearing endpoints or switch to{' '}
              <span className="font-semibold text-indigo-300">Driver</span> mode to post a ride.
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {props.upcomingTrips.map((t) => {
                const mine = props.myBookings.find(
                  (b) => b.tripId === t.id && b.status !== 'cancelled' && b.status !== 'rejected',
                );
                return (
                  <li
                    key={t.id}
                    className="rounded-2xl border border-white/10 bg-slate-800/60 p-3.5 transition hover:border-white/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
                          {t.driverName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-white">
                            <span>{t.driverName}</span>
                            {t.driverVerified && (
                              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                                ✓ ID
                              </span>
                            )}
                            {t.womenOnly && (
                              <span className="rounded-full bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-pink-300">
                                🚺 Women
                              </span>
                            )}
                            {t.seriesId && (
                              <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300">
                                🔁 Daily
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {fmtDateTime(t.departAt)} · {t.seatsAvailable}/{t.seatsTotal} seats left
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-right">
                        <div className="font-mono text-xs font-bold text-emerald-300">
                          {formatINR(t.pricePerSeat)}
                        </div>
                        <div className="text-[9px] text-emerald-400/70">per seat</div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 rounded-xl bg-slate-950/40 p-2.5 text-xs">
                      <div className="flex items-center gap-2 truncate text-slate-200">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                        <span className="truncate">{t.from.label}</span>
                      </div>
                      <div className="flex items-center gap-2 truncate text-slate-300">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                        <span className="truncate">{t.to.label}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          props.onSelectTrip(t.id);
                          props.onOpenActive();
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        View Route
                      </button>
                      {mine ? (
                        <span className="rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold capitalize text-indigo-300">
                          {mine.status}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={props.busy || t.seatsAvailable < seatReq || t.driverId === props.user.uid}
                          onClick={() => props.onRequestSeats(t, seatReq)}
                          className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-110 disabled:opacity-40"
                        >
                          Book {seatReq} · {formatINR(seatReq * t.pricePerSeat)}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================ My Trips / Bookings

function MyTripsList(props: CarpoolHUDProps & { onOpenActive: () => void }) {
  if (props.mode === 'rider') {
    if (props.myBookings.length === 0) {
      return (
        <Card className="p-6 text-center text-xs text-slate-400">
          You don&apos;t have any seat bookings yet.
        </Card>
      );
    }
    return (
      <ul className="space-y-2.5">
        {props.myBookings.map((b) => (
          <li key={b.id} className="rounded-2xl border border-white/10 bg-slate-800/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-white">
                {b.seats} seat(s) · {formatINR(b.fare)}
              </span>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">
                {b.status}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              <div className="truncate">🟢 {b.fromLabel}</div>
              <div className="truncate">🔴 {b.toLabel}</div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
              <span>{fmtDateTime(b.departAt)}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    props.onSelectTrip(b.tripId);
                    props.onOpenActive();
                  }}
                  className="rounded-xl bg-indigo-500 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-600"
                >
                  Open Live
                </button>
                {(b.status === 'pending' || b.status === 'accepted') && (
                  <button
                    type="button"
                    onClick={() => props.onCancelMyBooking(b, MAX_SEATS)}
                    className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-rose-500/20 hover:text-rose-200"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (props.driverTrips.length === 0) {
    return (
      <Card className="p-6 text-center text-xs text-slate-400">
        You haven&apos;t published any trips yet.
      </Card>
    );
  }
  return (
    <ul className="space-y-2.5">
      {props.driverTrips.map((t) => (
        <li key={t.id} className="rounded-2xl border border-white/10 bg-slate-800/60 p-3.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-white">
              {t.seatsAvailable}/{t.seatsTotal} seats left · {formatINR(t.pricePerSeat)}/seat
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
              {t.status}
            </span>
          </div>
          <div className="mt-2 truncate text-xs text-slate-300">
            {t.from.label} → {t.to.label}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
            <span>{fmtDateTime(t.departAt)}</span>
            <button
              type="button"
              onClick={() => {
                props.onSelectTrip(t.id);
                props.onOpenActive();
              }}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1 text-xs font-semibold text-white shadow-sm"
            >
              Manage / Drive
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ================================================================ Active Trip (Live Tracking, Requests, Chat, SOS)

function ActiveTripView(props: CarpoolHUDProps & { trip: Trip }) {
  const { trip } = props;
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const isDriver = trip.driverId === props.user.uid;
  const pct = Math.round(Math.min(1, Math.max(0, props.progress)) * 100);
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/track/${encodeURIComponent(trip.id)}` : '';

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => props.onSelectTrip(null)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          ← Back
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 font-mono text-xs font-bold uppercase text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          {trip.status} · {pct}%
        </span>
      </div>

      <Card className="space-y-2.5 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white">
            Driver: {trip.driverName}{' '}
            {trip.driverVerified && <span className="text-emerald-400">✓</span>}
          </span>
          <span className="font-mono font-semibold text-indigo-300">
            {trip.seatsAvailable}/{trip.seatsTotal} seats · {formatINR(trip.pricePerSeat)}/seat
          </span>
        </div>
        {trip.vehicle && (
          <div className="inline-block rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1 font-mono text-[11px] text-slate-300">
            🚘 {trip.vehicle.color} {trip.vehicle.model} · {trip.vehicle.plate}
          </div>
        )}
        <div className="space-y-1 rounded-xl bg-slate-950/40 p-2.5 text-xs">
          <div className="truncate text-slate-200">🟢 {trip.from.label}</div>
          <div className="truncate text-slate-300">🔴 {trip.to.label}</div>
        </div>
        {trip.status === 'in_transit' && (
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-950">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </Card>

      {/* Driver controls & incoming seat requests */}
      {isDriver && (
        <Card className="space-y-2.5 p-4">
          <div className={LABEL}>Passenger Requests ({props.tripBookings.length})</div>
          {props.tripBookings.length === 0 ? (
            <div className="text-xs text-slate-400">No seat requests yet.</div>
          ) : (
            <ul className="space-y-2">
              {props.tripBookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 p-2.5 text-xs"
                >
                  <div>
                    <span className="font-bold text-white">{b.riderName}</span>{' '}
                    <span className="text-slate-300">
                      ({b.seats} seat · {formatINR(b.fare)})
                    </span>
                    <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-300">
                      {b.status}
                    </span>
                  </div>
                  {b.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => props.onAcceptBooking(b)}
                        className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-emerald-400"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onRejectBooking(b)}
                        className="rounded-lg bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 pt-1">
            {trip.status === 'scheduled' && (
              <button type="button" onClick={() => props.onStartTrip(trip.id)} className={BTN_PRIMARY}>
                ▶ Start Live Trip
              </button>
            )}
            {(trip.status === 'scheduled' || trip.status === 'in_transit') && (
              <button type="button" onClick={() => props.onCancelTrip(trip.id)} className={BTN_GHOST}>
                Cancel Trip
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Safety Bar: Share Live Link + SOS */}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={copyShare} className={BTN_GHOST}>
          {copied ? '✓ Link Copied' : '🔗 Share Live Ride'}
        </button>
        <button type="button" onClick={props.onTriggerSos} className={BTN_DANGER}>
          🚨 SOS ({EMERGENCY_NUMBER} / {WOMEN_HELPLINE})
        </button>
      </div>

      {/* In-Ride Realtime Chat */}
      <Card className="space-y-2.5 p-3.5">
        <div className={LABEL}>In-Ride Carpool Chat</div>
        <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-xs">
          {props.chatMessages.length === 0 ? (
            <div className="text-slate-500">Coordinate pickup point with your carpool here…</div>
          ) : (
            props.chatMessages.map((m) => (
              <div key={m.id} className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                <span className="font-bold text-indigo-300">{m.name}: </span>
                <span className="text-slate-200">{m.text}</span>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!msg.trim()) return;
            const text = msg;
            setMsg('');
            await props.onSendChat(text);
          }}
          className="flex gap-2"
        >
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Message carpool…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-indigo-500 px-4 text-xs font-semibold text-white transition hover:bg-indigo-600"
          >
            Send
          </button>
        </form>
      </Card>
    </div>
  );
}

// ================================================================ Subcomponents

function LocationRow({
  target,
  place,
  active,
  onActivate,
  onClear,
}: {
  target: Target;
  place: Place | null;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  const dotColor =
    target === 'from'
      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
      : 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]';
  return (
    <div
      className={`flex items-stretch rounded-2xl border transition ${
        active
          ? 'border-indigo-500/70 bg-indigo-500/10 shadow-sm shadow-indigo-500/10'
          : 'border-white/10 bg-slate-800/50 hover:border-white/20'
      }`}
    >
      <button type="button" onClick={onActivate} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {target === 'from' ? 'Pickup Location' : 'Dropoff Location'}{' '}
            {active && <span className="text-indigo-300">· tap map or search</span>}
          </span>
          <span className={`mt-0.5 block truncate text-xs font-semibold ${place ? 'text-white' : 'text-slate-500'}`}>
            {place ? place.label : target === 'from' ? 'Choose pickup point…' : 'Choose destination…'}
          </span>
        </span>
      </button>
      {place && (
        <button
          type="button"
          onClick={onClear}
          className="border-l border-white/10 px-3 text-sm text-slate-400 transition hover:text-white"
        >
          ×
        </button>
      )}
    </div>
  );
}

function PlaceSearch({ target, onPick }: { target: Target; onPick: (place: Place) => void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        setResults(await searchPlaces(q, ctrl.signal));
      } catch {
        // ignore abort
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 650);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  return (
    <div className="relative">
      <div className="flex items-center rounded-2xl border border-white/10 bg-slate-950/70 px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
        <span className="text-sm text-slate-400">🔍</span>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${target === 'from' ? 'pickup' : 'destination'} in Jaipur…`}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none"
        />
        {loading && <span className="text-xs text-indigo-400">Searching…</span>}
      </div>
      {results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-52 overflow-y-auto rounded-2xl border border-white/15 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl">
          {results.map((r) => (
            <button
              key={`${r.position[0]},${r.position[1]}`}
              type="button"
              onClick={() => {
                onPick(r);
                setTerm('');
                setResults([]);
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-indigo-500/20 hover:text-white"
            >
              📍 {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
