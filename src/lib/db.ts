import {
  collection,
  deleteDoc,
  doc,
  getDoc,
   getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { MAX_RECURRING_INSTANCES } from './config';
import { getDb } from './firebase';
import type {
  Booking,
  BookingStatus,
  ChatMessage,
  Gender,
  LatLng,
  Place,
  Role,
  RouteResult,
  SosAlert,
  Trip,
  TripStatus,
  UserProfile,
  Vehicle,
} from './types';

type ErrorHandler = (err: Error) => void;

// ================================================================ normalizers

const ROLES = ['rider', 'driver', 'admin'] as const;
const GENDERS = ['female', 'male', 'other'] as const;
const TRIP_STATUSES = ['scheduled', 'in_transit', 'completed', 'cancelled'] as const;
const BOOKING_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled'] as const;

function num(v: unknown, fallback = 0): number {
  if (v && typeof v === 'object' && 'seconds' in (v as Record<string, unknown>)) {
    return Number((v as { seconds: number }).seconds) * 1000;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return fallback;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function toLatLng(value: unknown): LatLng | null {
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  const o = obj(value);
  if (o) {
    if ('lat' in o && 'lng' in o) {
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
    }
    if ('0' in o && '1' in o) return toLatLng([o['0'], o['1']]);
  }
  return null;
}

function toLatLngList(value: unknown): LatLng[] {
  let items: unknown[] = [];
  if (Array.isArray(value)) items = value;
  else {
    const o = obj(value);
    if (o) items = Object.keys(o).sort((a, b) => Number(a) - Number(b)).map((k) => o[k]);
  }
  return items.map(toLatLng).filter((p): p is LatLng => p !== null);
}

function toPlace(value: unknown): Place | null {
  const o = obj(value);
  if (!o) return null;
  const position = toLatLng(o.position);
  return position ? { label: str(o.label, 'Pinned location'), position } : null;
}

function toVehicle(value: unknown): Vehicle | null {
  if (typeof value === 'string' && value.trim()) {
    return { model: value.trim(), plate: 'RJ14', color: 'White', seats: 4 };
  }
  const o = obj(value);
  if (!o || (!o.model && !o.plate)) return null;
  return { model: str(o.model), plate: str(o.plate), color: str(o.color), seats: num(o.seats, 4) };
}

export function normalizeProfile(uid: string, raw: unknown): UserProfile | null {
  const r = obj(raw);
  if (!r) return null;
  const savedPlaces: Record<string, Place> = {};
  const sp = obj(r.savedPlaces);
  if (sp) {
    for (const key of Object.keys(sp)) {
      const place = toPlace(sp[key]);
      if (place) savedPlaces[key] = place;
    }
  }
  return {
    uid,
    name: str(r.name, 'Student'),
    email: str(r.email),
    phone: str(r.phone),
    role: oneOf(r.role, ROLES, 'rider'),
    gender: oneOf(r.gender, GENDERS, 'other'),
    college: str(r.college, 'Manipal University Jaipur'),
    collegeId: str(r.collegeId),
    branch: str(r.branch),
    year: str(r.year),
    vehicle: toVehicle(r.vehicle ?? r.vehicleInfo),
    verified: r.verified === true || Boolean(r.collegeId),
    createdAt: num(r.createdAt, Date.now()),
    savedPlaces,
  };
}

export function normalizeTrip(id: string, raw: unknown): Trip | null {
  const r = obj(raw);
  if (!r) return null;
  const from = toPlace(r.from);
  const to = toPlace(r.to);
  if (!from || !to) return null;
  return {
    id,
    driverId: str(r.driverId),
    driverName: str(r.driverName, 'Driver'),
    driverGender: oneOf(r.driverGender, GENDERS, 'other'),
    driverVerified: r.driverVerified === true,
    vehicle: toVehicle(r.vehicle),
    from,
    to,
    departAt: num(r.departAt),
    seatsTotal: num(r.seatsTotal, 1),
    seatsAvailable: num(r.seatsAvailable),
    pricePerSeat: num(r.pricePerSeat),
    distanceKm: num(r.distanceKm),
    durationMin: num(r.durationMin),
    routeCoordinates: toLatLngList(r.routeCoordinates),
    womenOnly: r.womenOnly === true,
    seriesId: typeof r.seriesId === 'string' ? r.seriesId : null,
    status: oneOf(r.status, TRIP_STATUSES, 'scheduled'),
    driverLocation: toLatLng(r.driverLocation),
    tripStartedAt: r.tripStartedAt == null ? null : num(r.tripStartedAt),
    simDurationMs: num(r.simDurationMs, 45000),
    createdAt: num(r.createdAt),
  };
}

export function normalizeBooking(id: string, raw: unknown): Booking | null {
  const r = obj(raw);
  if (!r || typeof r.tripId !== 'string') return null;
  return {
    id,
    tripId: r.tripId,
    driverId: str(r.driverId),
    riderId: str(r.riderId),
    riderName: str(r.riderName, 'Rider'),
    riderPhone: str(r.riderPhone),
    riderGender: oneOf(r.riderGender, GENDERS, 'other'),
    riderVerified: r.riderVerified === true,
    seats: num(r.seats, 1),
    fare: num(r.fare),
    status: oneOf(r.status, BOOKING_STATUSES, 'pending'),
    createdAt: num(r.createdAt),
    fromLabel: str(r.fromLabel),
    toLabel: str(r.toLabel),
    departAt: num(r.departAt),
  };
}

function normalizeChat(id: string, raw: unknown): ChatMessage | null {
  const r = obj(raw);
  if (!r || typeof r.text !== 'string') return null;
  return { id, uid: str(r.uid), name: str(r.name, 'User'), text: r.text, at: num(r.at) };
}

function normalizeSos(id: string, raw: unknown): SosAlert | null {
  const r = obj(raw);
  if (!r) return null;
  return {
    id,
    tripId: str(r.tripId),
    uid: str(r.uid),
    name: str(r.name, 'User'),
    phone: str(r.phone),
    location: toLatLng(r.location),
    at: num(r.at),
    resolved: r.resolved === true,
  };
}

function listFromQuery<T>(snap: QuerySnapshot, fn: (id: string, raw: unknown) => T | null): T[] {
  const out: T[] = [];
  snap.forEach((docSnap) => {
    const item = fn(docSnap.id, docSnap.data());
    if (item) out.push(item);
  });
  return out;
}

function placeRecord(p: Place) {
  return { label: p.label, position: [p.position[0], p.position[1]] };
}

// ================================================================ users

export type NewProfile = Omit<UserProfile, 'uid' | 'createdAt' | 'savedPlaces' | 'verified'>;

function readCachedProfile(uid: string): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`uniride_profile_${uid}`);
    return raw ? normalizeProfile(uid, JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(uid: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`uniride_profile_${uid}`, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(getDb(), 'users', uid));
    if (snap.exists()) {
      const p = normalizeProfile(uid, snap.data());
      if (p) writeCachedProfile(uid, p);
      return p;
    }
  } catch {
    // fallback to cached profile
  }
  return readCachedProfile(uid);
}

export function subscribeProfile(
  uid: string,
  cb: (p: UserProfile | null) => void,
  onError?: ErrorHandler,
): Unsubscribe {
  const cached = readCachedProfile(uid);
  if (cached) cb(cached);
  return onSnapshot(
    doc(getDb(), 'users', uid),
    (snap) => {
      if (snap.exists()) {
        const p = normalizeProfile(uid, snap.data());
        if (p) writeCachedProfile(uid, p);
        cb(p);
      } else {
        cb(readCachedProfile(uid));
      }
    },
    (err) => {
      console.error('subscribeProfile error:', err);
      const fallback = readCachedProfile(uid);
      if (fallback) cb(fallback);
      onError?.(err);
    },
  );
}

export async function createProfile(uid: string, data: NewProfile): Promise<void> {
  const record = {
    ...data,
    vehicle: data.vehicle ?? null,
    uid,
    verified: Boolean(data.collegeId && data.collegeId.trim().length >= 5),
    createdAt: Date.now(),
  };
  writeCachedProfile(uid, record);
  try {
    await setDoc(doc(getDb(), 'users', uid), record, { merge: true });
  } catch (err) {
    console.warn('Firestore profile write fell back to local cache:', err);
  }
}

export type ProfilePatch = Partial<
  Pick<UserProfile, 'name' | 'phone' | 'gender' | 'college' | 'collegeId' | 'branch' | 'year' | 'vehicle'>
>;

export function updateProfile(uid: string, patch: ProfilePatch): Promise<void> {
  return setDoc(doc(getDb(), 'users', uid), patch, { merge: true });
}

export function setOwnRole(uid: string, role: Exclude<Role, 'admin'>): Promise<void> {
  return setDoc(doc(getDb(), 'users', uid), { role }, { merge: true });
}

export function markVerified(uid: string): Promise<void> {
  return setDoc(doc(getDb(), 'users', uid), { verified: true }, { merge: true });
}

export async function savePlace(uid: string, key: string, place: Place): Promise<void> {
  const snap = await getDoc(doc(getDb(), 'users', uid));
  const existing = (snap.exists() ? snap.data()?.savedPlaces : null) ?? {};
  await setDoc(
    doc(getDb(), 'users', uid),
    { savedPlaces: { ...existing, [key]: placeRecord(place) } },
    { merge: true },
  );
}

export async function removePlace(uid: string, key: string): Promise<void> {
  const snap = await getDoc(doc(getDb(), 'users', uid));
  if (!snap.exists()) return;
  const existing = { ...(snap.data()?.savedPlaces ?? {}) };
  delete existing[key];
  await setDoc(doc(getDb(), 'users', uid), { savedPlaces: existing }, { merge: true });
}

// ================================================================ trips

export interface NewTripInput {
  driver: UserProfile;
  from: Place;
  to: Place;
  departAt: number;
  seats: number;
  pricePerSeat: number;
  route: RouteResult;
  womenOnly: boolean;
  simDurationMs: number;
}

export interface Recurrence {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  weeks: number;
}

export function expandDepartures(departAt: number, recurrence: Recurrence | null, now = Date.now()): number[] {
  if (!recurrence || recurrence.days.length === 0) return departAt > now ? [departAt] : [];
  const start = new Date(departAt);
  const out: number[] = [];
  for (let i = 0; i < recurrence.weeks * 7 && out.length < MAX_RECURRING_INSTANCES; i++) {
    const d = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
      start.getHours(),
      start.getMinutes(),
    );
    if (recurrence.days.includes(d.getDay()) && d.getTime() > now) out.push(d.getTime());
  }
  return out;
}

