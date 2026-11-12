// Google Maps & Leaflet Hybrid Map & Simulation Engine for Uniride (India-focused)

window.GOOGLE_MAPS_API_KEY = window.GOOGLE_MAPS_API_KEY || "";

let googleMap = null;
let directionsService = null;
let directionsRenderer = null;
let driverMarker = null;
let passengerMarker = null;
let nearbyMarkers = [];
let activeRoutePolyline = null;
let simulationInterval = null;
let simulationPath = [];
let simulationIndex = 0;
let simulationSpeedMultiplier = 2; // Default speed multiplier

// Leaflet variables
let leafletMap = null;
let leafletDriverMarker = null;
let leafletPassengerMarker = null;
let leafletNearbyMarkers = [];
let leafletRoutePolyline = null;
let currentMapElementId = 'liveMap';
let googleMapsAuthFailed = false;
let currentTrackingBookingId = null;
let currentTrackingBookingStatus = null;
let activeTrackingUnsubscribe = null;

const DEFAULT_CENTER = { lat: 26.8439, lng: 75.5652 }; // Manipal University Jaipur (MUJ)

// Hotspot coordinates for quick-jump map pills
const MAP_HOTSPOTS = {
    muj:       { lat: 26.8439, lng: 75.5652, zoom: 15, label: 'MUJ Campus' },
    civillines:{ lat: 26.9124, lng: 75.7873, zoom: 14, label: 'Civil Lines' },
    station:   { lat: 26.9179, lng: 75.7905, zoom: 15, label: 'Jaipur Railway Station' },
    airport:   { lat: 26.8242, lng: 75.8122, zoom: 14, label: 'Jaipur International Airport' },
    vaishali:  { lat: 26.9124, lng: 75.7448, zoom: 14, label: 'Vaishali Nagar' }
};

