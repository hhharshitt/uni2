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
  'inline-flex items-center justify-center gap-2 border-2 border-black px-3 py-2.5 text-xs font-bold uppercase tracking-wider ' +
  'shadow-[4px_4px_0px_0px_#000] transition-[transform,box-shadow] duration-75 ' +
  'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_#000] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} w-full bg-[#FBBF24] text-black hover:bg-[#F59E0B]`;
const BTN_DARK = `${BTN_BASE} w-full bg-[#0A0A0A] text-[#FBBF24] hover:bg-[#1C1C1C]`;
const BTN_GHOST = `${BTN_BASE} w-full bg-white text-black hover:bg-[#F5F5F0]`;
const BTN_DANGER = `${BTN_BASE} w-full bg-[#EF4444] text-white hover:bg-[#DC2626]`;
const LABEL = 'font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/60';

function Block({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border-2 border-black bg-white ${className}`}>{children}</div>;
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
    <section className="pointer-events-auto flex max-h-full min-h-0 flex-col border-2 border-black bg-[#F5F5F0] shadow-[6px_6px_0px_0px_#000]">
      <div className="flex items-center justify-between border-b-2 border-black bg-[#0A0A0A] px-3 py-2 text-white">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left font-mono text-xs font-bold uppercase tracking-[0.2em]"
        >
          <span>{props.mode === 'rider' ? '🎓 Student Rider' : '🚗 Driver Host'}</span>
          {props.user.verified && (
            <span className="border border-black bg-[#22C55E] px-1.5 py-0.5 text-[9px] text-black">✓ VERIFIED</span>
          )}
          <span className="md:hidden">{collapsed ? '▲' : '▼'}</span>
        </button>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab('plan')}
            className={`border border-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
              tab === 'plan' ? 'bg-[#FBBF24] text-black' : 'bg-white/10 text-white'
            }`}
          >
            {props.mode === 'rider' ? 'Find' : 'Post'}
          </button>
          <button
            type="button"
            onClick={() => setTab('trips')}
            className={`border border-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
              tab === 'trips' ? 'bg-[#FBBF24] text-black' : 'bg-white/10 text-white'
            }`}
          >
            My ({props.mode === 'rider' ? props.myBookings.length : props.driverTrips.length})
          </button>
          {props.activeTrip && (
            <button
              type="button"
              onClick={() => setTab('active')}
              className={`border border-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                tab === 'active' ? 'bg-[#22C55E] text-black' : 'bg-white/10 text-white'
              }`}
            >
              Live
            </button>
          )}
        </div>
      </div>

      <div className={`${collapsed ? 'hidden md:block' : 'block'} min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3.5`}>
        {props.error && (
          <div className="flex items-start justify-between gap-2 border-2 border-black bg-[#EF4444] px-3 py-2 text-xs font-bold text-white">
            <span>⚠ {props.error}</span>
            <button type="button" onClick={props.onClearError} className="font-mono">
              ×
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
    <div className="space-y-3">
      {/* Route Endpoints */}
      <div className="relative space-y-1.5">
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
            className="absolute right-10 top-1/2 -translate-y-1/2 border-2 border-black bg-white px-2 py-0.5 font-mono text-xs font-bold shadow-[2px_2px_0px_0px_#000] hover:bg-[#FBBF24]"
          >
            ⇅
          </button>
        )}
      </div>

      <PlaceSearch target={props.selecting} onPick={(p) => props.onPlacePicked(props.selecting, p)} />

      {/* Saved Places + Quick Jaipur chips */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Quick Jaipur & Saved Places</span>
          {activePlace && (
            <div className="flex gap-1">
              {(['Home', 'Campus'] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => props.onSavePlace(slot, activePlace)}
                  className="border border-black bg-[#FBBF24] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                >
                  Save as {slot}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {props.savedEntries.map(([name, place]) => (
            <span key={name} className="inline-flex items-center border-2 border-black bg-[#FBBF24] text-[11px] font-bold">
              <button
                type="button"
                onClick={() => props.onPlacePicked(props.selecting, place)}
                className="px-2 py-0.5 uppercase"
              >
                ★ {name}
              </button>
              <button
                type="button"
                onClick={() => props.onRemoveSavedPlace(name)}
                className="border-l border-black px-1.5 hover:bg-black hover:text-white"
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
              className="border-2 border-black bg-white px-2 py-0.5 text-[11px] font-bold uppercase shadow-[2px_2px_0px_0px_#000] hover:bg-[#FBBF24]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* OSRM Route summary */}
      {props.routeLoading && (
        <div className="stripes h-12 border-2 border-black flex items-center justify-center">
          <span className="border-2 border-black bg-white px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
            Calculating OSRM road route…
          </span>
        </div>
      )}
      {props.routeError && (
        <div className="flex items-center justify-between border-2 border-black bg-[#EF4444] px-3 py-1.5 text-xs font-bold text-white">
          <span>{props.routeError}</span>
          <button type="button" onClick={props.onRetryRoute} className="underline">
            Retry
          </button>
        </div>
      )}
      {props.route && !props.routeLoading && (
        <div className="grid grid-cols-3 border-2 border-black bg-white text-center">
          <div className="border-r-2 border-black p-2">
            <div className={LABEL}>Distance</div>
            <div className="font-mono text-sm font-bold">{props.route.distanceKm.toFixed(1)} km</div>
          </div>
          <div className="border-r-2 border-black p-2">
            <div className={LABEL}>Est. Time</div>
            <div className="font-mono text-sm font-bold">{props.route.durationMin} min</div>
          </div>
          <div className="bg-[#FBBF24] p-2">
            <div className={LABEL}>Solo Cab (₹{RATE_PER_KM}/km)</div>
            <div className="font-mono text-sm font-bold">{formatINR(props.route.fare)}</div>
          </div>
        </div>
      )}

      {/* Mode-specific controls */}
      {props.mode === 'driver' ? (
        <Block className="space-y-3 p-3">
          <div className="font-mono text-xs font-bold uppercase">Post Carpool Offer</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={LABEL}>Departure</span>
              <input
                type="datetime-local"
                value={departIso}
                onChange={(e) => setDepartIso(e.target.value)}
                className="mt-1 w-full border-2 border-black px-2 py-1.5 font-mono text-xs font-bold"
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className={LABEL}>Seats</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_SEATS}
                  value={seats}
                  onChange={(e) => setSeats(Math.min(MAX_SEATS, Math.max(1, Number(e.target.value) || 1)))}
                  className="mt-1 w-full border-2 border-black px-2 py-1.5 font-mono text-xs font-bold"
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
                  className="mt-1 w-full border-2 border-black px-2 py-1.5 font-mono text-xs font-bold"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-bold">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={womenOnly}
                onChange={(e) => setWomenOnly(e.target.checked)}
                className="h-4 w-4 accent-black"
              />
              <span>🚺 Women-only ride</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 accent-black"
              />
              <span>🔁 Recurring campus commute</span>
            </label>
          </div>

          {recurring && (
            <div className="space-y-2 border-t-2 border-black pt-2">
              <div className="flex items-center justify-between">
                <span className={LABEL}>Repeat days</span>
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className="border border-black px-1.5 py-0.5 font-mono text-[10px] font-bold"
                >
                  <option value={1}>1 week</option>
                  <option value={2}>2 weeks</option>
                  <option value={4}>4 weeks</option>
                </select>
              </div>
              <div className="flex gap-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((lbl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`flex-1 border-2 border-black py-1 font-mono text-xs font-bold ${
                      days.includes(idx) ? 'bg-[#FBBF24]' : 'bg-white'
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
              ? 'Publishing…'
              : `Publish Ride · ${seats} seats × ${formatINR(pricePerSeat)}`}
          </button>
        </Block>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={LABEL}>Available Carpools ({props.upcomingTrips.length})</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.womenOnlyFilter}
                  onChange={(e) => props.onWomenOnlyFilterChange(e.target.checked)}
                  className="h-3.5 w-3.5 accent-black"
                />
                <span>🚺 Women-only</span>
              </label>
              <select
                value={seatReq}
                onChange={(e) => setSeatReq(Number(e.target.value))}
                className="border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} seat{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {props.upcomingTrips.length === 0 ? (
            <Block className="p-4 text-center text-xs font-bold text-black/60">
              No matching carpools right now. Try clearing endpoints or switch to Driver mode to post one.
            </Block>
          ) : (
            <ul className="space-y-2">
              {props.upcomingTrips.map((t) => {
                const mine = props.myBookings.find(
                  (b) => b.tripId === t.id && b.status !== 'cancelled' && b.status !== 'rejected',
                );
                return (
                  <li key={t.id} className="border-2 border-black bg-white p-2.5 shadow-[3px_3px_0px_0px_#000]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <span>{t.driverName}</span>
                        {t.driverVerified && (
                          <span className="border border-black bg-[#22C55E] px-1 text-[9px] font-mono">✓ ID</span>
                        )}
                        {t.womenOnly && (
                          <span className="border border-black bg-pink-300 px-1 text-[9px] font-mono">🚺 WOMEN</span>
                        )}
                        {t.seriesId && (
                          <span className="border border-black bg-[#FBBF24] px-1 text-[9px] font-mono">🔁 DAILY</span>
                        )}
                      </div>
                      <span className="border-2 border-black bg-[#FBBF24] px-2 py-0.5 font-mono text-xs font-bold">
                        {formatINR(t.pricePerSeat)}/seat
                      </span>
                    </div>

                    <div className="mt-1.5 truncate text-xs font-bold">
                      <span className="mr-1 inline-block h-2 w-2 border border-black bg-[#22C55E]" />
                      {t.from.label}
                    </div>
                    <div className="truncate text-xs font-bold">
                      <span className="mr-1 inline-block h-2 w-2 border border-black bg-[#EF4444]" />
                      {t.to.label}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/15 pt-2 font-mono text-[11px]">
                      <span>
                        {fmtDateTime(t.departAt)} · {t.seatsAvailable}/{t.seatsTotal} seats
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            props.onSelectTrip(t.id);
                            props.onOpenActive();
                          }}
                          className="border-2 border-black bg-white px-2 py-0.5 font-bold uppercase hover:bg-[#FBBF24]"
                        >
                          Map
                        </button>
                        {mine ? (
                          <span className="border-2 border-black bg-black px-2 py-0.5 font-bold uppercase text-[#FBBF24]">
                            {mine.status}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={props.busy || t.seatsAvailable < seatReq || t.driverId === props.user.uid}
                            onClick={() => props.onRequestSeats(t, seatReq)}
                            className="border-2 border-black bg-[#FBBF24] px-2.5 py-0.5 font-bold uppercase hover:bg-black hover:text-[#FBBF24] disabled:opacity-40"
                          >
                            Book {seatReq} · {formatINR(seatReq * t.pricePerSeat)}
                          </button>
                        )}
                      </div>
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
      return <Block className="p-4 text-center text-xs font-bold">You have no seat bookings yet.</Block>;
    }
    return (
      <ul className="space-y-2">
        {props.myBookings.map((b) => (
          <li key={b.id} className="border-2 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold">
                {b.seats} seat(s) · {formatINR(b.fare)}
              </span>
              <span className="border-2 border-black bg-[#FBBF24] px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
                {b.status}
              </span>
            </div>
            <div className="mt-1 truncate text-xs font-bold">From: {b.fromLabel}</div>
            <div className="truncate text-xs font-bold">To: {b.toLabel}</div>
            <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
              <span>{fmtDateTime(b.departAt)}</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    props.onSelectTrip(b.tripId);
                    props.onOpenActive();
                  }}
                  className="border-2 border-black bg-black px-2 py-0.5 font-bold uppercase text-[#FBBF24]"
                >
                  Open Live
                </button>
                {(b.status === 'pending' || b.status === 'accepted') && (
                  <button
                    type="button"
                    onClick={() => props.onCancelMyBooking(b, MAX_SEATS)}
                    className="border-2 border-black bg-white px-2 py-0.5 font-bold uppercase"
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
    return <Block className="p-4 text-center text-xs font-bold">You haven&apos;t posted any trips yet.</Block>;
  }
  return (
    <ul className="space-y-2">
      {props.driverTrips.map((t) => (
        <li key={t.id} className="border-2 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold">
              {t.seatsAvailable}/{t.seatsTotal} seats left · {formatINR(t.pricePerSeat)}/seat
            </span>
            <span className="border-2 border-black bg-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FBBF24]">
              {t.status}
            </span>
          </div>
          <div className="mt-1 truncate text-xs font-bold">{t.from.label} → {t.to.label}</div>
          <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
            <span>{fmtDateTime(t.departAt)}</span>
            <button
              type="button"
              onClick={() => {
                props.onSelectTrip(t.id);
                props.onOpenActive();
              }}
              className="border-2 border-black bg-[#FBBF24] px-2.5 py-0.5 font-bold uppercase"
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => props.onSelectTrip(null)}
          className="border-2 border-black bg-white px-2 py-0.5 font-mono text-[11px] font-bold uppercase"
        >
          ← Back
        </button>
        <span className="border-2 border-black bg-[#FBBF24] px-2 py-0.5 font-mono text-[11px] font-bold uppercase">
          {trip.status} · {pct}%
        </span>
      </div>

      <Block className="p-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span>
            Driver: {trip.driverName} {trip.driverVerified ? '✓' : ''}
          </span>
          <span>
            {trip.seatsAvailable}/{trip.seatsTotal} seats · {formatINR(trip.pricePerSeat)}/seat
          </span>
        </div>
        {trip.vehicle && (
          <div className="font-mono text-[11px] text-black/70">
            Vehicle: {trip.vehicle.color} {trip.vehicle.model} · {trip.vehicle.plate}
          </div>
        )}
        <div className="truncate text-xs font-bold">🟢 {trip.from.label}</div>
        <div className="truncate text-xs font-bold">🔴 {trip.to.label}</div>
        {trip.status === 'in_transit' && (
          <div className="h-4 border-2 border-black bg-white">
            <div className="h-full bg-[#22C55E] transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        )}
      </Block>

      {/* Driver controls & incoming seat requests */}
      {isDriver && (
        <Block className="p-3 space-y-2">
          <div className={LABEL}>Driver Controls & Seat Requests ({props.tripBookings.length})</div>
          {props.tripBookings.length === 0 ? (
            <div className="text-xs text-black/60">No seat requests yet.</div>
          ) : (
            <ul className="space-y-1.5">
              {props.tripBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between border border-black p-2 text-xs">
                  <div>
                    <span className="font-bold">{b.riderName}</span> ({b.seats} seat · {formatINR(b.fare)})
                    <span className="ml-1 font-mono text-[10px] uppercase text-black/60">[{b.status}]</span>
                  </div>
                  {b.status === 'pending' && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => props.onAcceptBooking(b)}
                        className="border border-black bg-[#22C55E] px-2 py-0.5 font-mono text-[10px] font-bold"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onRejectBooking(b)}
                        className="border border-black bg-[#EF4444] px-2 py-0.5 font-mono text-[10px] font-bold text-white"
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
        </Block>
      )}

      {/* Safety Bar: Share Live Link + SOS */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copyShare} className={BTN_GHOST}>
          {copied ? '✓ Link Copied' : '🔗 Share Live Trip'}
        </button>
        <button type="button" onClick={props.onTriggerSos} className={BTN_DANGER}>
          🚨 SOS ({EMERGENCY_NUMBER} / {WOMEN_HELPLINE})
        </button>
      </div>

      {/* In-Ride Realtime Chat */}
      <Block className="p-2.5 space-y-2">
        <div className={LABEL}>In-Ride Chat</div>
        <div className="max-h-32 space-y-1 overflow-y-auto border border-black/20 bg-[#F5F5F0] p-2 text-xs">
          {props.chatMessages.length === 0 ? (
            <div className="text-black/50">Coordinate pickup point with your carpool here.</div>
          ) : (
            props.chatMessages.map((m) => (
              <div key={m.id}>
                <span className="font-bold">{m.name}: </span>
                <span>{m.text}</span>
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
          className="flex"
        >
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Message carpool…"
            className="min-w-0 flex-1 border-2 border-r-0 border-black px-2 py-1 text-xs outline-none"
          />
          <button type="submit" className="border-2 border-black bg-[#0A0A0A] px-3 font-mono text-xs font-bold text-[#FBBF24]">
            Send
          </button>
        </form>
      </Block>
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
  const color = target === 'from' ? 'bg-[#22C55E]' : 'bg-[#EF4444]';
  return (
    <div className={`flex items-stretch border-2 border-black ${active ? 'bg-[#FBBF24]' : 'bg-white'}`}>
      <button type="button" onClick={onActivate} className="flex min-w-0 flex-1 items-center gap-2.5 p-2.5 text-left">
        <span className={`inline-block h-3 w-3 shrink-0 border-2 border-black ${color}`} />
        <span className="min-w-0">
          <span className={`block ${LABEL} ${active ? 'text-black' : ''}`}>
            {target === 'from' ? 'Origin' : 'Destination'} {active ? '· tap map or search' : ''}
          </span>
          <span className={`block truncate text-xs font-bold ${place ? '' : 'text-black/40'}`}>
            {place ? place.label : target === 'from' ? 'Select origin…' : 'Select destination…'}
          </span>
        </span>
      </button>
      {place && (
        <button
          type="button"
          onClick={onClear}
          className="border-l-2 border-black px-2.5 font-mono text-sm font-bold hover:bg-black hover:text-white"
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
      <div className="flex border-2 border-black bg-white">
        <span className="flex items-center border-r-2 border-black px-2.5 font-mono text-xs font-bold">⌕</span>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${target === 'from' ? 'origin' : 'destination'} in Jaipur…`}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-xs font-medium outline-none"
        />
        {loading && <span className="flex items-center px-2 font-mono text-[10px]">…</span>}
      </div>
      {results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
          {results.map((r) => (
            <button
              key={`${r.position[0]},${r.position[1]}`}
              type="button"
              onClick={() => {
                onPick(r);
                setTerm('');
                setResults([]);
              }}
              className="block w-full border-b border-black/10 px-3 py-1.5 text-left text-xs font-medium hover:bg-[#FBBF24]"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
