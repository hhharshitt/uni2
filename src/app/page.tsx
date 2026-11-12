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
    <div className="flex h-full w-full items-center justify-center bg-[#D4D4D0]">
      <span className="border-2 border-black bg-[#FBBF24] px-4 py-2 font-mono text-xs font-bold uppercase shadow-[4px_4px_0px_0px_#000]">
        Loading Jaipur Grid…
      </span>
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
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setAuthUser(u);
      if (!u) {
        setProfile(null);
        setAuthReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    return subscribeProfile(
      authUser.uid,
      (p) => {
        setProfile(p);
        setAuthReady(true);
      },
      () => setAuthReady(true),
    );
  }, [authUser]);

  if (!isFirebaseConfigured) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#1C1C1C] p-4">
        <div className="max-w-lg border-2 border-black bg-white p-6 shadow-[8px_8px_0px_0px_#FBBF24]">
          <h1 className="text-2xl font-bold uppercase">Firebase Not Configured</h1>
          <p className="mt-2 text-sm">
            Fill in <code className="bg-black px-1 text-[#FBBF24]">.env.local</code> and restart{' '}
            <code className="bg-black px-1 text-[#FBBF24]">npm run dev</code>.
          </p>
        </div>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#1C1C1C]">
        <div className="border-2 border-black bg-[#FBBF24] px-4 py-2 font-mono text-xs font-bold uppercase shadow-[4px_4px_0px_0px_#000]">
          Booting Uniride Console…
        </div>
      </main>
    );
  }

  if (!authUser || !profile) {
    return <AuthScreen authUser={authUser} />;
  }

  return <CarpoolConsole user={profile} />;
}

// ================================================================ Auth & College Verification