export async function createTrips(input: NewTripInput, recurrence: Recurrence | null): Promise<string[]> {
  const db = getDb();
  const departures = expandDepartures(input.departAt, recurrence);
  if (departures.length === 0) {
    throw new Error('Departure must be in the future (or pick repeat days that fall ahead).');
  }

  const seriesId = departures.length > 1 ? doc(collection(db, 'trips')).id : null;
  const batch = writeBatch(db);
  const ids: string[] = [];
  const now = Date.now();
  // Firestore does not allow nested arrays [[lat, lng]], so serialize as [{ lat, lng }]
  const serializedCoords = input.route.coordinates.map(([lat, lng]) => ({ lat, lng }));

  for (const departAt of departures) {
    const tripRef = doc(collection(db, 'trips'));
    const id = tripRef.id;
    ids.push(id);
    batch.set(tripRef, {
      id,
      driverId: input.driver.uid,
      driverName: input.driver.name,
      driverGender: input.driver.gender,
      driverVerified: input.driver.verified,
      vehicle: input.driver.vehicle ?? null,
      from: placeRecord(input.from),
      to: placeRecord(input.to),
      departAt,
      seatsTotal: input.seats,
      seatsAvailable: input.seats,
      pricePerSeat: input.pricePerSeat,
      distanceKm: input.route.distanceKm,
      durationMin: input.route.durationMin,
      routeCoordinates: serializedCoords,
      womenOnly: input.womenOnly,
      seriesId,
      status: 'scheduled' satisfies TripStatus,
      driverLocation: null,
      tripStartedAt: null,
      simDurationMs: input.simDurationMs,
      createdAt: now,
    });
  }
  await batch.commit();
  return ids;
}