function jumpToHotspot(key) {
    const spot = MAP_HOTSPOTS[key];
    if (!spot) return;

    // Update pill active state
    document.querySelectorAll('.hotspot-pill').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.hotspot-pill').forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${key}'`)) {
            btn.classList.add('active');
        }
    });

    // Fly the Leaflet map to the hotspot
    if (typeof leafletMap !== 'undefined' && leafletMap) {
        leafletMap.flyTo([spot.lat, spot.lng], spot.zoom, { animate: true, duration: 0.8 });
        setTimeout(() => leafletMap.invalidateSize(), 900);
        // Update overlay info
        const infoEl = document.getElementById('rideInfoContent');
        if (infoEl) {
            infoEl.textContent = `📍 ${spot.label} · Live campus map`;
        }
    }
}

// Check if a valid Google Maps script is present
function isGoogleMapsAvailable() {
    if (googleMapsAuthFailed) return false;
    const key = window.GOOGLE_MAPS_API_KEY;
    if (!key || key.trim() === "") return false;
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') return false;
    
    // Check if the script contains a blank key
    const script = document.querySelector('script[src*="maps.googleapis.com"]');
    if (script) {
        const src = script.getAttribute('src');
        if (src.includes('key=&') || src.endsWith('key=')) {
            return false; // key is empty
        }
    }
    return true;
}

// Global Google Maps Auth Failure Handler
window.gm_authFailure = function() {
    console.warn("Google Maps API authentication failed. Switching to Leaflet mapping.");
    googleMapsAuthFailed = true;
    triggerLeafletMapFallback();
};

function triggerLeafletMapFallback() {
    if (currentMapElementId) {
        initLeafletMap(currentMapElementId);
    }
    initCustomAutocomplete();
}

// Load Leaflet resources dynamically
function loadLeafletResources(callback) {
    if (window.L) {
        callback();
        return;
    }
    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = callback;
    document.head.appendChild(script);
}

// Initialize Autocomplete for inputs
function initGoogleMapsAutocomplete() {
    if (!isGoogleMapsAvailable()) {
        initCustomAutocomplete();
        return;
    }

    const fromInput = document.getElementById('rideFrom');
    const toInput = document.getElementById('rideTo');
    const searchInput = document.getElementById('searchDestination');

    const jaipurBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(26.0, 74.2),
        new google.maps.LatLng(27.5, 76.6)
    );
    const autocompleteOptions = {
        bounds: jaipurBounds,
        strictBounds: true,
        fields: ['formatted_address', 'geometry', 'name']
    };

    if (fromInput && typeof google !== 'undefined') {
        try {
            const fromAutocomplete = new google.maps.places.Autocomplete(fromInput, autocompleteOptions);
            fromAutocomplete.addListener('place_changed', () => {
                const place = fromAutocomplete.getPlace();
                if (place.geometry) {
                    fromInput.dataset.lat = place.geometry.location.lat();
                    fromInput.dataset.lng = place.geometry.location.lng();
                }
            });
        } catch (e) {
            console.error("Google maps autocomplete failed to initialize, using custom fallback:", e);
            initCustomAutocomplete();
            return;
        }
    }

    if (toInput && typeof google !== 'undefined') {
        try {
            const toAutocomplete = new google.maps.places.Autocomplete(toInput, autocompleteOptions);
            toAutocomplete.addListener('place_changed', () => {
                const place = toAutocomplete.getPlace();
                if (place.geometry) {
                    toInput.dataset.lat = place.geometry.location.lat();
                    toInput.dataset.lng = place.geometry.location.lng();
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    if (searchInput && typeof google !== 'undefined') {
        try {
            const searchAutocomplete = new google.maps.places.Autocomplete(searchInput, autocompleteOptions);
            searchAutocomplete.addListener('place_changed', () => {
                const place = searchAutocomplete.getPlace();
                if (place.geometry) {
                    searchInput.dataset.lat = place.geometry.location.lat();
                    searchInput.dataset.lng = place.geometry.location.lng();
                }
            });
        } catch (e) {
            console.error(e);
        }
    }
}

let customAutocompleteInitialized = false;

// Custom autocomplete fallback using Photon API (Komoot/OSM)
function initCustomAutocomplete() {
    if (customAutocompleteInitialized) return;
    
    const rideFromEl = document.getElementById('rideFrom');
    const rideToEl = document.getElementById('rideTo');
    const searchDestEl = document.getElementById('searchDestination');
    
    if (!rideFromEl && !rideToEl && !searchDestEl) return;
    
    customAutocompleteInitialized = true;
    setupCustomAutocomplete(rideFromEl);
    setupCustomAutocomplete(rideToEl);
    setupDestAutocomplete(searchDestEl);
}

function setupDestAutocomplete(input) {
    setupCustomAutocomplete(input);
}

// Campus & Jaipur Hotspot Presets for Instant Autocomplete
const JAIPUR_HOTSPOTS = [
    { name: 'Manipal University Jaipur (MUJ)', city: 'Dehmi Kalan, Jaipur', lat: 26.8439, lng: 75.5652 },
    { name: 'MUJ Hostel & Campus Gate', city: 'Jaipur-Ajmer Expressway', lat: 26.8450, lng: 75.5660 },
    { name: 'Jaipur Railway Station', city: 'Gopalbari, Jaipur', lat: 26.9196, lng: 75.7878 },
    { name: 'Jaipur International Airport (JAI)', city: 'Sanganer, Jaipur', lat: 26.8242, lng: 75.8122 },
    { name: 'Civil Lines Metro Station', city: 'Civil Lines, Jaipur', lat: 26.9094, lng: 75.7845 },
    { name: 'Vaishali Nagar (Amrapali Circle)', city: 'Vaishali Nagar, Jaipur', lat: 26.9028, lng: 75.7447 },
    { name: 'Sindhi Camp Central Bus Stand', city: 'Station Road, Jaipur', lat: 26.9242, lng: 75.7997 },
    { name: 'Malviya Nagar (Gaurav Tower)', city: 'Malviya Nagar, Jaipur', lat: 26.8525, lng: 75.8052 },
    { name: 'Mansarovar Metro Station', city: 'Mansarovar, Jaipur', lat: 26.8742, lng: 75.7485 },
    { name: 'Raja Park', city: 'Jaipur, Rajasthan', lat: 26.8927, lng: 75.8276 },
    { name: 'MI Road / Panch Batti', city: 'Jaipur, Rajasthan', lat: 26.9185, lng: 75.8164 },
    { name: 'JECRC University', city: 'Sitapura, Jaipur', lat: 26.7828, lng: 75.8569 },
    { name: 'Poornima University', city: 'Sitapura, Jaipur', lat: 26.7749, lng: 75.8685 }
];

function setupCustomAutocomplete(input) {
    if (!input) return;
    if (input.dataset.autocompleteAttached) return;
    input.dataset.autocompleteAttached = "true";
    
    const activeInput = input;
    
    // Ensure parent is wrapped in autocomplete-wrapper
    let wrapper = activeInput.parentElement;
    if (!wrapper.classList.contains('autocomplete-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        wrapper.style.position = 'relative';
        activeInput.parentNode.insertBefore(wrapper, activeInput);
        wrapper.appendChild(activeInput);
    }
    
    // Create autocomplete list
    let list = wrapper.querySelector('.autocomplete-suggestions');
    if (!list) {
        list = document.createElement('ul');
        list.className = 'autocomplete-suggestions';
        list.style.position = 'absolute';
        list.style.top = '100%';
        list.style.left = '0';
        list.style.right = '0';
        list.style.zIndex = '9999';
        list.style.background = '#ffffff';
        list.style.borderRadius = '8px';
        list.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
        list.style.border = '1px solid #e2e8f0';
        list.style.maxHeight = '220px';
        list.style.overflowY = 'auto';
        list.style.listStyle = 'none';
        list.style.padding = '4px 0';
        list.style.margin = '4px 0 0 0';
        list.style.display = 'none';
        wrapper.appendChild(list);
    }
    
    let debounceTimer = null;
    let selectedIndex = -1;
    let currentSuggestions = [];
    
    function getHotspotSuggestions(query) {
        const q = (query || '').toLowerCase().trim();
        if (!q) return JAIPUR_HOTSPOTS.slice(0, 5);
        return JAIPUR_HOTSPOTS.filter(h => 
            h.name.toLowerCase().includes(q) || h.city.toLowerCase().includes(q)
        );
    }

    function renderHotspots(spots) {
        list.innerHTML = '';
        if (spots.length === 0) {
            list.style.display = 'none';
            return;
        }

        spots.forEach((spot) => {
            const item = document.createElement('li');
            item.className = 'autocomplete-suggestion';
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid #f1f5f9';
            item.innerHTML = `
                <div class="location-title" style="font-weight:600;font-size:0.875rem;color:#1e293b;">📍 ${spot.name}</div>
                <div class="location-subtitle" style="font-size:0.75rem;color:#64748b;">${spot.city}</div>
            `;
            item.addEventListener('mouseenter', () => item.style.background = '#f8fafc');
            item.addEventListener('mouseleave', () => item.style.background = '#ffffff');
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectPlace(spot.name, spot.city, spot.lat, spot.lng);
            });
            list.appendChild(item);
        });
        list.style.display = 'block';
    }

    // Input listener
    activeInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = activeInput.value.trim();
        selectedIndex = -1;
        
        // Show matching local hotspots immediately
        const localMatches = getHotspotSuggestions(query);
        if (localMatches.length > 0) {
            renderHotspots(localMatches);
        } else if (query.length < 3) {
            list.innerHTML = '';
            list.style.display = 'none';
            return;
        }
        
        if (query.length >= 3) {
            debounceTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=26.8439&lon=75.5652&bbox=74.2,26.0,76.6,27.5&limit=5`);
                    const data = await response.json();
                    
                    if (data.features && data.features.length > 0) {
                        const photonSpots = data.features.map(f => {
                            const p = f.properties;
                            const coords = f.geometry.coordinates;
                            return {
                                name: p.name || query,
                                city: [p.street, p.city || p.town, p.state].filter(Boolean).join(', ') || 'Jaipur',
                                lat: coords[1],
                                lng: coords[0]
                            };
                        });
                        // Combine local + photon
                        const combined = [...localMatches, ...photonSpots].slice(0, 6);
                        renderHotspots(combined);
                    }
                } catch (e) {
                    console.warn("Photon autocomplete fallback error:", e);
                }
            }, 300);
        }
    });

    function selectPlace(name, city, lat, lng) {
        activeInput.value = name;
        activeInput.dataset.lat = lat;
        activeInput.dataset.lng = lng;
        list.innerHTML = '';
        list.style.display = 'none';

        if (googleMap && isGoogleMapsAvailable()) {
            googleMap.panTo({ lat, lng });
        } else if (leafletMap) {
            leafletMap.panTo([lat, lng]);
        }
    }

    activeInput.addEventListener('focus', () => {
        if (!activeInput.value.trim()) {
            renderHotspots(JAIPUR_HOTSPOTS.slice(0, 5));
        } else {
            const matches = getHotspotSuggestions(activeInput.value);
            if (matches.length > 0) renderHotspots(matches);
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            list.style.display = 'none';
        }
    });
}

