'use client';

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BookingHUD, { type Target } from '@/components/BookingHUD';
import type { MapFocus } from '@/components/Map';
import { ALLOWED_EMAIL_DOMAINS, SEARCH_RADIUS_KM, isAllowedEmail } from '@/lib/config';
import {
  acceptBooking,
  cancelBooking,
  cancelTrip,
  completeTrip,
  createProfile,
  createTrips,
  getProfile,
  markVerified,
  raiseSos,
  rejectBooking,
  removePlace,
  requestBooking,
  savePlace,
  sendChat,
  setOwnRole,
  startTrip,
  subscribeChat,
  subscribeDriverTrips,
  subscribeProfile,
  subscribeRiderBookings,
  subscribeTrip,
  subscribeTripBookings,
  subscribeUpcomingTrips,
  updateDriverLocation,
  type Recurrence,
} from '@/lib/db';
import {
  cumulativeDistances,
  fetchRoute,
  haversine,
  pointAlong,
  progressAlong,
  reverseGeocode,
  round6,
  simulationDuration,
} from '@/lib/fare';
import { describeFirebaseError, getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import type {
  Booking,
  ChatMessage,
  Gender,
  LatLng,
  Place,
  RouteResult,
  Trip,
  UserProfile,
} from '@/lib/types';

const LiveMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#090D16]">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-3 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur-xl">
        <span className="h-2.5 w-2.5 animate-ping rounded-full bg-indigo-400" />
        <span>Loading Jaipur Live Map…</span>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return;
    }
    const safetyTimer = setTimeout(() => setAuthReady(true), 2500);
    const unsub = onAuthStateChanged(
      getFirebaseAuth(),
      (u) => {
        setAuthUser(u);
        if (!u) {
          setProfile(null);
          setAuthReady(true);
        }
      },
      () => setAuthReady(true),
    );
    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const fallbackProfile: UserProfile = {
      uid: authUser.uid,
      name: authUser.displayName || authUser.email?.split('@')[0] || 'Student',
      email: authUser.email || '',
      phone: '',
      role: 'rider',
      gender: 'other',
      college: 'Manipal University Jaipur',
      collegeId: '',
      branch: 'CSE',
      year: '3rd Year',
      vehicle: null,
      verified: isAllowedEmail(authUser.email || ''),
      createdAt: Date.now(),
      savedPlaces: {},
    };
    const safetyTimer = setTimeout(() => {
      setProfile((cur) => cur ?? fallbackProfile);
      setAuthReady(true);
    }, 2000);
    const unsub = subscribeProfile(
      authUser.uid,
      (p) => {
        setProfile(p ?? fallbackProfile);
        setAuthReady(true);
      },
      () => {
        setProfile((cur) => cur ?? fallbackProfile);
        setAuthReady(true);
      },
    );
    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
  }, [authUser]);

  if (!isFirebaseConfigured) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#090D16] p-4 text-slate-100">
        <div className="max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-7 shadow-2xl backdrop-blur-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-400">
            Configuration Required
          </div>
          <h1 className="mt-3 text-xl font-bold text-white">Firebase Not Configured</h1>
          <p className="mt-2 text-sm text-slate-400">
            Add your Firebase credentials to{' '}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-indigo-300">.env.local</code> and
            restart <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-indigo-300">npm run dev</code>.
          </p>
        </div>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#090D16]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-3.5 text-sm font-semibold text-slate-200 shadow-2xl backdrop-blur-xl">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-indigo-400" />
          <span>Starting UniRide…</span>
        </div>
      </main>
    );
  }

  if (!authUser || !profile) {
    return <AuthScreen authUser={authUser} onProfileReady={setProfile} />;
  }

  return <CarpoolConsole user={profile} />;
}

// ================================================================ Auth & College Verification

