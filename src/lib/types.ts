export type LatLng = [number, number];

export type Role = 'rider' | 'driver' | 'admin';
export type Gender = 'female' | 'male' | 'other';

export interface Place {
  label: string;
  position: LatLng;
}

export interface Vehicle {
  model: string;
  plate: string;
  color: string;
  seats: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  gender: Gender;
  college: string;
  collegeId: string;
  branch: string;
  year: string;
  vehicle: Vehicle | null;
  verified: boolean;
  createdAt: number;
  savedPlaces: Record<string, Place>;
}

export type TripStatus = 'scheduled' | 'in_transit' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  driverId: string;
  driverName: string;
  driverGender: Gender;
  driverVerified: boolean;
  vehicle: Vehicle | null;
  from: Place;
  to: Place;
  departAt: number;
  seatsTotal: number;
  seatsAvailable: number;
  pricePerSeat: number;
  distanceKm: number;
  durationMin: number;
  routeCoordinates: LatLng[];
  womenOnly: boolean;
  seriesId: string | null;
  status: TripStatus;
  driverLocation: LatLng | null;
  tripStartedAt: number | null;
  simDurationMs: number;
  createdAt: number;
}

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface Booking {
  id: string;
  tripId: string;
  driverId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  riderGender: Gender;
  riderVerified: boolean;
  seats: number;
  fare: number;
  status: BookingStatus;
  createdAt: number;
  fromLabel: string;
  toLabel: string;
  departAt: number;
}

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  text: string;
  at: number;
}

export interface SosAlert {
  id: string;
  tripId: string;
  uid: string;
  name: string;
  phone: string;
  location: LatLng | null;
  at: number;
  resolved: boolean;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  durationMin: number;
  fare: number;
  coordinates: LatLng[];
}