// Initialize Live Map
function initLiveTrackingMap(elementId) {
    currentMapElementId = elementId;
    
    if (!isGoogleMapsAvailable()) {
        initLeafletMap(elementId);
        initCustomAutocomplete();
        return null;
    }

    const mapOptions = {
        zoom: 15,
        center: DEFAULT_CENTER,
        mapId: 'uniride_map_style', // Custom clean style ID
        disableDefaultUI: true,
        zoomControl: true,
        restriction: {
            latLngBounds: {
                north: 27.5,
                south: 26.0,
                west: 74.2,
                east: 76.6
            },
            strictBounds: true
        },
        minZoom: 9
    };

    try {
        googleMap = new google.maps.Map(document.getElementById(elementId), mapOptions);
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            map: googleMap,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: '#1976D2',
                strokeOpacity: 0.8,
                strokeWeight: 5
            }
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    // Ensure current location lies within restrictions
                    if (pos.lat >= 26.0 && pos.lat <= 27.5 && pos.lng >= 74.2 && pos.lng <= 76.6) {
                        googleMap.setCenter(pos);
                    } else {
                        googleMap.setCenter(DEFAULT_CENTER);
                    }
                },
                () => {
                    googleMap.setCenter(DEFAULT_CENTER);
                }
            );
        }
        return googleMap;
    } catch (e) {
        console.error("Google Maps initialization failed, switching to Leaflet:", e);
        initLeafletMap(elementId);
        return null;
    }
}

let leafletActiveRideMarkers = [];

// Render active posted rides directly on the campus map
async function renderActiveRidesOnMapLeaflet() {
    if (!leafletMap || typeof db === 'undefined') return;

    // Clear old active ride markers
    leafletActiveRideMarkers.forEach(m => {
        try { m.remove(); } catch(e){}
    });
    leafletActiveRideMarkers = [];

    try {
        const snapshot = await db.collection('rides')
            .where('status', '==', 'ACTIVE')
            .limit(20)
            .get();

        if (snapshot.empty) return;

        snapshot.forEach(doc => {
            const ride = doc.data();
            const fromLat = ride.fromLatLng ? ride.fromLatLng.lat : null;
            const fromLng = ride.fromLatLng ? ride.fromLatLng.lng : null;
            if (!fromLat || !fromLng) return;

            const rideIcon = L.divIcon({
                html: `<div style="background:#FF5C00;width:26px;height:26px;border-radius:50%;border:2px solid white;box-shadow:0 3px 10px rgba(255,92,0,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;cursor:pointer;">🚗</div>`,
                className: 'active-ride-pin',
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });

            const marker = L.marker([fromLat, fromLng], { icon: rideIcon }).addTo(leafletMap);
            marker.bindPopup(`
                <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:190px;">
                    <div style="font-weight:700;color:#0f172a;font-size:0.92rem;margin-bottom:4px;">${ride.from} → ${ride.to}</div>
                    <div style="font-size:0.8rem;color:#475569;">Driver: <strong>${ride.driverName || 'Student Driver'}</strong></div>
                    <div style="font-size:0.82rem;color:#FF5C00;font-weight:700;margin-top:4px;">₹${(ride.farePerPerson || 0).toFixed(0)}/seat · ${ride.seatsAvailable} seats available</div>
                    <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">📅 ${ride.date} at ${ride.time}</div>
                </div>
            `);
            leafletActiveRideMarkers.push(marker);
        });
    } catch (e) {
        console.warn('Could not load active rides for map display:', e);
    }
}

window.renderActiveRidesOnMap = function() {
    if (leafletMap) {
        renderActiveRidesOnMapLeaflet();
    }
};

