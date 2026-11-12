import {
  equalTo,
  get,
  limitToFirst,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  startAt,
  update,
  type DataSnapshot,
  type Unsubscribe,
} from 'firebase/database';
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
// RTDB drops empty values and may return arrays as objects, so every read is sanitised.

const ROLES = ['rider', 'driver', 'admin'] as const;
const GENDERS = ['female', 'male', 'other'] as const;
const TRIP_STATUSES = ['scheduled', 'in_transit', 'completed', 'cancelled'] as const;
const BOOKING_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled'] as const;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
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
  if (o && '0' in o && '1' in o) return toLatLng([o['0'], o['1']]);
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
    name: str(r.name, 'Unnamed'),
    email: str(r.email),
    phone: str(r.phone),
    role: oneOf(r.role, ROLES, 'rider'),
    gender: oneOf(r.gender, GENDERS, 'other'),
    college: str(r.college),
    collegeId: str(r.collegeId),
    branch: str(r.branch),
    year: str(r.year),
    vehicle: toVehicle(r.vehicle),
    verified: r.verified === true,
    createdAt: num(r.createdAt),
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

function listFrom<T>(snap: DataSnapshot, fn: (id: string, raw: unknown) => T | null): T[] {
  const out: T[] = [];
  snap.forEach((child) => {
    const item = fn(child.key ?? '', child.val());
    if (item) out.push(item);
  });
  return out;
}

function placeRecord(p: Place) {
  return { label: p.label, position: [p.position[0], p.position[1]] };
}

// ================================================================ users

export type NewProfile = Omit<UserProfile, 'uid' | 'createdAt' | 'savedPlaces' | 'verified'>;

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await get(ref(getDb(), `users/${uid}`));
  return normalizeProfile(uid, snap.val());
}

export function subscribeProfile(uid: string, cb: (p: UserProfile | null) => void, onError?: ErrorHandler): Unsubscribe {
  return onValue(
    ref(getDb(), `users/${uid}`),
    (snap) => cb(normalizeProfile(uid, snap.val())),
    (err) => onError?.(err),
  );
}

export function createProfile(uid: string, data: NewProfile): Promise<void> {
  return set(ref(getDb(), `users/${uid}`), {
    ...data,
    vehicle: data.vehicle ?? null,
    uid,
    verified: false,
    createdAt: Date.now(),
  });
}

export type ProfilePatch = Partial<Pick<UserProfile, 'name' | 'phone' | 'gender' | 'college' | 'collegeId' | 'branch' | 'year' | 'vehicle'>>;

export function updateProfile(uid: string, patch: ProfilePatch): Promise<void> {
  return update(ref(getDb(), `users/${uid}`), patch);
}

export function setOwnRole(uid: string, role: Exclude<Role, 'admin'>): Promise<void> {
  return update(ref(getDb(), `users/${uid}`), { role });
}

export function markVerified(uid: string): Promise<void> {
  return update(ref(getDb(), `users/${uid}`), { verified: true });
}

export function savePlace(uid: string, key: string, place: Place): Promise<void> {
  return set(ref(getDb(), `users/${uid}/savedPlaces/${key}`), placeRecord(place));
}

export function removePlace(uid: string, key: string): Promise<void> {
  return remove(ref(getDb(), `users/${uid}/savedPlaces/${key}`));
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
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, start.getHours(), start.getMinutes());
    if (recurrence.days.includes(d.getDay()) && d.getTime() > now) out.push(d.getTime());
  }
  return out;
}

export async function createTrips(input: NewTripInput, recurrence: Recurrence | null): Promise<string[]> {
  const db = getDb();
  const departures = expandDepartures(input.departAt, recurrence);
  if (departures.length === 0) throw new Error('Departure must be in the future (or pick repeat days that fall ahead).');

  const seriesId = departures.length > 1 ? push(ref(db, 'trips')).key : null;
  const updates: Record<string, unknown> = {};
  const ids: string[] = [];
  const now = Date.now();

  for (const departAt of departures) {
    const id = push(ref(db, 'trips')).key;
    if (!id) throw new Error('Could not allocate a trip id.');
    ids.push(id);
    updates[`trips/${id}`] = {
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
      routeCoordinates: input.route.coordinates,
      womenOnly: input.womenOnly,
      seriesId,
      status: 'scheduled' satisfies TripStatus,
      driverLocation: null,
      tripStartedAt: null,
      simDurationMs: input.simDurationMs,
      createdAt: now,
    };
  }
  await update(ref(db), updates);
  return ids;
}