function AuthScreen({ authUser }: { authUser: User | null }) {
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
        await signInWithEmailAndPassword(auth, email.trim(), password);
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

      await createProfile(cred.user.uid, {
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
            ? { model: carModel.trim() || 'Hatchback', plate: carPlate.trim() || 'RJ14-XX-0000', color: carColor.trim(), seats: 4 }
            : null,
      });

      if (isAllowedEmail(email) && collegeId.trim().length >= 5) {
        await markVerified(cred.user.uid);
      }
    } catch (err) {
      setError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#1C1C1C] px-4 py-8">
      <div className="mx-auto max-w-lg border-2 border-black bg-[#F5F5F0] p-6 shadow-[8px_8px_0px_0px_#FBBF24]">
        <div className="inline-block border-2 border-black bg-[#FBBF24] px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase">
          Uniride // Jaipur Campus Carpool
        </div>
        <h1 className="mt-3 text-3xl font-bold uppercase">
          {isSignup ? 'Student / Driver Signup' : 'Sign In'}
        </h1>
        <p className="mt-1 text-xs text-black/70">
          Verified college carpooling ({ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(', ')}). Split fares per seat and track rides live.
        </p>

        {error && (
          <div className="mt-3 border-2 border-black bg-[#EF4444] px-3 py-2 text-xs font-bold text-white">
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          {!authUser && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[10px] font-bold uppercase">College Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@muj.manipal.edu"
                  className="mt-1 w-full border-2 border-black bg-white px-2.5 py-2 font-bold"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] font-bold uppercase">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full border-2 border-black bg-white px-2.5 py-2 font-bold"
                />
              </label>
            </div>
          )}

          {isSignup && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('rider')}
                  className={`border-2 border-black py-2 font-mono font-bold uppercase ${
                    role === 'rider' ? 'bg-[#FBBF24]' : 'bg-white'
                  }`}
                >
                  🎓 Student Rider
                </button>
                <button
                  type="button"
                  onClick={() => setRole('driver')}
                  className={`border-2 border-black py-2 font-mono font-bold uppercase ${
                    role === 'driver' ? 'bg-[#FBBF24]' : 'bg-white'
                  }`}
                >
                  🚗 Student Driver
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase">Full Name</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aarav Sharma"
                    className="mt-1 w-full border-2 border-black bg-white px-2.5 py-1.5 font-bold"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase">Phone</span>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    className="mt-1 w-full border-2 border-black bg-white px-2.5 py-1.5 font-bold"
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase">Gender</span>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    className="mt-1 w-full border-2 border-black bg-white px-2 py-1.5 font-bold"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase">College ID</span>
                  <input
                    required
                    value={collegeId}
                    onChange={(e) => setCollegeId(e.target.value)}
                    placeholder="23FE10CSE00"
                    className="mt-1 w-full border-2 border-black bg-white px-2 py-1.5 font-mono font-bold"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] font-bold uppercase">Year</span>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="mt-1 w-full border-2 border-black bg-white px-2 py-1.5 font-bold"
                  >
                    <option>1st Year</option>
                    <option>2nd Year</option>
                    <option>3rd Year</option>
                    <option>4th Year</option>
                  </select>
                </label>
              </div>

              {role === 'driver' && (
                <div className="grid grid-cols-3 gap-2 border-t-2 border-black pt-2">
                  <input
                    required
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    placeholder="Swift / i20"
                    className="border-2 border-black bg-white px-2 py-1.5 font-bold"
                  />
                  <input
                    required
                    value={carPlate}
                    onChange={(e) => setCarPlate(e.target.value)}
                    placeholder="RJ14-CA-1234"
                    className="border-2 border-black bg-white px-2 py-1.5 font-mono font-bold"
                  />
                  <input
                    value={carColor}
                    onChange={(e) => setCarColor(e.target.value)}
                    placeholder="Color"
                    className="border-2 border-black bg-white px-2 py-1.5 font-bold"
                  />
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full border-2 border-black bg-[#FBBF24] py-3 font-mono text-xs font-bold uppercase shadow-[4px_4px_0px_0px_#000]"
          >
            {busy ? 'Working…' : isSignup ? 'Create Verified Account' : 'Sign In'}
          </button>
        </form>

        {!authUser && (
          <button
            type="button"
            onClick={() => setIsSignup((s) => !s)}
            className="mt-3 w-full text-center font-mono text-xs font-bold underline"
          >
            {isSignup ? 'Already have an account? Sign in' : 'New student? Create an account'}
          </button>
        )}
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
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#1C1C1C] text-black">
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

      {/* Top Bar */}
      <header className="absolute inset-x-0 top-0 z-[1100] flex h-[56px] items-center justify-between border-b-2 border-black bg-[#FBBF24] px-3 md:px-4">
        <div className="flex items-center gap-2">
          <span className="border-2 border-black bg-black px-2 py-0.5 font-mono text-sm font-bold text-[#FBBF24]">
            UR
          </span>
          <span className="text-sm font-bold uppercase md:text-base">
            Uniride // {user.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = mode === 'rider' ? 'driver' : 'rider';
              setMode(next);
              if (user.role !== 'admin') setOwnRole(user.uid, next).catch(() => {});
            }}
            className="border-2 border-black bg-white px-2.5 py-1 font-mono text-[10px] font-bold uppercase shadow-[2px_2px_0px_0px_#000] hover:bg-black hover:text-white"
          >
            Mode: {mode} ⇄
          </button>
          <Link
            href="/admin"
            className="border-2 border-black bg-black px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#FBBF24]"
          >
            Admin
          </Link>
          <button
            type="button"
            onClick={() => signOut(getFirebaseAuth())}
            className="border-2 border-black bg-white px-2 py-1 font-mono text-[10px] font-bold uppercase"
          >
            Exit
          </button>
        </div>
      </header>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1100] flex max-h-[62dvh] flex-col justify-end md:inset-x-auto md:bottom-4 md:left-4 md:top-[72px] md:max-h-none md:w-[440px] md:justify-start">
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
          onPostTrip={async ({ departAt, seats, pricePerSeat, womenOnly, recurrence }: {
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