window.stopRideTracking = function() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    if (activeTrackingUnsubscribe) {
        activeTrackingUnsubscribe();
        activeTrackingUnsubscribe = null;
    }
    currentTrackingBookingId = null;
    currentTrackingBookingStatus = null;

    if (leafletRoutePolyline) {
        try { leafletRoutePolyline.remove(); } catch(e){}
        leafletRoutePolyline = null;
    }
    if (leafletDriverMarker) {
        try { leafletDriverMarker.remove(); } catch(e){}
        leafletDriverMarker = null;
    }
    if (leafletPassengerMarker) {
        try { leafletPassengerMarker.remove(); } catch(e){}
        leafletPassengerMarker = null;
    }

    if (leafletMap) {
        leafletMap.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 13);
        renderNearbyCabsLeaflet(DEFAULT_CENTER);
        renderActiveRidesOnMapLeaflet();
        setTimeout(() => leafletMap.invalidateSize(), 100);
    }
};

// Initialize Leaflet Map Fallback
function initLeafletMap(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    container.innerHTML = '';
    
    loadLeafletResources(() => {
        if (leafletMap) {
            try { leafletMap.remove(); } catch(e){}
            leafletMap = null;
        }
        
        const jaipurBounds = L.latLngBounds([26.3, 74.8], [27.5, 76.6]);
        leafletMap = L.map(elementId, {
            zoomControl: true,
            attributionControl: false,
            maxBounds: jaipurBounds,
            maxBoundsViscosity: 0.8,
            minZoom: 9
        }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(leafletMap);
        
        // Render nearby cabs & active rides
        renderNearbyCabsLeaflet(DEFAULT_CENTER);
        renderActiveRidesOnMapLeaflet();

        [100, 300, 700, 1500].forEach(delay => {
            setTimeout(() => {
                if (leafletMap) {
                    leafletMap.invalidateSize();
                }
            }, delay);
        });
        window.addEventListener('resize', () => {
            if (leafletMap) leafletMap.invalidateSize();
        });
    });
}

// Render Cabs main switcher
function renderNearbyCabs(centerLatLng) {
    if (isGoogleMapsAvailable()) {
        renderNearbyCabsGoogle(centerLatLng);
    } else {
        renderNearbyCabsLeaflet(centerLatLng || DEFAULT_CENTER);
    }
}

function renderNearbyCabsGoogle(centerLatLng) {
    if (!googleMap || typeof google === 'undefined') return;

    // Clear previous nearby markers
    nearbyMarkers.forEach(marker => marker.setMap(null));
    nearbyMarkers = [];

    const center = centerLatLng || googleMap.getCenter() || DEFAULT_CENTER;
    const lat = typeof center.lat === 'function' ? center.lat() : center.lat;
    const lng = typeof center.lng === 'function' ? center.lng() : center.lng;

    const mockOffsets = [
        { lat: 0.003, lng: 0.002, type: 'Auto Rickshaw' },
        { lat: -0.002, lng: 0.004, type: 'Cab Sedan' },
        { lat: 0.005, lng: -0.003, type: 'Cab Hatchback' },
        { lat: -0.004, lng: -0.002, type: 'Auto Rickshaw' }
    ];

    mockOffsets.forEach((offset, index) => {
        const markerPos = {
            lat: lat + offset.lat,
            lng: lng + offset.lng
        };

        const iconUrl = offset.type.includes('Auto') 
            ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' 
            : 'https://maps.google.com/mapfiles/ms/icons/cabs.png';

        const marker = new google.maps.Marker({
            position: markerPos,
            map: googleMap,
            title: `${offset.type} (Nearby)`,
            icon: {
                url: iconUrl,
                scaledSize: new google.maps.Size(32, 32)
            }
        });

        nearbyMarkers.push(marker);
    });
}

function renderNearbyCabsLeaflet(centerLatLng) {
    if (!leafletMap) return;

    leafletNearbyMarkers.forEach(m => m.remove());
    leafletNearbyMarkers = [];

    const lat = centerLatLng.lat;
    const lng = centerLatLng.lng;

    const mockOffsets = [
        { lat: 0.003, lng: 0.002, type: 'Auto Rickshaw' },
        { lat: -0.002, lng: 0.004, type: 'Cab Sedan' },
        { lat: 0.005, lng: -0.003, type: 'Cab Hatchback' },
        { lat: -0.004, lng: -0.002, type: 'Auto Rickshaw' }
    ];

    mockOffsets.forEach((offset) => {
        const pos = [lat + offset.lat, lng + offset.lng];
        const color = offset.type.includes('Auto') ? '#FFD600' : '#1976D2';

        const customMarker = L.divIcon({
            html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            className: 'custom-leaflet-icon',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker(pos, { icon: customMarker, title: offset.type }).addTo(leafletMap);
        leafletNearbyMarkers.push(marker);
    });
}

// Update Simulation Speed
function setSimulationSpeed(multiplier) {
    simulationSpeedMultiplier = multiplier;
    showToast(`Simulation speed set to ${multiplier}x`, 'info');
}

// Geocode addresses if coordinates are missing
async function getLatLngForAddress(address) {
    if (!isGoogleMapsAvailable()) {
        try {
            const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&lat=26.8439&lon=75.5652&bbox=74.2,26.0,76.6,27.5&limit=1`);
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const coords = data.features[0].geometry.coordinates;
                return { lat: coords[1], lng: coords[0] };
            }
        } catch (e) {
            console.error("OSM Geocoding failed:", e);
        }
        
        if (address.toLowerCase().includes('station')) {
            return { lat: 26.9196, lng: 75.7878 };
        } else if (address.toLowerCase().includes('airport')) {
            return { lat: 26.8242, lng: 75.8122 };
        }
        return DEFAULT_CENTER;
    }

    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve) => {
        geocoder.geocode({
            address: address,
            componentRestrictions: { country: 'IN' },
            bounds: {
                north: 27.5,
                south: 26.0,
                west: 74.2,
                east: 76.6
            }
        }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const loc = results[0].geometry.location;
                resolve({ lat: loc.lat(), lng: loc.lng() });
            } else {
                resolve(DEFAULT_CENTER);
            }
        });
    });
}

// Start Simulated Trip/En-route Tracking
async function startRideTracking(booking, isDriverSide) {
    if (currentTrackingBookingId === booking.id && currentTrackingBookingStatus === booking.status) {
        return;
    }

    currentTrackingBookingId = booking.id;
    currentTrackingBookingStatus = booking.status;

    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }

    if (activeTrackingUnsubscribe) {
        activeTrackingUnsubscribe();
        activeTrackingUnsubscribe = null;
    }

    // Switch to Home section so that the activeRideMapCard (which is inside homeSection) is visible
    if (typeof switchSection === 'function') {
        switchSection('home');
    }

    const activeRideCard = document.getElementById('activeRideMapCard');
    if (activeRideCard) activeRideCard.style.display = 'block';

    if (isGoogleMapsAvailable() && !googleMap) {
        initLiveTrackingMap('liveMap');
    } else if (!isGoogleMapsAvailable() && !leafletMap) {
        initLiveTrackingMap('liveMap');
    } else if (!isGoogleMapsAvailable() && leafletMap) {
        setTimeout(() => {
            leafletMap.invalidateSize();
        }, 100);
    }

    const overlayContent = document.getElementById('rideInfoContent');
    const rideDoc = await db.collection('rides').doc(booking.rideId).get();
    const ride = rideDoc.data();

    const pickupLoc = ride.fromLatLng || await getLatLngForAddress(ride.from);
    const destLoc = ride.toLatLng || await getLatLngForAddress(ride.to);

    let driverLoc = booking.driverLocation || {
        lat: pickupLoc.lat + 0.012,
        lng: pickupLoc.lng - 0.008
    };

    // Render Markers
    if (isGoogleMapsAvailable()) {
        if (driverMarker) driverMarker.setMap(null);
        if (passengerMarker) passengerMarker.setMap(null);

        if (googleMap) {
            passengerMarker = new google.maps.Marker({
                position: pickupLoc,
                map: googleMap,
                title: 'Passenger Pickup',
                icon: {
                    url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                    scaledSize: new google.maps.Size(36, 36)
                }
            });

            driverMarker = new google.maps.Marker({
                position: driverLoc,
                map: googleMap,
                title: 'Driver Location',
                icon: {
                    url: 'https://maps.google.com/mapfiles/ms/icons/sportscar.png',
                    scaledSize: new google.maps.Size(36, 36)
                }
            });
        }
    } else {
        loadLeafletResources(() => {
            if (leafletDriverMarker) leafletDriverMarker.remove();
            if (leafletPassengerMarker) leafletPassengerMarker.remove();

            const passengerIcon = L.divIcon({
                html: `<div style="background-color: #2196F3; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>`,
                className: 'custom-passenger-icon',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const driverIcon = L.divIcon({
                html: `<div style="background-color: #4CAF50; width: 18px; height: 18px; border-radius: 4px; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); transform: rotate(45deg);"></div>`,
                className: 'custom-driver-icon',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });

            if (leafletMap) {
                leafletPassengerMarker = L.marker([pickupLoc.lat, pickupLoc.lng], { icon: passengerIcon, title: 'Passenger Pickup' }).addTo(leafletMap);
                leafletDriverMarker = L.marker([driverLoc.lat, driverLoc.lng], { icon: driverIcon, title: 'Driver Location' }).addTo(leafletMap);
            }
        });
    }

    activeTrackingUnsubscribe = db.collection('bookings').doc(booking.id).onSnapshot(async (doc) => {
        const updatedBooking = doc.data();
        if (!updatedBooking) return;

        if (updatedBooking.status === 'CANCELLED' || updatedBooking.status === 'REJECTED') {
            if (typeof window.stopRideTracking === 'function') {
                window.stopRideTracking();
            }
            const overlay = document.getElementById('rideInfoContent');
            if (overlay) {
                overlay.innerHTML = '📍 Campus Live Map · Showing active carpools & student transit across Jaipur';
            }
            const title = document.getElementById('liveMapTitle');
            if (title) title.textContent = '🚗 Campus Live Ride & Cab Map';
            const badge = document.getElementById('liveMapBadge');
            if (badge) badge.innerHTML = '<span class="live-dot"></span> Live';
            const sim = document.getElementById('map-simulation-controls');
            if (sim) sim.style.display = 'none';
            return;
        }

        if (!isDriverSide && updatedBooking.driverLocation) {
            if (isGoogleMapsAvailable()) {
                const newPos = new google.maps.LatLng(updatedBooking.driverLocation.lat, updatedBooking.driverLocation.lng);
                if (driverMarker) driverMarker.setPosition(newPos);
                if (googleMap) googleMap.panTo(newPos);
            } else {
                if (leafletDriverMarker && leafletMap) {
                    leafletDriverMarker.setLatLng([updatedBooking.driverLocation.lat, updatedBooking.driverLocation.lng]);
                    leafletMap.panTo([updatedBooking.driverLocation.lat, updatedBooking.driverLocation.lng]);
                }
            }
        }

        if (updatedBooking.status === 'ACCEPTED') {
            const simControls = document.getElementById('map-simulation-controls');
            if (simControls) simControls.style.display = 'flex';
            const mapTitle = document.getElementById('liveMapTitle');
            if (mapTitle) mapTitle.textContent = '🚗 Live Ride Tracking';
            const mapBadge = document.getElementById('liveMapBadge');
            if (mapBadge) mapBadge.innerHTML = '<span class="live-dot"></span> Tracking Active';

            overlayContent.innerHTML = `
                <div class="ride-status-badge status-accepted">Driver Confirmed</div>
                <div class="ride-detail-row"><strong>Driver:</strong> ${ride.driverName}</div>
                <div class="ride-detail-row"><strong>Vehicle:</strong> ${ride.vehicleInfo || 'Auto / Cab'}</div>
                <div class="ride-detail-row" id="etaTime">Calculating ETA...</div>
            `;
            drawRoute(driverLoc, pickupLoc);
            
            if (isDriverSide && !simulationInterval) {
                runSimulation(booking.id, driverLoc, pickupLoc, 'ARRIVED', async () => {
                    await db.collection('bookings').doc(booking.id).update({
                        status: 'ARRIVED'
                    });
                    showToast('You have arrived at the pickup location!', 'success');
                });
            }
        } 
        else if (updatedBooking.status === 'ARRIVED') {
            overlayContent.innerHTML = `
                <div class="ride-status-badge status-requested" style="background:#4CAF50;">Driver Arrived</div>
                <div class="ride-detail-row">Your ride is here!</div>
                ${!isDriverSide ? `
                    <div style="margin-top:0.8rem;">
                        <button class="btn-success" id="passengerStartJourneyBtn" onclick="startPassengerJourney('${booking.id}')">Start Journey</button>
                    </div>
                ` : `
                    <div class="ride-detail-row">Waiting for passenger to start journey...</div>
                `}
            `;
            if (isGoogleMapsAvailable()) {
                if (googleMap) {
                    googleMap.setZoom(16);
                    googleMap.panTo(pickupLoc);
                }
            } else {
                if (leafletMap) {
                    leafletMap.setZoom(16);
                    leafletMap.panTo([pickupLoc.lat, pickupLoc.lng]);
                }
            }
            if (simulationInterval) {
                clearInterval(simulationInterval);
                simulationInterval = null;
            }
        } 
        else if (updatedBooking.status === 'IN_PROGRESS') {
            const simControls = document.getElementById('map-simulation-controls');
            if (simControls) simControls.style.display = 'flex';
            const mapTitle = document.getElementById('liveMapTitle');
            if (mapTitle) mapTitle.textContent = '🚗 Live Ride Tracking';

            overlayContent.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;">
                    <div>
                        <div class="ride-status-badge status-accepted" style="background:#2196F3;margin-bottom:0.35rem;">🚗 Journey In Progress</div>
                        <div class="ride-detail-row" style="font-size:0.82rem;">Heading to: <strong>${ride.to}</strong></div>
                        <div class="ride-detail-row" id="etaTime" style="font-size:0.8rem;color:#666;">Calculating route...</div>
                    </div>
                    ${isDriverSide ? `
                    <button id="completeRideBtn"
                        onclick="completeRideManually('${booking.id}', '${booking.rideId}', '${booking.passengerId}', '${ride.driverId}')"
                        style="display:flex;align-items:center;gap:0.4rem;padding:0.55rem 1.1rem;
                               background:linear-gradient(135deg,#e55,#c00);color:white;border:none;
                               border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer;
                               box-shadow:0 3px 12px rgba(200,0,0,0.32);white-space:nowrap;
                               transition:transform 0.15s,box-shadow 0.15s;"
                        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(200,0,0,0.45)'"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 3px 12px rgba(200,0,0,0.32)'">
                        🏁 Complete Ride
                    </button>
                    ` : ''}
                </div>
            `;

            drawRoute(pickupLoc, destLoc);
            if (isGoogleMapsAvailable()) {
                if (passengerMarker) passengerMarker.setPosition(destLoc);
            } else {
                if (leafletPassengerMarker) leafletPassengerMarker.setLatLng([destLoc.lat, destLoc.lng]);
            }

            if (isDriverSide && !simulationInterval) {
                // Store callback for manual completion
                window._pendingCompleteCallback = async () => {
                    await db.collection('bookings').doc(booking.id).update({
                        status: 'COMPLETED',
                        completedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    const activeBookings = await db.collection('bookings')
                        .where('rideId', '==', booking.rideId)
                        .where('status', 'in', ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'])
                        .get();
                    
                    if (activeBookings.empty) {
                        await db.collection('rides').doc(booking.rideId).update({
                            status: 'COMPLETED',
                            completedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    const batch = db.batch();
                    batch.update(db.collection('users').doc(ride.driverId), {
                        ridesCompleted: firebase.firestore.FieldValue.increment(1)
                    });
                    batch.update(db.collection('users').doc(booking.passengerId), {
                        ridesCompleted: firebase.firestore.FieldValue.increment(1)
                    });
                    await batch.commit();

                    showToast('Journey completed successfully! 🎉', 'success');
                    setTimeout(() => { window.location.reload(); }, 2000);
                };

                runSimulation(booking.id, pickupLoc, destLoc, 'COMPLETED', window._pendingCompleteCallback);
            }
        } 
        else if (updatedBooking.status === 'COMPLETED') {
            overlayContent.innerHTML = `
                <div class="ride-status-badge status-accepted" style="background:#4CAF50;">✓ Completed</div>
                <div class="ride-detail-row">Thank you for riding with Uniride!</div>
            `;
            if (simulationInterval) {
                clearInterval(simulationInterval);
                simulationInterval = null;
            }
            setTimeout(() => {
                if (typeof window.stopRideTracking === 'function') {
                    window.stopRideTracking();
                }
                const overlay = document.getElementById('rideInfoContent');
                if (overlay) {
                    overlay.innerHTML = '📍 Campus Live Map · Showing active carpools & student transit across Jaipur';
                }
                const title = document.getElementById('liveMapTitle');
                if (title) title.textContent = '🚗 Campus Live Ride & Cab Map';
                const badge = document.getElementById('liveMapBadge');
                if (badge) badge.innerHTML = '<span class="live-dot"></span> Live';
                const sim = document.getElementById('map-simulation-controls');
                if (sim) sim.style.display = 'none';
            }, 3500);
            if (activeTrackingUnsubscribe) {
                activeTrackingUnsubscribe();
                activeTrackingUnsubscribe = null;
            }
            currentTrackingBookingId = null;
            currentTrackingBookingStatus = null;
        }
    });
}

window.startPassengerJourney = async function(bookingId) {
    try {
        await db.collection('bookings').doc(bookingId).update({
            status: 'IN_PROGRESS'
        });
        showToast('Journey started!', 'success');
    } catch (e) {
        console.error('Error starting journey:', e);
    }
};

// Manual "Complete Ride" button handler — driver can end navigation early
window.completeRideManually = async function(bookingId, rideId, passengerId, driverId) {
    if (!confirm('Are you sure you want to complete this ride?')) return;

    // Stop the simulation
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }

    // Run the completion callback if wired up
    if (typeof window._pendingCompleteCallback === 'function') {
        try {
            await window._pendingCompleteCallback();
            window._pendingCompleteCallback = null;
        } catch (e) {
            console.error('Error completing ride:', e);
            showToast('Error completing ride. Please try again.', 'error');
        }
    } else {
        // Fallback: directly update Firestore
        try {
            await db.collection('bookings').doc(bookingId).update({
                status: 'COMPLETED',
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('rides').doc(rideId).update({
                status: 'COMPLETED',
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const batch = db.batch();
            if (driverId) batch.update(db.collection('users').doc(driverId), { ridesCompleted: firebase.firestore.FieldValue.increment(1) });
            if (passengerId) batch.update(db.collection('users').doc(passengerId), { ridesCompleted: firebase.firestore.FieldValue.increment(1) });
            await batch.commit();
            showToast('Ride completed! 🏁', 'success');
            setTimeout(() => { window.location.reload(); }, 2000);
        } catch (e) {
            console.error('Error manually completing ride:', e);
            showToast('Error completing ride.', 'error');
        }
    }
};

function drawRoute(origin, destination) {
    if (isGoogleMapsAvailable()) {
        drawRouteGoogle(origin, destination);
    } else {
        drawRouteLeaflet(origin, destination);
    }
}

function drawRouteGoogle(origin, destination) {
    if (!directionsService || !googleMap) return;

    directionsService.route(
        {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING
        },
        (response, status) => {
            if (status === 'OK') {
                directionsRenderer.setDirections(response);
                
                const leg = response.routes[0].legs[0];
                const durationText = leg.duration.text;
                const distanceText = leg.distance.text;
                const etaElement = document.getElementById('etaTime');
                if (etaElement) {
                    etaElement.innerHTML = `<strong>ETA:</strong> ${durationText} (${distanceText})`;
                }

                if (!simulationInterval) {
                    simulationPath = [];
                    leg.steps.forEach(step => {
                        step.path.forEach(latLng => {
                            simulationPath.push({
                                lat: latLng.lat(),
                                lng: latLng.lng()
                            });
                        });
                    });
                    simulationIndex = 0;
                }
            } else {
                console.error('Directions request failed due to ' + status);
            }
        }
    );
}

async function drawRouteLeaflet(origin, destination) {
    if (!leafletMap) return;

    // Remove previous route layers
    if (leafletRoutePolyline) {
        if (Array.isArray(leafletRoutePolyline)) {
            leafletRoutePolyline.forEach(l => l.remove());
        } else {
            leafletRoutePolyline.remove();
        }
        leafletRoutePolyline = null;
    }

    // Show a loading spinner in ETA
    const etaElement = document.getElementById('etaTime');
    if (etaElement) etaElement.innerHTML = '<span style="color:#999;">📡 Fetching road route...</span>';

    try {
        // OSRM public API — full road-following geometry with step details
        const url = `https://router.project-osrm.org/route/v1/driving/` +
            `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
            `?geometries=geojson&overview=full&steps=true&annotations=false`;

        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('OSRM HTTP ' + response.status);
        const data = await response.json();

        if (!data.routes || data.routes.length === 0) throw new Error('No routes returned');

        const route = data.routes[0];
        const coords = route.geometry.coordinates; // [lng, lat] pairs

        // Build the road-following simulation path
        if (!simulationInterval) {
            simulationPath = coords.map(c => ({ lat: c[1], lng: c[0] }));
            simulationIndex = 0;
        }

        const latlngs = coords.map(c => [c[1], c[0]]);

        // Draw route — shadow line + main line for premium depth effect
        const shadowLine = L.polyline(latlngs, {
            color: 'rgba(0,0,0,0.18)',
            weight: 9,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(leafletMap);

        const mainLine = L.polyline(latlngs, {
            color: '#d97757',    // Anthropic terracotta
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(leafletMap);

        // Store both layers so we can remove them together
        leafletRoutePolyline = [shadowLine, mainLine];

        leafletMap.fitBounds(mainLine.getBounds(), { padding: [48, 48] });

        // ETA from OSRM
        const durationMin = Math.round(route.duration / 60);
        const distanceKm  = (route.distance / 1000).toFixed(1);
        if (etaElement) {
            etaElement.innerHTML =
                `<span style="color:#d97757;">🛣️</span> <strong>ETA:</strong> ${durationMin} min &nbsp;·&nbsp; ${distanceKm} km`;
        }

        // Add turn-by-turn step markers
        if (route.legs && route.legs[0] && route.legs[0].steps) {
            route.legs[0].steps.forEach((step, i) => {
                if (i === 0 || i === route.legs[0].steps.length - 1) return; // skip start/end
                const loc = step.maneuver.location; // [lng, lat]
                if (!loc) return;
                const turnIcon = L.divIcon({
                    html: `<div style="width:8px;height:8px;background:#fff;border:2.5px solid #d97757;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
                    className: '', iconSize: [8, 8], iconAnchor: [4, 4]
                });
                L.marker([loc[1], loc[0]], { icon: turnIcon }).addTo(leafletMap);
            });
        }

    } catch (e) {
        console.error('OSRM route failed, using linear fallback:', e);

        // Linear fallback (50 points for smoother animation)
        if (!simulationInterval) {
            simulationPath = [];
            for (let i = 0; i <= 50; i++) {
                const t = i / 50;
                simulationPath.push({
                    lat: origin.lat + t * (destination.lat - origin.lat),
                    lng: origin.lng + t * (destination.lng - origin.lng)
                });
            }
            simulationIndex = 0;
        }

        const latlngs = simulationPath.map(p => [p.lat, p.lng]);
        leafletRoutePolyline = L.polyline(latlngs, {
            color: '#d97757', weight: 5, opacity: 0.85,
            lineCap: 'round', lineJoin: 'round', dashArray: '8 6'
        }).addTo(leafletMap);
        leafletMap.fitBounds(leafletRoutePolyline.getBounds(), { padding: [48, 48] });

        if (etaElement) {
            etaElement.innerHTML = '<span style="color:#999;">⚠️ Route estimate (offline)</span>';
        }
    }
}