export function subscribeTrip(id: string, cb: (t: Trip | null) => void, onError?: ErrorHandler): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'trips', id),
    (snap) => cb(snap.exists() ? normalizeTrip(snap.id, snap.data()) : null),
    (err) => onError?.(err),
  );
}

export function subscribeUpcomingTrips(cb: (trips: Trip[]) => void, onError?: ErrorHandler): Unsubscribe {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  return onSnapshot(
    collection(getDb(), 'trips'),
    (snap) => {
      const items = listFromQuery(snap, normalizeTrip)
        .filter((t) => t.departAt >= cutoff && (t.status === 'scheduled' || t.status === 'in_transit'))
        .sort((a, b) => a.departAt - b.departAt);
      cb(items);
    },
    (err) => onError?.(err),
  );
}

export function subscribeDriverTrips(
  uid: string,
  cb: (trips: Trip[]) => void,
  onError?: ErrorHandler,
): Unsubscribe {
  const q = query(collection(getDb(), 'trips'), where('driverId', '==', uid));
  return onSnapshot(
    q,
    (snap) => cb(listFromQuery(snap, normalizeTrip).sort((a, b) => a.departAt - b.departAt)),
    (err) => onError?.(err),
  );
}

export function subscribeAllTrips(cb: (trips: Trip[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onSnapshot(
    collection(getDb(), 'trips'),
    (snap) => cb(listFromQuery(snap, normalizeTrip).sort((a, b) => b.departAt - a.departAt)),
    (err) => onError?.(err),
  );
}

export function startTrip(id: string): Promise<void> {
  return updateDoc(doc(getDb(), 'trips', id), { status: 'in_transit', tripStartedAt: Date.now() });
}

export function updateDriverLocation(id: string, location: LatLng): Promise<void> {
  return updateDoc(doc(getDb(), 'trips', id), { driverLocation: [location[0], location[1]] });
}

export function completeTrip(id: string, finalLocation: LatLng | null): Promise<void> {
  return updateDoc(doc(getDb(), 'trips', id), {
    status: 'completed',
    driverLocation: finalLocation ? [finalLocation[0], finalLocation[1]] : null,
  });
}

export function setTripStatus(id: string, status: TripStatus): Promise<void> {
  return updateDoc(doc(getDb(), 'trips', id), { status });
}

export async function cancelTrip(id: string): Promise<void> {
  const db = getDb();
  const snap = await getDocs(query(collection(db, 'bookings'), where('tripId', '==', id)));
  const batch = writeBatch(db);
  batch.update(doc(db, 'trips', id), { status: 'cancelled' });
  for (const b of listFromQuery(snap, normalizeBooking)) {
    if (b.status === 'pending' || b.status === 'accepted') {
      batch.update(doc(db, 'bookings', b.id), { status: 'cancelled' });
    }
  }
  await batch.commit();
}

export function deleteTrip(id: string): Promise<void> {
  return deleteDoc(doc(getDb(), 'trips', id));
}

// ================================================================ bookings

export function bookingIdFor(tripId: string, riderId: string): string {
  return `${tripId}_${riderId}`;
}

export async function requestBooking(trip: Trip, rider: UserProfile, seats: number): Promise<string> {
  if (trip.driverId === rider.uid) throw new Error('You cannot book your own trip.');
  if (trip.status !== 'scheduled') throw new Error('This trip is no longer accepting bookings.');
  if (seats < 1 || seats > trip.seatsAvailable) throw new Error(`Only ${trip.seatsAvailable} seat(s) left.`);
  if (trip.womenOnly && rider.gender !== 'female') throw new Error('This is a women-only ride.');

  const id = bookingIdFor(trip.id, rider.uid);
  await setDoc(doc(getDb(), 'bookings', id), {
    id,
    tripId: trip.id,
    driverId: trip.driverId,
    riderId: rider.uid,
    riderName: rider.name,
    riderPhone: rider.phone,
    riderGender: rider.gender,
    riderVerified: rider.verified,
    seats,
    fare: seats * trip.pricePerSeat,
    status: 'pending' satisfies BookingStatus,
    createdAt: Date.now(),
    fromLabel: trip.from.label,
    toLabel: trip.to.label,
    departAt: trip.departAt,
  });
  return id;
}

export function subscribeBooking(id: string, cb: (b: Booking | null) => void, onError?: ErrorHandler): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'bookings', id),
    (snap) => cb(snap.exists() ? normalizeBooking(snap.id, snap.data()) : null),
    (err) => onError?.(err),
  );
}