export function subscribeTrip(id: string, cb: (t: Trip | null) => void, onError?: ErrorHandler): Unsubscribe {
  return onValue(
    ref(getDb(), `trips/${id}`),
    (snap) => cb(normalizeTrip(id, snap.val())),
    (err) => onError?.(err),
  );
}

export function subscribeUpcomingTrips(cb: (trips: Trip[]) => void, onError?: ErrorHandler): Unsubscribe {
  const q = query(
    ref(getDb(), 'trips'),
    orderByChild('departAt'),
    startAt(Date.now() - 3 * 60 * 60 * 1000),
    limitToFirst(300),
  );
  return onValue(
    q,
    (snap) => cb(listFrom(snap, normalizeTrip).filter((t) => t.status === 'scheduled' || t.status === 'in_transit')),
    (err) => onError?.(err),
  );
}

export function subscribeDriverTrips(uid: string, cb: (trips: Trip[]) => void, onError?: ErrorHandler): Unsubscribe {
  const q = query(ref(getDb(), 'trips'), orderByChild('driverId'), equalTo(uid));
  return onValue(
    q,
    (snap) => cb(listFrom(snap, normalizeTrip).sort((a, b) => a.departAt - b.departAt)),
    (err) => onError?.(err),
  );
}

export function subscribeAllTrips(cb: (trips: Trip[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onValue(
    ref(getDb(), 'trips'),
    (snap) => cb(listFrom(snap, normalizeTrip).sort((a, b) => b.departAt - a.departAt)),
    (err) => onError?.(err),
  );
}

export function startTrip(id: string): Promise<void> {
  return update(ref(getDb(), `trips/${id}`), { status: 'in_transit', tripStartedAt: Date.now() });
}

export function updateDriverLocation(id: string, location: LatLng): Promise<void> {
  return update(ref(getDb(), `trips/${id}`), { driverLocation: location });
}

export function completeTrip(id: string, finalLocation: LatLng | null): Promise<void> {
  return update(ref(getDb(), `trips/${id}`), { status: 'completed', driverLocation: finalLocation });
}

export function setTripStatus(id: string, status: TripStatus): Promise<void> {
  return update(ref(getDb(), `trips/${id}`), { status });
}

/** Cancels the trip and every open booking on it in one atomic multi-path write. */
export async function cancelTrip(id: string): Promise<void> {
  const db = getDb();
  const snap = await get(query(ref(db, 'bookings'), orderByChild('tripId'), equalTo(id)));
  const updates: Record<string, unknown> = { [`trips/${id}/status`]: 'cancelled' };
  for (const b of listFrom(snap, normalizeBooking)) {
    if (b.status === 'pending' || b.status === 'accepted') updates[`bookings/${b.id}/status`] = 'cancelled';
  }
  await update(ref(db), updates);
}

export function deleteTrip(id: string): Promise<void> {
  return remove(ref(getDb(), `trips/${id}`));
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
  await set(ref(getDb(), `bookings/${id}`), {
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
  return onValue(
    ref(getDb(), `bookings/${id}`),
    (snap) => cb(normalizeBooking(id, snap.val())),
    (err) => onError?.(err),
  );
}

export function subscribeTripBookings(tripId: string, cb: (b: Booking[]) => void, onError?: ErrorHandler): Unsubscribe {
  const q = query(ref(getDb(), 'bookings'), orderByChild('tripId'), equalTo(tripId));
  return onValue(
    q,
    (snap) => cb(listFrom(snap, normalizeBooking).sort((a, b) => a.createdAt - b.createdAt)),
    (err) => onError?.(err),
  );
}

export function subscribeRiderBookings(uid: string, cb: (b: Booking[]) => void, onError?: ErrorHandler): Unsubscribe {
  const q = query(ref(getDb(), 'bookings'), orderByChild('riderId'), equalTo(uid));
  return onValue(
    q,
    (snap) => cb(listFrom(snap, normalizeBooking).sort((a, b) => a.departAt - b.departAt)),
    (err) => onError?.(err),
  );
}

export function subscribeAllBookings(cb: (b: Booking[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onValue(
    ref(getDb(), 'bookings'),
    (snap) => cb(listFrom(snap, normalizeBooking).sort((a, b) => b.createdAt - a.createdAt)),
    (err) => onError?.(err),
  );
}

/** Atomically reserves seats, then confirms the booking and grants chat/tracking membership. */
export async function acceptBooking(booking: Booking): Promise<void> {
  const db = getDb();
  const result = await runTransaction(ref(db, `trips/${booking.tripId}/seatsAvailable`), (current: number | null) => {
    if (current === null) return current;
    if (current >= booking.seats) return current - booking.seats;
    return undefined;
  });
  if (!result.committed || typeof result.snapshot.val() !== 'number') {
    throw new Error('Not enough seats left to accept this request.');
  }
  await update(ref(db), {
    [`bookings/${booking.id}/status`]: 'accepted',
    [`tripMembers/${booking.tripId}/${booking.riderId}`]: true,
  });
}

export function rejectBooking(booking: Booking): Promise<void> {
  return update(ref(getDb(), `bookings/${booking.id}`), { status: 'rejected' });
}

export async function cancelBooking(booking: Booking, seatsTotal: number): Promise<void> {
  const db = getDb();
  if (booking.status === 'accepted') {
    await runTransaction(ref(db, `trips/${booking.tripId}/seatsAvailable`), (current: number | null) => {
      if (current === null) return current;
      return Math.min(seatsTotal, current + booking.seats);
    });
  }
  await update(ref(db), {
    [`bookings/${booking.id}/status`]: 'cancelled',
    [`tripMembers/${booking.tripId}/${booking.riderId}`]: null,
  });
}

// ================================================================ chat

export function subscribeChat(tripId: string, cb: (m: ChatMessage[]) => void, onError?: ErrorHandler): Unsubscribe {
  const q = query(ref(getDb(), `chats/${tripId}`), orderByChild('at'), limitToLast(150));
  return onValue(
    q,
    (snap) => cb(listFrom(snap, normalizeChat)),
    (err) => onError?.(err),
  );
}

export async function sendChat(tripId: string, sender: UserProfile, text: string): Promise<void> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  await push(ref(getDb(), `chats/${tripId}`), { uid: sender.uid, name: sender.name, text: clean, at: Date.now() });
}

// ================================================================ safety

export async function raiseSos(tripId: string, user: UserProfile, location: LatLng | null): Promise<string> {
  const r = push(ref(getDb(), 'sos'));
  await set(r, {
    tripId,
    uid: user.uid,
    name: user.name,
    phone: user.phone,
    location,
    at: Date.now(),
    resolved: false,
  });
  return r.key ?? '';
}

export function subscribeSos(cb: (alerts: SosAlert[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onValue(
    ref(getDb(), 'sos'),
    (snap) => cb(listFrom(snap, normalizeSos).sort((a, b) => b.at - a.at)),
    (err) => onError?.(err),
  );
}

export function resolveSos(id: string): Promise<void> {
  return update(ref(getDb(), `sos/${id}`), { resolved: true });
}

// ================================================================ admin

export function subscribeAllUsers(cb: (users: UserProfile[]) => void, onError?: ErrorHandler): Unsubscribe {
  return onValue(
    ref(getDb(), 'users'),
    (snap) => cb(listFrom(snap, normalizeProfile).sort((a, b) => b.createdAt - a.createdAt)),
    (err) => onError?.(err),
  );
}

export function adminUpdateUser(uid: string, patch: { role?: Role; verified?: boolean }): Promise<void> {
  return update(ref(getDb(), `users/${uid}`), patch);
}

export function adminDeleteUser(uid: string): Promise<void> {
  return remove(ref(getDb(), `users/${uid}`));
}

export type { Gender };