// Run simulation step-by-step along the OSRM road path
function runSimulation(bookingId, start, end, nextStatus, onCompleteCallback) {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }

    // If OSRM path not yet ready, build a temporary linear path and wait
    if (simulationPath.length === 0) {
        for (let i = 0; i <= 50; i++) {
            const t = i / 50;
            simulationPath.push({
                lat: start.lat + t * (end.lat - start.lat),
                lng: start.lng + t * (end.lng - start.lng)
            });
        }
    }

    simulationIndex = 0;

    // Update driver marker icon to a car emoji for better visual
    if (!isGoogleMapsAvailable() && leafletMap && leafletDriverMarker) {
        const carIcon = L.divIcon({
            html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));">🚗</div>`,
            className: '', iconSize: [26, 26], iconAnchor: [13, 13]
        });
        leafletDriverMarker.setIcon(carIcon);
    }

    simulationInterval = setInterval(async () => {
        if (simulationIndex >= simulationPath.length) {
            clearInterval(simulationInterval);
            simulationInterval = null;
            if (onCompleteCallback) onCompleteCallback();
            return;
        }

        const currentPos = simulationPath[simulationIndex];
        const nextPos = simulationPath[Math.min(simulationIndex + simulationSpeedMultiplier, simulationPath.length - 1)];

        if (isGoogleMapsAvailable()) {
            if (driverMarker) {
                driverMarker.setPosition(currentPos);
                if (googleMap) googleMap.panTo(currentPos);
            }
        } else {
            if (leafletDriverMarker && leafletMap) {
                leafletDriverMarker.setLatLng([currentPos.lat, currentPos.lng]);
                // Smoothly pan keeping driver in lower-center of view
                leafletMap.panTo([currentPos.lat + 0.0008, currentPos.lng], { animate: true, duration: 0.9 });
            }
        }

        // Update ETA countdown
        const remaining = simulationPath.length - simulationIndex;
        const totalSteps = simulationPath.length;
        const etaEl = document.getElementById('etaTime');
        if (etaEl && totalSteps > 0) {
            const progressPct = Math.round((1 - remaining / totalSteps) * 100);
            const etaMinutes = Math.max(1, Math.round(remaining / (simulationSpeedMultiplier * 60 / 1)));
            etaEl.innerHTML = `<span style="color:#d97757;">🛣️</span> <strong>${progressPct}% complete</strong> &nbsp;·&nbsp; ~${etaMinutes} min remaining`;
        }

        try {
            await db.collection('bookings').doc(bookingId).update({
                driverLocation: currentPos
            });
        } catch (e) {
            // Silent fail — don't interrupt UI
        }

        simulationIndex += simulationSpeedMultiplier;
    }, 1000);
}

// Self-invoking function to load Google Maps dynamically if API key is present
(function loadGoogleMapsScript() {
    const key = window.GOOGLE_MAPS_API_KEY;
    if (key && key.trim() !== "") {
        console.log("Loading Google Maps dynamically...");
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,geometry&callback=initGoogleMapsAutocomplete`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    } else {
        console.log("No Google Maps API key provided. Using Leaflet fallback.");
        // Initialize custom autocomplete when DOM is ready or immediately
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCustomAutocomplete);
        } else {
            setTimeout(initCustomAutocomplete, 100);
        }
    }
})();