export function subscribeTripBookings(
  tripId: string,
  cb: (b: Booking[]) => void,
  onError?: ErrorHandler,
): Unsubscribe {
  const q = query(collection(getDb(), 'bookings'), where('tripId', '==', tripId));
  return onSnapshot(
    q,
    (snap) => cb(listFromQuery(snap, normalizeBooking).sort((a, b) => a.createdAt - b.createdAt)),
    (err) => onError?.(err),
  );
}

export function subscribeRiderBookings(
  uid: string,
  cb: (b: Booking[]) => void,
  onError?: ErrorHandler,
): Unsubscribe {
  const q = query(collection(getDb(), 'bookings'), where('riderId', '==', uid));
  return onSnapshot(
    q,
    (snap) => cb(listFromQuery(snap, normalizeBooking).sort((a, b) => a.departAt - b.departAt)),
    (err) => onError?.(err),
  );
}

export function subscribeAllBookings(cb: (b: Booking[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onSnapshot(
    collection(getDb(), 'bookings'),
    (snap) => cb(listFromQuery(snap, normalizeBooking).sort((a, b) => b.createdAt - a.createdAt)),
    (err) => onError?.(err),
  );
}

export async function acceptBooking(booking: Booking): Promise<void> {
  const db = getDb();
  const tripRef = doc(db, 'trips', booking.tripId);
  const bookingRef = doc(db, 'bookings', booking.id);
  await runTransaction(db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error('Trip not found.');
    const avail = Number(tripSnap.data()?.seatsAvailable ?? 0);
    if (avail < booking.seats) throw new Error('Not enough seats left to accept this request.');
    tx.update(tripRef, { seatsAvailable: avail - booking.seats });
    tx.update(bookingRef, { status: 'accepted' });
  });
}

export function rejectBooking(booking: Booking): Promise<void> {
  return updateDoc(doc(getDb(), 'bookings', booking.id), { status: 'rejected' });
}

export async function cancelBooking(booking: Booking, seatsTotal: number): Promise<void> {
  const db = getDb();
  const tripRef = doc(db, 'trips', booking.tripId);
  const bookingRef = doc(db, 'bookings', booking.id);
  await runTransaction(db, async (tx) => {
    if (booking.status === 'accepted') {
      const tripSnap = await tx.get(tripRef);
      if (tripSnap.exists()) {
        const avail = Number(tripSnap.data()?.seatsAvailable ?? 0);
        tx.update(tripRef, { seatsAvailable: Math.min(seatsTotal, avail + booking.seats) });
      }
    }
    tx.update(bookingRef, { status: 'cancelled' });
  });
}

// ================================================================ chat

export function subscribeChat(tripId: string, cb: (m: ChatMessage[]) => void, onError?: ErrorHandler): Unsubscribe {
  const q = query(collection(getDb(), 'chats'), where('tripId', '==', tripId));
  return onSnapshot(
    q,
    (snap) => cb(listFromQuery(snap, normalizeChat).sort((a, b) => a.at - b.at).slice(-150)),
    (err) => onError?.(err),
  );
}

export async function sendChat(tripId: string, sender: UserProfile, text: string): Promise<void> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  const chatRef = doc(collection(getDb(), 'chats'));
  await setDoc(chatRef, {
    id: chatRef.id,
    tripId,
    uid: sender.uid,
    name: sender.name,
    text: clean,
    at: Date.now(),
  });
}