function AuthScreen({
  authUser,
  onProfileReady,
}: {
  authUser: User | null;
  onProfileReady: (p: UserProfile) => void;
}) {
  const [isSignup, setIsSignup] = useState(Boolean(authUser));
  const [email, setEmail] = useState(authUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [gender, setGender] = useState<Gender>('other');
  const [collegeId, setCollegeId] = useState('');
  const [branch, setBranch] = useState('CSE');
  const [year, setYear] = useState('3rd Year');
  const [carModel, setCarModel] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [carColor, setCarColor] = useState('White');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      if (!isSignup && !authUser) {
        const signedIn = await signInWithEmailAndPassword(auth, email.trim(), password);
        const existing = await getProfile(signedIn.user.uid);
        onProfileReady(
          existing ?? {
            uid: signedIn.user.uid,
            name: signedIn.user.displayName || email.trim().split('@')[0] || 'Student',
            email: email.trim(),
            phone: '',
            role: 'rider',
            gender: 'other',
            college: 'Manipal University Jaipur',
            collegeId: '',
            branch: 'CSE',
            year: '3rd Year',
            vehicle: null,
            verified: isAllowedEmail(email),
            createdAt: Date.now(),
            savedPlaces: {},
          },
        );
        return;
      }

      if (!isAllowedEmail(email)) {
        throw new Error(
          `Use your college email (${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')}) to register.`,
        );
      }

      const cred = authUser
        ? { user: authUser }
        : await createUserWithEmailAndPassword(auth, email.trim(), password);

      const newProfileData = {
        name: name.trim() || 'Student',
        email: email.trim(),
        phone: phone.trim(),
        role,
        gender,
        college: 'Manipal University Jaipur',
        collegeId: collegeId.trim(),
        branch: branch.trim(),
        year,
        vehicle:
          role === 'driver'
            ? {
                model: carModel.trim() || 'Hatchback',
                plate: carPlate.trim() || 'RJ14-XX-0000',
                color: carColor.trim(),
                seats: 4,
              }
            : null,
      };

      await createProfile(cred.user.uid, newProfileData);

      const verified = isAllowedEmail(email) && collegeId.trim().length >= 5;
      if (verified) {
        await markVerified(cred.user.uid).catch(() => {});
      }

      onProfileReady({
        ...newProfileData,
        uid: cred.user.uid,
        verified,
        createdAt: Date.now(),
        savedPlaces: {},
      });
    } catch (err) {
      setError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-400';

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-[#090D16] px-4 py-10 text-slate-100">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-500/15 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glass-lg backdrop-blur-2xl sm:p-8">
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white shadow-lg shadow-indigo-500/30">
              UR
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white">UniRide</div>
              <div className="text-xs text-slate-400">Jaipur Smart Campus Carpool</div>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
            ✓ MUJ Verified
          </span>
        </div>

        {/* Feature Chips */}
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
            ⚡ Instant Fare Split
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
            📍 Live OSRM GPS
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
            🛡 Women-Only & SOS
          </span>
        </div>

        {/* Mode Switcher */}
        {!authUser && (
          <div className="mt-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-slate-950/60 p-1">
            <button
              type="button"
              onClick={() => setIsSignup(false)}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                !isSignup
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsSignup(true)}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                isSignup
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {!authUser && (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>College Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@muj.manipal.edu"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {isSignup && (
            <>
              <div>
                <span className={labelCls}>Select Your Mode</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRole('rider')}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition ${
                      role === 'rider'
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200 shadow-sm'
                        : 'border-white/10 bg-slate-950/50 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <span>🎓</span>
                    <span>Student Rider</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('driver')}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition ${
                      role === 'driver'
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200 shadow-sm'
                        : 'border-white/10 bg-slate-950/50 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <span>🚗</span>
                    <span>Student Driver</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Full Name</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aarav Sharma"
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Phone Number</span>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    className={inputCls}
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <label className="block">
                  <span className={labelCls}>Gender</span>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    className={inputCls}
                  >
                    <option value="female" className="bg-slate-900">Female</option>
                    <option value="male" className="bg-slate-900">Male</option>
                    <option value="other" className="bg-slate-900">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className={labelCls}>College ID</span>
                  <input
                    required
                    value={collegeId}
                    onChange={(e) => setCollegeId(e.target.value)}
                    placeholder="23FE10CSE00"
                    className={`${inputCls} font-mono`}
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Year</span>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className={inputCls}
                  >
                    <option className="bg-slate-900">1st Year</option>
                    <option className="bg-slate-900">2nd Year</option>
                    <option className="bg-slate-900">3rd Year</option>
                    <option className="bg-slate-900">4th Year</option>
                  </select>
                </label>
              </div>

              {role === 'driver' && (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3.5">
                  <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    Vehicle Details
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <input
                      required
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="Swift / i20"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                    />
                    <input
                      required
                      value={carPlate}
                      onChange={(e) => setCarPlate(e.target.value)}
                      placeholder="RJ14-CA-1234"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                    />
                    <input
                      value={carColor}
                      onChange={(e) => setCarColor(e.target.value)}
                      placeholder="Color"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? 'Authenticating…' : isSignup ? 'Create Verified Account' : 'Sign In to UniRide'}
          </button>
        </form>
      </div>
    </main>
  );
}

// ================================================================ Main Carpool Console

function CarpoolConsole({ user }: { user: UserProfile }) {
  const [mode, setMode] = useState<'rider' | 'driver'>(user.role === 'driver' ? 'driver' : 'rider');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [selecting, setSelecting] = useState<Target>('from');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeNonce, setRouteNonce] = useState(0);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const [upcomingTrips, setUpcomingTrips] = useState<Trip[]>([]);
  const [driverTrips, setDriverTrips] = useState<Trip[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [womenOnlyFilter, setWomenOnlyFilter] = useState(false);

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [tripBookings, setTripBookings] = useState<Booking[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTripRef = useRef<Trip | null>(null);
  activeTripRef.current = activeTrip;

  // Subscriptions
  useEffect(() => subscribeUpcomingTrips(setUpcomingTrips), []);
  useEffect(() => subscribeDriverTrips(user.uid, setDriverTrips), [user.uid]);
  useEffect(() => subscribeRiderBookings(user.uid, setMyBookings), [user.uid]);

  useEffect(() => {
    if (!activeTripId) {
      setActiveTrip(null);
      setTripBookings([]);
      setChatMessages([]);
      return;
    }
    const u1 = subscribeTrip(activeTripId, setActiveTrip);
    const u2 = subscribeTripBookings(activeTripId, setTripBookings);
    const u3 = subscribeChat(activeTripId, setChatMessages);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [activeTripId]);

  // OSRM route when planning
  const fLat = from?.position[0];
  const fLng = from?.position[1];
  const tLat = to?.position[0];
  const tLng = to?.position[1];

  useEffect(() => {
    if (fLat === undefined || fLng === undefined || tLat === undefined || tLng === undefined) {
      setRoute(null);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setRouteLoading(true);
    setRouteError(null);
    fetchRoute([fLat, fLng], [tLat, tLng], ctrl.signal)
      .then(setRoute)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setRouteError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setRouteLoading(false);
      });
    return () => ctrl.abort();
  }, [fLat, fLng, tLat, tLng, routeNonce]);

  // Driver live GPS simulation along the polyline when trip is in_transit
  const tripStatus = activeTrip?.status;
  const tripStartedAt = activeTrip?.tripStartedAt ?? null;
  const simDurationMs = activeTrip?.simDurationMs ?? 45000;
  const routeLen = activeTrip?.routeCoordinates.length ?? 0;

  useEffect(() => {
    if (
      !activeTrip ||
      activeTrip.driverId !== user.uid ||
      tripStatus !== 'in_transit' ||
      !tripStartedAt ||
      routeLen < 2
    ) {
      return;
    }
    const coords = activeTripRef.current?.routeCoordinates ?? [];
    const cumulative = cumulativeDistances(coords);
    const id = activeTrip.id;
    const interval = setInterval(() => {
      const frac = Math.min(1, (Date.now() - tripStartedAt) / (simDurationMs || 45000));
      if (frac >= 1) {
        clearInterval(interval);
        completeTrip(id, coords[coords.length - 1]).catch((e) => setError(describeFirebaseError(e)));
        return;
      }
      const p = pointAlong(coords, cumulative, frac);
      updateDriverLocation(id, [round6(p[0]), round6(p[1])]).catch((e) => setError(describeFirebaseError(e)));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTrip?.id, activeTrip?.driverId, user.uid, tripStatus, tripStartedAt, simDurationMs, routeLen]);

  // Filter upcoming trips by origin/destination proximity & women-only toggle
  const filteredTrips = useMemo(() => {
    return upcomingTrips.filter((t) => {
      if (womenOnlyFilter && !t.womenOnly) return false;
      if (from && haversine(from.position, t.from.position) > SEARCH_RADIUS_KM * 1000) return false;
      if (to && haversine(to.position, t.to.position) > SEARCH_RADIUS_KM * 1000) return false;
      return true;
    });
  }, [upcomingTrips, womenOnlyFilter, from, to]);

  const cumulative = useMemo(
    () => (activeTrip ? cumulativeDistances(activeTrip.routeCoordinates) : []),
    [activeTrip?.id, routeLen],
  );
  const progress =
    !activeTrip
      ? 0
      : activeTrip.status === 'completed'
        ? 1
        : activeTrip.status === 'in_transit' && activeTrip.driverLocation
          ? progressAlong(activeTrip.routeCoordinates, cumulative, activeTrip.driverLocation)
          : 0;

  const handleMapClick = useCallback(
    (pos: LatLng) => {
      if (activeTrip) return;
      const setter = selecting === 'from' ? setFrom : setTo;
      setter({ label: 'Locating…', position: pos });
      reverseGeocode(pos).then((label) => setter({ label, position: pos }));
      if (selecting === 'from') setSelecting('to');
    },
    [activeTrip, selecting],
  );

  const handlePlacePicked = useCallback((target: Target, place: Place) => {
    if (target === 'from') {
      setFrom(place);
      setSelecting('to');
    } else {
      setTo(place);
    }
    setFocus({ position: place.position, key: Date.now() });
  }, []);

  const mapPickup = activeTrip ? activeTrip.from.position : from?.position ?? null;
  const mapDrop = activeTrip ? activeTrip.to.position : to?.position ?? null;
  const mapRoute = activeTrip ? activeTrip.routeCoordinates : route?.coordinates ?? [];

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#090D16] text-slate-100">
      <div className="absolute inset-0 z-0">
        <LiveMap
          pickup={mapPickup}
          drop={mapDrop}
          route={mapRoute}
          driverLocation={activeTrip?.driverLocation ?? null}
          onMapClick={handleMapClick}
          clickEnabled={!activeTrip}
          followDriver={activeTrip?.status === 'in_transit'}
          focus={focus}
        />
      </div>

      {/* Floating Glass Top Navigation Bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1100] p-2.5 md:p-4">
        <div className="pointer-events-auto mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-slate-900/85 px-3.5 shadow-2xl backdrop-blur-xl md:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-extrabold text-white shadow-md shadow-indigo-500/30">
              UR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white">UniRide</span>
                <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300 sm:inline-block">
                  {user.name}
                </span>
                {user.verified && (
                  <span className="hidden rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 sm:inline-block">
                    ✓ Verified
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 hidden sm:block">Jaipur Campus Mobility Network</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Segmented Rider / Driver Pill */}
            <div className="flex rounded-xl border border-white/10 bg-slate-950/70 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setMode('rider');
                  if (user.role !== 'admin') setOwnRole(user.uid, 'rider').catch(() => {});
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mode === 'rider'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎓 Rider
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('driver');
                  if (user.role !== 'admin') setOwnRole(user.uid, 'driver').catch(() => {});
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mode === 'driver'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🚗 Driver
              </button>
            </div>

            <Link
              href="/admin"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Admin
            </Link>
            <button
              type="button"
              onClick={() => signOut(getFirebaseAuth())}
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 z-[1100] flex max-h-[65dvh] flex-col justify-end md:inset-x-auto md:bottom-4 md:left-4 md:top-[80px] md:max-h-none md:w-[430px] md:justify-start">
        <BookingHUD
          user={user}
          mode={mode}
          from={from}
          to={to}
          selecting={selecting}
          onSelectingChange={setSelecting}
          onPlacePicked={handlePlacePicked}
          onClearPlace={(t) => (t === 'from' ? setFrom(null) : setTo(null))}
          onSwap={() => {
            setFrom(to);
            setTo(from);
          }}
          onSavePlace={(name, place) => savePlace(user.uid, name, place).catch((e) => setError(describeFirebaseError(e)))}
          onRemoveSavedPlace={(name) => removePlace(user.uid, name).catch((e) => setError(describeFirebaseError(e)))}
          route={route}
          routeLoading={routeLoading}
          routeError={routeError}
          onRetryRoute={() => setRouteNonce((n) => n + 1)}
          activeTrip={activeTrip}
          onSelectTrip={setActiveTripId}
          tripBookings={tripBookings}
          myBookings={myBookings}
          upcomingTrips={filteredTrips}
          womenOnlyFilter={womenOnlyFilter}
          onWomenOnlyFilterChange={setWomenOnlyFilter}
          onRequestSeats={async (trip, seats) => {
            setBusy(true);
            setError(null);
            try {
              await requestBooking(trip, user, seats);
              setActiveTripId(trip.id);
            } catch (e) {
              setError(describeFirebaseError(e));
            } finally {
              setBusy(false);
            }
          }}
          onCancelMyBooking={async (b, seatsTotal) => {
            try {
              await cancelBooking(b, seatsTotal);
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          driverTrips={driverTrips}
          onPostTrip={async ({
            departAt,
            seats,
            pricePerSeat,
            womenOnly,
            recurrence,
          }: {
            departAt: number;
            seats: number;
            pricePerSeat: number;
            womenOnly: boolean;
            recurrence: Recurrence | null;
          }) => {
            if (!from || !to || !route) return;
            setBusy(true);
            setError(null);
            try {
              const ids = await createTrips(
                {
                  driver: user,
                  from,
                  to,
                  departAt,
                  seats,
                  pricePerSeat,
                  route,
                  womenOnly,
                  simDurationMs: simulationDuration(route.durationSeconds),
                },
                recurrence,
              );
              if (ids[0]) setActiveTripId(ids[0]);
            } catch (e) {
              setError(describeFirebaseError(e));
            } finally {
              setBusy(false);
            }
          }}
          onAcceptBooking={async (b) => {
            try {
              await acceptBooking(b);
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          onRejectBooking={async (b) => {
            try {
              await rejectBooking(b);
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          onStartTrip={async (tripId) => {
            try {
              await startTrip(tripId);
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          onCancelTrip={async (tripId) => {
            try {
              await cancelTrip(tripId);
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          chatMessages={chatMessages}
          onSendChat={async (text) => {
            if (!activeTripId) return;
            try {
              await sendChat(activeTripId, user, text);
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          onTriggerSos={async () => {
            if (!activeTrip) return;
            try {
              await raiseSos(activeTrip.id, user, activeTrip.driverLocation ?? activeTrip.from.position);
              alert('🚨 SOS Alert broadcast to Admin Control Center!');
            } catch (e) {
              setError(describeFirebaseError(e));
            }
          }}
          progress={progress}
          busy={busy}
          error={error}
          onClearError={() => setError(null)}
        />
      </div>
    </main>
  );
}