// ================================================================ safety

export async function raiseSos(tripId: string, user: UserProfile, location: LatLng | null): Promise<string> {
  const sosRef = doc(collection(getDb(), 'sos'));
  await setDoc(sosRef, {
    id: sosRef.id,
    tripId,
    uid: user.uid,
    name: user.name,
    phone: user.phone,
    location: location ? [location[0], location[1]] : null,
    at: Date.now(),
    resolved: false,
  });
  return sosRef.id;
}

export function subscribeSos(cb: (alerts: SosAlert[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onSnapshot(
    collection(getDb(), 'sos'),
    (snap) => cb(listFromQuery(snap, normalizeSos).sort((a, b) => b.at - a.at)),
    (err) => onError?.(err),
  );
}

export function resolveSos(id: string): Promise<void> {
  return updateDoc(doc(getDb(), 'sos', id), { resolved: true });
}

// ================================================================ admin

export function subscribeAllUsers(cb: (users: UserProfile[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onSnapshot(
    collection(getDb(), 'users'),
    (snap) => cb(listFromQuery(snap, normalizeProfile).sort((a, b) => b.createdAt - a.createdAt)),
    (err) => onError?.(err),
  );
}

export function adminUpdateUser(uid: string, patch: { role?: Role; verified?: boolean }): Promise<void> {
  return setDoc(doc(getDb(), 'users', uid), patch, { merge: true });
}

export function adminDeleteUser(uid: string): Promise<void> {
  return deleteDoc(doc(getDb(), 'users', uid));
}

export type { Gender };
