let currentUser = null;
let currentUserData = null;
let userRole = 'student';

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        initDashboard();
    } else {
        window.location.href = 'index.html';
    }
});

async function loadUserData() {
    console.log("loadUserData called. uid:", currentUser ? currentUser.uid : null);
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        console.log("User doc exists:", doc.exists);
        if (doc.exists) {
            currentUserData = doc.data();
            console.log("User data:", currentUserData);
            userRole = currentUserData.role || 'student';
            
            if (userRole === 'admin') {
                window.location.href = 'admin.html';
                return;
            }
            
            updateGreeting();
            loadProfile();
        } else {
            console.warn("User doc does NOT exist for uid:", currentUser.uid);
            userRole = 'student';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        userRole = 'student';
    } finally {
        buildSidebarForRole();
        setupRoleBadge();
    }
}

function updateGreeting() {
    const greeting = document.getElementById('userGreeting');
    if (greeting && currentUserData) {
        greeting.textContent = `Welcome, ${currentUserData.name}!`;
    }
}

function setupRoleBadge() {
    const badge = document.getElementById('userRoleBadge');
    if (badge) {
        badge.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        badge.className = `role-badge ${userRole}`;
    }
}

function buildSidebarForRole() {
    const sidebarMenu = document.getElementById('sidebarMenu');
    if (!sidebarMenu) return;
    
    sidebarMenu.innerHTML = '';
    
    const menuItems = [
        { icon: '🏠', text: 'Home', section: 'home', roles: ['all'] },
        { icon: '🔍', text: 'Search Rides', section: 'search', roles: ['student'] },
        { icon: '➕', text: 'Post a Ride', section: 'post', roles: ['student', 'driver'] },
        { icon: '📋', text: 'My Rides', section: 'myrides', roles: ['all'] },
        { icon: '👤', text: 'Profile', section: 'profile', roles: ['all'] }
    ];
    
    menuItems.forEach(item => {
        if (item.roles.includes('all') || item.roles.includes(userRole)) {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'sidebar-item';
            link.dataset.section = item.section;
            if (item.section === 'home') link.classList.add('active');
            link.innerHTML = `<span>${item.icon}</span> ${item.text}`;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (item.section === 'chatbot') {
                    if (typeof openChatPopup === 'function') {
                        openChatPopup();
                    } else if (typeof toggleChatPopup === 'function') {
                        toggleChatPopup();
                    } else {
                        window.location.href = 'dashboard.html?chat=open';
                    }
                } else {
                    switchSection(item.section);
                }
            });
            sidebarMenu.appendChild(link);
        }
    });
}

function initDashboard() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                window.location.href = 'index.html';
            } catch (error) {
                showToast('Error logging out', 'error');
            }
        });
    }

    if (userRole === 'student') {
        const searchRidesBtn = document.getElementById('searchRidesBtn');
        if (searchRidesBtn) {
            searchRidesBtn.addEventListener('click', () => {
                const destination = document.getElementById('searchDestination').value;
                const date = document.getElementById('searchDate').value;
                
                if (destination && date) {
                    searchRides(destination, date);
                } else {
                    showToast('Please enter destination and date', 'error');
                }
            });
        }
    }

    const postRideForm = document.getElementById('postRideForm');
    if (postRideForm) {
        const seatsInput = document.getElementById('rideSeats');
        const fareInput = document.getElementById('rideFare');
        const farePreview = document.getElementById('farePreview');

        // fare calculations
        const updateFare = () => {
            const seats = parseInt(seatsInput.value) || 0;
            const fare = parseFloat(fareInput.value) || 0;
            
            if (seats > 0 && fare > 0) {
                const totalPeople = seats + 1; // +1 for the person posting (driver/student)
                const perPerson = fare / totalPeople;
                
                farePreview.innerHTML = `
                    <strong>Cost per person: ₹${perPerson.toFixed(2)}</strong><br>
                    <small style="color: #666; font-size: 0.9rem;">
                        ₹${fare} ÷ ${totalPeople} people (${seats} passengers + you) = ₹${perPerson.toFixed(2)} each
                    </small>
                `;
            } else {
                farePreview.innerHTML = '<strong>Cost per person:</strong> ₹0';
            }
        };

        seatsInput.addEventListener('input', updateFare);
        fareInput.addEventListener('input', updateFare);

        postRideForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await postRide();
        });
    }

    buildMyRidesTabs();
    loadStats();
    loadRecentContent();
    loadMyBookings();
    loadDriverRides();
    
    // Initialize Google Maps and active ride monitoring
    setTimeout(() => {
        if (typeof initLiveTrackingMap === 'function') {
            initLiveTrackingMap('liveMap');
            renderNearbyCabs(DEFAULT_CENTER);
            startActiveRideMonitoring();
        }
    }, 1000);
}

// completed option
function buildMyRidesTabs() {
    const tabsContainer = document.getElementById('myRidesTabs');
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    
    if (userRole === 'student') {
        const bookingsTab = document.createElement('button');
        bookingsTab.className = 'tab-btn active';
        bookingsTab.dataset.tab = 'bookings';
        bookingsTab.textContent = 'My Bookings';
        bookingsTab.addEventListener('click', () => switchTab('bookings'));
        
        const driverTab = document.createElement('button');
        driverTab.className = 'tab-btn';
        driverTab.dataset.tab = 'driver';
        driverTab.textContent = 'My Posted Rides (As Driver)';
        driverTab.addEventListener('click', () => switchTab('driver'));
        
        const completedTab = document.createElement('button');
        completedTab.className = 'tab-btn';
        completedTab.dataset.tab = 'completed';
        completedTab.textContent = '✓ Completed';
        completedTab.addEventListener('click', () => switchTab('completed'));
        
        tabsContainer.appendChild(bookingsTab);
        tabsContainer.appendChild(driverTab);
        tabsContainer.appendChild(completedTab);
        
        document.getElementById('bookingsTab').classList.add('active');
    } else if (userRole === 'driver') {
        const driverTab = document.createElement('button');
        driverTab.className = 'tab-btn active';
        driverTab.dataset.tab = 'driver';
        driverTab.textContent = 'My Posted Rides & Requests';
        driverTab.addEventListener('click', () => switchTab('driver'));
        
        const completedTab = document.createElement('button');
        completedTab.className = 'tab-btn';
        completedTab.dataset.tab = 'completed';
        completedTab.textContent = '✓ Completed';
        completedTab.addEventListener('click', () => switchTab('completed'));
        
        tabsContainer.appendChild(driverTab);
        tabsContainer.appendChild(completedTab);
        
        document.getElementById('driverTab').classList.add('active');
    }
}

function switchSection(section) {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === section) {
            item.classList.add('active');
        }
    });

    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(`${section}Section`).classList.add('active');

    if (section === 'myrides') {
        loadMyBookings();
        loadDriverRides();
    } else if (section === 'profile') {
        loadProfile();
    } else if (section === 'home') {
        loadStats();
        loadRecentContent();
        if (typeof leafletMap !== 'undefined' && leafletMap) {
            setTimeout(() => {
                leafletMap.invalidateSize();
            }, 100);
        }
    }
}

// switch tabs using completed
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tab === 'completed') {
        loadCompletedRides();
        let completedTab = document.getElementById('completedTab');
        if (!completedTab) {
            completedTab = document.createElement('div');
            completedTab.id = 'completedTab';
            completedTab.className = 'tab-content';
            document.getElementById('myridesSection').appendChild(completedTab);
        }
        completedTab.classList.add('active');
    } else {
        if (tab === 'driver') {
            loadDriverRides();
        } else if (tab === 'bookings') {
            loadMyBookings();
        }
        document.getElementById(`${tab}Tab`).classList.add('active');
    }
}

async function loadStats() {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    
    statColorIndex = 0; // reset color rotation on each load
    statsGrid.innerHTML = '';
    
    try {
        if (userRole === 'student') {
            const ridesSnapshot = await db.collection('rides')
                .where('status', '==', 'ACTIVE')
                .where('driverId', '!=', currentUser.uid)
                .get();
            
            const oneHourAgo = new Date(Date.now() - 3600000);

            const activeCount = ridesSnapshot.docs.filter(doc => {
                const ride = doc.data();
                const rideDateTime = parseRideDateTime(ride);
                return rideDateTime >= oneHourAgo;
            }).length;

            const stat1 = createStatCard('Available Rides', activeCount, '🔍');
            statsGrid.appendChild(stat1);

            const bookingsSnapshot = await db.collection('bookings')
                .where('passengerId', '==', currentUser.uid)
                .get();
            
            const stat2 = createStatCard('My Bookings', bookingsSnapshot.size, '📋');
            statsGrid.appendChild(stat2);

            const myRidesSnapshot = await db.collection('rides')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'ACTIVE')
                .get();
            
            const activeMyRidesCount = myRidesSnapshot.docs.filter(doc => {
                const ride = doc.data();
                const rideDateTime = parseRideDateTime(ride);
                return rideDateTime >= oneHourAgo;
            }).length;
            
            const stat3 = createStatCard('Rides Posted', activeMyRidesCount, '🚗');
            statsGrid.appendChild(stat3);
            
        } else if (userRole === 'driver') {
            const myRidesSnapshot = await db.collection('rides')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'ACTIVE')
                .get();
            
            const oneHourAgo = new Date(Date.now() - 3600000);
            const activeCount = myRidesSnapshot.docs.filter(doc => {
                const ride = doc.data();
                const rideDateTime = parseRideDateTime(ride);
                return rideDateTime >= oneHourAgo;
            }).length;
            
            const stat1 = createStatCard('My Rides', activeCount, '🚗');
            statsGrid.appendChild(stat1);

            const pendingSnapshot = await db.collection('bookings')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'REQUESTED')
                .get();
            
            const stat2 = createStatCard('Pending Requests', pendingSnapshot.size, '⏳');
            statsGrid.appendChild(stat2);

            const acceptedSnapshot = await db.collection('bookings')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'ACCEPTED')
                .get();
            
            const stat3 = createStatCard('Confirmed', acceptedSnapshot.size, '✅');
            statsGrid.appendChild(stat3);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

const STAT_COLORS = ['stat-primary', 'stat-success', 'stat-info', 'stat-warning'];
let statColorIndex = 0;

function createStatCard(title, value, icon) {
    const card = document.createElement('div');
    const colorClass = STAT_COLORS[statColorIndex % STAT_COLORS.length];
    statColorIndex++;
    card.className = `stat-card ${colorClass}`;
    card.innerHTML = `
        <div class="stat-icon-pill">${icon}</div>
        <h4>${title}</h4>
        <p class="stat-number">${value}</p>
        <small>Updated just now</small>
    `;
    return card;
}

async function loadRecentContent() {
    const container = document.getElementById('recentContent');
    const title = document.getElementById('recentTitle');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading...</div>';
    
    if (title) {
        title.textContent = userRole === 'student' ? 'Recent Rides' : 'Recent Requests';
    }

    try {
        if (userRole === 'student') {
            const snapshot = await db.collection('rides')
                .where('status', '==', 'ACTIVE')
                .get();

            const now = new Date();

            let rides = snapshot.docs.map(doc => doc.data())
                .filter(ride => {
                    if (ride.driverId === currentUser.uid) return false;
                    const rideDateTime = parseRideDateTime(ride);
                    return rideDateTime >= now;
                });
            
            rides.sort((a, b) => {
                const aTime = a.dateTime ? (a.dateTime.seconds || 0) : 0;
                const bTime = b.dateTime ? (b.dateTime.seconds || 0) : 0;
                return bTime - aTime;
            });

            rides = rides.slice(0, 3);

            if (rides.length === 0) {
                container.innerHTML = '<div class="empty-state">No rides available</div>';
                return;
            }

            container.innerHTML = '';
            rides.forEach(ride => {
                container.appendChild(createRideCard(ride, true));
            });
        } else if (userRole === 'driver') {
            const snapshot = await db.collection('bookings')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'REQUESTED')
                .get();

            let bookings = snapshot.docs.map(doc => doc.data());
            bookings.sort((a, b) => {
                const aTime = a.requestedAt ? (a.requestedAt.seconds || 0) : 0;
                const bTime = b.requestedAt ? (b.requestedAt.seconds || 0) : 0;
                return bTime - aTime;
            });

            bookings = bookings.slice(0, 3);

            if (bookings.length === 0) {
                // Check if driver has active posted rides to display
                const myRidesSnap = await db.collection('rides')
                    .where('driverId', '==', currentUser.uid)
                    .where('status', '==', 'ACTIVE')
                    .get();

                if (!myRidesSnap.empty) {
                    if (title) title.textContent = 'My Active Posted Rides';
                    container.innerHTML = '';
                    myRidesSnap.docs.slice(0, 3).forEach(doc => {
                        container.appendChild(createPostedRideCard(doc.data()));
                    });
                    return;
                }

                container.innerHTML = '<div class="empty-state">No pending requests or active rides</div>';
                return;
            }

            container.innerHTML = '';
            for (const booking of bookings) {
                const rideDoc = await db.collection('rides').doc(booking.rideId).get();
                if (rideDoc.exists) {
                    const ride = rideDoc.data();
                    container.appendChild(createBookingCard(booking, ride, true));
                }
            }
        }
    } catch (error) {
        console.error('Error loading recent content:', error);
        container.innerHTML = '<div class="empty-state">Error loading content</div>';
    }
}

async function searchRides(destination, date) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '<div class="loading">Searching rides...</div>';

    try {
        let query = db.collection('rides').where('status', '==', 'ACTIVE');
        if (date) {
            query = query.where('date', '==', date);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            const destLabel = destination ? ` for "${destination}"` : '';
            const dateLabel = date ? ` on ${formatDate(date)}` : '';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>No active rides found${destLabel}${dateLabel}</p>
                    <small style="color:var(--tx3);margin-top:0.4rem;display:block;">Try searching another landmark or post your own ride!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        const now = new Date();
        const searchDestClean = (destination || '').trim().toLowerCase();
        let count = 0;

        snapshot.forEach(doc => {
            const ride = doc.data();
            // Do not show user's own ride to book
            if (ride.driverId !== currentUser.uid) {
                const rideDateTime = parseRideDateTime(ride);
                if (rideDateTime >= now) {
                    const toClean = (ride.to || '').toLowerCase();
                    const fromClean = (ride.from || '').toLowerCase();
                    // Match destination partially in 'to' or 'from'
                    const matchesDest = !searchDestClean || toClean.includes(searchDestClean) || fromClean.includes(searchDestClean);
                    if (matchesDest) {
                        container.appendChild(createRideCard(ride, true));
                        count++;
                    }
                }
            }
        });

        if (count === 0) {
            const destLabel = destination ? ` for "${destination}"` : '';
            const dateLabel = date ? ` on ${formatDate(date)}` : '';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>No matching rides found${destLabel}${dateLabel}</p>
                    <small style="color:var(--tx3);margin-top:0.4rem;display:block;">Try searching for popular hotspots like "MUJ", "Airport", "Station", or "Civil Lines".</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error searching rides:', error);
        showToast('Error searching rides', 'error');
    }
}

function createRideCard(ride, showBookButton = true) {
    const card = document.createElement('div');
    card.className = 'ride-card';

    const canBook = ride.seatsAvailable > 0 && showBookButton && userRole === 'student';

    card.innerHTML = `
        <div class="ride-header">
            <div class="ride-route">${ride.from} → ${ride.to}</div>
            <div class="ride-price">₹${ride.farePerPerson.toFixed(0)}</div>
        </div>
        <div class="ride-info">
            <div class="ride-info-item">
                <strong>Date:</strong> ${ride.date}
            </div>
            <div class="ride-info-item">
                <strong>Time:</strong> ${ride.time}
            </div>
            <div class="ride-info-item">
                <strong>Driver:</strong> ${ride.driverName}
            </div>
            <div class="ride-info-item">
                <strong>Rating:</strong> ⭐ ${ride.driverRating.toFixed(1)}
            </div>
            <div class="ride-info-item">
                <strong>Seats:</strong> ${ride.seatsAvailable} available
            </div>
            ${ride.vehicleInfo ? `
            <div class="ride-info-item">
                <strong>Vehicle:</strong> ${ride.vehicleInfo}
            </div>
            ` : ''}
        </div>
        ${canBook ? `
        <div class="ride-actions">
            <button class="btn-primary" onclick="requestSeat('${ride.id}', '${ride.driverName}', ${ride.farePerPerson})">
                Request Seat
            </button>
        </div>
        ` : ''}
    `;

    return card;
}

window.requestSeat = async function(rideId, driverName, fareShare) {
    console.log("requestSeat called:", { rideId, driverName, fareShare, uid: currentUser ? currentUser.uid : null });
    if (!confirm(`Request a seat on this ride?\nDriver: ${driverName}\nCost: ₹${fareShare.toFixed(0)}`)) {
        console.log("requestSeat confirm cancelled by user");
        return;
    }

    try {
        console.log("Querying existing bookings for student:", currentUser.uid, "ride:", rideId);
        const existing = await db.collection('bookings')
            .where('rideId', '==', rideId)
            .where('passengerId', '==', currentUser.uid)
            .get();

        console.log("Existing bookings query result empty:", existing.empty);
        if (!existing.empty) {
            const activeBooking = existing.docs.find(doc => {
                const status = doc.data().status;
                return ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(status);
            });
            if (activeBooking) {
                console.warn("Active booking already exists:", activeBooking.id, activeBooking.data());
                showToast('You already have an active booking for this ride', 'error');
                return;
            }
        }

        console.log("Fetching ride details:", rideId);
        const rideDoc = await db.collection('rides').doc(rideId).get();
        const ride = rideDoc.data();
        console.log("Ride details fetched:", ride);

        const bookingRef = db.collection('bookings').doc();
        console.log("Writing new booking document with ID:", bookingRef.id);
        await bookingRef.set({
            id: bookingRef.id,
            rideId: rideId,
            passengerId: currentUser.uid,
            passengerName: currentUserData.name,
            driverId: ride.driverId,
            status: 'REQUESTED',
            fareShare: fareShare,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Booking document written successfully!");

        showToast('Seat requested! Wait for driver to accept', 'success');
        loadMyBookings();
    } catch (error) {
        console.error('Error requesting seat:', error.message, error);
        showToast('Error requesting seat', 'error');
    }
};

async function postRide() {
    const fromInput = document.getElementById('rideFrom');
    const toInput = document.getElementById('rideTo');
    const from = fromInput.value;
    const to = toInput.value;
    const date = document.getElementById('rideDate').value;
    const time = document.getElementById('rideTime').value;
    const seats = parseInt(document.getElementById('rideSeats').value);
    const fare = parseFloat(document.getElementById('rideFare').value);
    const vehicle = document.getElementById('rideVehicle').value;

    const fromLat = fromInput.dataset.lat ? parseFloat(fromInput.dataset.lat) : DEFAULT_CENTER.lat;
    const fromLng = fromInput.dataset.lng ? parseFloat(fromInput.dataset.lng) : DEFAULT_CENTER.lng;
    const toLat = toInput.dataset.lat ? parseFloat(toInput.dataset.lat) : DEFAULT_CENTER.lat;
    const toLng = toInput.dataset.lng ? parseFloat(toInput.dataset.lng) : DEFAULT_CENTER.lng;

    try {
        const rideRef = db.collection('rides').doc();
        const farePerPerson = fare / (seats + 1); // ⭐ Correct calculation: includes poster

        await rideRef.set({
            id: rideRef.id,
            driverId: currentUser.uid,
            driverName: (currentUserData && currentUserData.name) ? currentUserData.name : (currentUser.displayName || 'User'),
            from: from,
            to: to,
            fromLatLng: { lat: fromLat, lng: fromLng },
            toLatLng: { lat: toLat, lng: toLng },
            date: date,
            time: time,
            dateTime: firebase.firestore.Timestamp.fromDate(parseRideDateTime({ date: date, time: time })),
            seatsTotal: seats,
            seatsAvailable: seats,
            totalFare: fare,
            farePerPerson: farePerPerson,
            status: 'ACTIVE',
            vehicleInfo: vehicle || (currentUserData && currentUserData.vehicleInfo) || '',
            driverRating: (currentUserData && currentUserData.rating) ? currentUserData.rating : 5.0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // ⭐ Increment ridesPosted on user document
        try {
            await db.collection('users').doc(currentUser.uid).set({
                ridesPosted: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });
            if (currentUserData) {
                currentUserData.ridesPosted = (currentUserData.ridesPosted || 0) + 1;
            }
        } catch (uErr) {
            console.warn('Could not update user ridesPosted field:', uErr);
        }

        showToast('Ride posted successfully! View it in My Rides or Profile.', 'success');
        document.getElementById('postRideForm').reset();
        document.getElementById('farePreview').innerHTML = '<strong>Cost per person:</strong> ₹0';

        // ⭐ Refresh all dashboard views immediately
        loadStats();
        loadDriverRides();
        loadProfile();
        loadRecentContent();
        if (typeof window.renderActiveRidesOnMap === 'function') {
            window.renderActiveRidesOnMap();
        }
    } catch (error) {
        console.error('Error posting ride:', error);
        showToast('Error posting ride', 'error');
    }
}

function createPostedRideCard(ride) {
    const card = document.createElement('div');
    card.className = 'ride-card';
    const isCompleted = ride.status === 'COMPLETED';
    const isCancelled = ride.status === 'CANCELLED';
    const statusBadgeClass = isCompleted ? 'status-completed' : (isCancelled ? 'status-cancelled' : 'status-accepted');
    const statusText = ride.status || 'ACTIVE';

    card.innerHTML = `
        <div class="ride-header">
            <div class="ride-route">${ride.from} → ${ride.to}</div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <span class="booking-status ${statusBadgeClass}">${statusText}</span>
                <div class="ride-price">₹${(ride.farePerPerson || 0).toFixed(0)}<span style="font-size:0.75rem;font-weight:normal;color:var(--tx2)">/seat</span></div>
            </div>
        </div>
        <div class="ride-info">
            <div class="ride-info-item">
                <strong>Date & Time:</strong> ${ride.date} at ${ride.time}
            </div>
            <div class="ride-info-item">
                <strong>Seats:</strong> ${ride.seatsAvailable} of ${ride.seatsTotal} available
            </div>
            <div class="ride-info-item">
                <strong>Total Fare:</strong> ₹${ride.totalFare || 0}
            </div>
            ${ride.vehicleInfo ? `
            <div class="ride-info-item">
                <strong>Vehicle:</strong> ${ride.vehicleInfo}
            </div>` : ''}
        </div>
        ${ride.status === 'ACTIVE' ? `
        <div class="ride-actions" style="margin-top: 1rem;">
            <button class="btn-secondary btn-sm" onclick="cancelPostedRide('${ride.id}')" style="color: #e53935; border-color: #ffcdd2;">
                Cancel Ride
            </button>
        </div>` : ''}
    `;
    return card;
}

window.cancelPostedRide = async function(rideId) {
    if (!confirm('Are you sure you want to cancel this posted ride?')) return;
    try {
        await db.collection('rides').doc(rideId).update({
            status: 'CANCELLED',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Ride cancelled', 'info');
        loadProfile();
        loadDriverRides();
        loadStats();
        if (typeof window.renderActiveRidesOnMap === 'function') {
            window.renderActiveRidesOnMap();
        }
    } catch (err) {
        console.error('Error cancelling ride:', err);
        showToast('Error cancelling ride', 'error');
    }
};

async function loadMyBookings() {
    const container = document.getElementById('myBookingsList');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading your bookings...</div>';

    try {
        const bookingsSnapshot = await db.collection('bookings')
            .where('passengerId', '==', currentUser.uid)
            .get();

        if (bookingsSnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎫</div>
                    <p>No ride bookings yet</p>
                    <small style="color:var(--tx3);margin-top:0.4rem;display:block;">Search for rides to book seats with verified peers!</small>
                </div>
            `;
            return;
        }

        let bookings = bookingsSnapshot.docs.map(doc => doc.data());
        bookings.sort((a, b) => {
            const aTime = a.requestedAt ? (a.requestedAt.seconds || 0) : 0;
            const bTime = b.requestedAt ? (b.requestedAt.seconds || 0) : 0;
            return bTime - aTime;
        });

        // Show active requests and bookings (exclude completed/cancelled in this tab)
        const activeBookings = bookings.filter(b => b.status !== 'COMPLETED');

        if (activeBookings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎫</div>
                    <p>No active bookings</p>
                    <small style="color:var(--tx3);margin-top:0.4rem;display:block;">View your completed rides in the <strong>✓ Completed</strong> tab.</small>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        for (const booking of activeBookings) {
            try {
                const rideDoc = await db.collection('rides').doc(booking.rideId).get();
                if (rideDoc.exists) {
                    const ride = rideDoc.data();
                    container.appendChild(createBookingCard(booking, ride, false));
                }
            } catch (err) {
                console.warn('Error fetching ride for booking:', booking.id, err);
            }
        }
    } catch (error) {
        console.error('Error loading my bookings:', error);
        container.innerHTML = '<div class="empty-state">Error loading bookings</div>';
    }
}

async function loadDriverRides() {
    const container = document.getElementById('driverRidesList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading your rides and requests...</div>';

    try {
        // 1. Fetch active rides posted by current user
        const ridesSnapshot = await db.collection('rides')
            .where('driverId', '==', currentUser.uid)
            .get();

        let myRides = ridesSnapshot.docs.map(doc => doc.data());
        myRides.sort((a, b) => {
            const aTime = a.createdAt ? (a.createdAt.seconds || 0) : 0;
            const bTime = b.createdAt ? (b.createdAt.seconds || 0) : 0;
            return bTime - aTime;
        });

        const activeRides = myRides.filter(r => r.status === 'ACTIVE');

        // 2. Fetch booking requests for current user's rides
        const bookingsSnapshot = await db.collection('bookings')
            .where('driverId', '==', currentUser.uid)
            .get();

        let bookings = bookingsSnapshot.docs.map(doc => doc.data());
        bookings.sort((a, b) => {
            const aTime = a.requestedAt ? (a.requestedAt.seconds || 0) : 0;
            const bTime = b.requestedAt ? (b.requestedAt.seconds || 0) : 0;
            return bTime - aTime;
        });

        const activeBookings = bookings.filter(b => b.status !== 'COMPLETED');

        if (activeRides.length === 0 && activeBookings.length === 0) {
            container.innerHTML = '<div class="empty-state">No rides posted or booking requests yet.<br><small style="color:var(--tx3);margin-top:0.5rem;display:block;">Go to <strong>Post a Ride</strong> to offer a ride to fellow students!</small></div>';
            return;
        }

        container.innerHTML = '';

        // Section for Posted Rides
        const postedSection = document.createElement('div');
        postedSection.className = 'driver-rides-section';
        postedSection.style.marginBottom = '2rem';
        postedSection.innerHTML = `<h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">🚗 Active Rides Offered <span class="role-badge" style="background:var(--brand-light);color:var(--brand);font-size:0.8rem;padding:0.2rem 0.6rem;">${activeRides.length}</span></h3>`;

        if (activeRides.length === 0) {
            postedSection.innerHTML += '<div class="empty-state" style="padding:1.5rem;">No active posted rides currently.</div>';
        } else {
            const ridesGrid = document.createElement('div');
            ridesGrid.style.display = 'grid';
            ridesGrid.style.gap = '1rem';
            activeRides.forEach(ride => {
                ridesGrid.appendChild(createPostedRideCard(ride));
            });
            postedSection.appendChild(ridesGrid);
        }
        container.appendChild(postedSection);

        // Section for Booking Requests
        const requestsSection = document.createElement('div');
        requestsSection.className = 'driver-requests-section';
        requestsSection.innerHTML = `<h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">📩 Booking Requests Received <span class="role-badge" style="background:var(--brand-light);color:var(--brand);font-size:0.8rem;padding:0.2rem 0.6rem;">${activeBookings.length}</span></h3>`;

        if (activeBookings.length === 0) {
            requestsSection.innerHTML += '<div class="empty-state" style="padding:1.5rem;">No booking requests received yet.</div>';
        } else {
            for (const booking of activeBookings) {
                const rideDoc = await db.collection('rides').doc(booking.rideId).get();
                if (rideDoc.exists) {
                    const ride = rideDoc.data();
                    requestsSection.appendChild(createBookingCard(booking, ride, true));
                }
            }
        }
        container.appendChild(requestsSection);

    } catch (error) {
        console.error('Error loading driver rides:', error);
        container.innerHTML = '<div class="empty-state">Error loading rides and requests</div>';
    }
}

// booking card with complete button
function createBookingCard(booking, ride, isDriver) {
    const card = document.createElement('div');
    card.className = 'booking-card';

    const statusClass = `status-${booking.status.toLowerCase()}`;
    
    // Check if ride date/time has passed (for complete button)
    const rideDateTime = parseRideDateTime(ride);
    const now = new Date();
    const isPastRide = rideDateTime < now;

    card.innerHTML = `
        <span class="booking-status ${statusClass}">${booking.status}</span>
        ${ride.status === 'COMPLETED' ? '<span class="booking-status status-completed">✓ RIDE COMPLETED</span>' : ''}
        <div class="ride-route">${ride.from} → ${ride.to}</div>
        <div class="ride-info">
            <div class="ride-info-item">
                <strong>Date:</strong> ${ride.date} at ${ride.time}
            </div>
            <div class="ride-info-item">
                <strong>${isDriver ? 'Passenger' : 'Driver'}:</strong> ${isDriver ? booking.passengerName : ride.driverName}
            </div>
            <div class="ride-info-item">
                <strong>Your Share:</strong> ₹${booking.fareShare.toFixed(0)}
            </div>
        </div>
        ${isDriver && booking.status === 'REQUESTED' && ride.status === 'ACTIVE' ? `
        <div class="ride-actions" style="margin-top: 1rem;">
            <button class="btn-primary" onclick="acceptBooking('${booking.id}', '${booking.rideId}')">
                Accept
            </button>
            <button class="btn-secondary" onclick="rejectBooking('${booking.id}')">
                Reject
            </button>
        </div>
        ` : ''}
        ${!isDriver && (booking.status === 'REQUESTED' || booking.status === 'ACCEPTED') && ride.status === 'ACTIVE' ? `
        <div class="ride-actions" style="margin-top: 1rem;">
            <button class="btn-secondary" onclick="cancelBooking('${booking.id}', '${booking.rideId}', '${booking.status}')">
                Cancel Booking
            </button>
        </div>
        ` : ''}
        ${isDriver && booking.status === 'ACCEPTED' && ride.status === 'ACTIVE' && isPastRide ? `
        <div class="ride-actions" style="margin-top: 1rem;">
            <button class="btn-success" onclick="completeRide('${booking.rideId}')">
                ✓ Mark Ride as Completed
            </button>
        </div>
        ` : ''}
    `;

    return card;
}

window.acceptBooking = async function(bookingId, rideId) {
    if (!confirm('Accept this booking request?')) return;

    try {
        await db.collection('bookings').doc(bookingId).update({
            status: 'ACCEPTED',
            respondedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const rideDoc = await db.collection('rides').doc(rideId).get();
        const ride = rideDoc.data();
        await db.collection('rides').doc(rideId).update({
            seatsAvailable: ride.seatsAvailable - 1
        });

        showToast('Booking accepted!', 'success');
        loadDriverRides();
        loadStats();
    } catch (error) {
        console.error('Error accepting booking:', error);
        showToast('Error accepting booking', 'error');
    }
};

window.rejectBooking = async function(bookingId) {
    if (!confirm('Reject this booking request?')) return;

    try {
        await db.collection('bookings').doc(bookingId).update({
            status: 'REJECTED',
            respondedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Booking rejected', 'success');
        loadDriverRides();
    } catch (error) {
        console.error('Error rejecting booking:', error);
        showToast('Error rejecting booking', 'error');
    }
};

window.cancelBooking = async function(bookingId, rideId, currentStatus) {
    if (!confirm('Cancel your booking?')) return;

    try {
        await db.collection('bookings').doc(bookingId).update({
            status: 'CANCELLED'
        });

        if (currentStatus === 'ACCEPTED') {
            const rideDoc = await db.collection('rides').doc(rideId).get();
            const ride = rideDoc.data();
            await db.collection('rides').doc(rideId).update({
                seatsAvailable: ride.seatsAvailable + 1
            });
        }

        showToast('Booking cancelled', 'success');
        loadMyBookings();
        loadStats();
    } catch (error) {
        console.error('Error cancelling booking:', error);
        showToast('Error cancelling booking', 'error');
    }
};

// complete ride function
window.completeRide = async function(rideId) {
    if (!confirm('Mark this ride as completed?\n\nThis will:\n- Update ride status to COMPLETED\n- Update all accepted bookings to COMPLETED\n- Increase rides completed count for you and all passengers')) {
        return;
    }

    try {
        const batch = db.batch();

        // 1. Update ride status
        const rideRef = db.collection('rides').doc(rideId);
        batch.update(rideRef, {
            status: 'COMPLETED',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Get all ACCEPTED bookings
        const bookingsSnapshot = await db.collection('bookings')
            .where('rideId', '==', rideId)
            .where('status', '==', 'ACCEPTED')
            .get();

        // 3. Update all accepted bookings to COMPLETED
        bookingsSnapshot.forEach(doc => {
            batch.update(db.collection('bookings').doc(doc.id), {
                status: 'COMPLETED',
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        // 4. Increment driver's rides completed count
        const driverRef = db.collection('users').doc(currentUser.uid);
        batch.update(driverRef, {
            ridesCompleted: firebase.firestore.FieldValue.increment(1)
        });

        // 5. Increment passengers' rides completed count
        for (const doc of bookingsSnapshot.docs) {
            const booking = doc.data();
            const passengerRef = db.collection('users').doc(booking.passengerId);
            batch.update(passengerRef, {
                ridesCompleted: firebase.firestore.FieldValue.increment(1)
            });
        }

        await batch.commit();

        showToast('✓ Ride marked as completed!', 'success');
        
        loadDriverRides();
        loadMyBookings();
        loadStats();
        loadProfile();

    } catch (error) {
        console.error('Error completing ride:', error);
        showToast('Error: ' + error.message, 'error');
    }
};

// load completed rides
async function loadCompletedRides() {
    let container = document.getElementById('completedTab');
    if (!container) {
        container = document.createElement('div');
        container.id = 'completedTab';
        container.className = 'tab-content';
        document.getElementById('myridesSection').appendChild(container);
    }
    
    container.innerHTML = '<div class="loading">Loading completed rides...</div>';

    try {
        if (userRole === 'student') {
            const snapshot = await db.collection('bookings')
                .where('passengerId', '==', currentUser.uid)
                .where('status', '==', 'COMPLETED')
                .orderBy('completedAt', 'desc')
                .get();

            const driverRidesSnapshot = await db.collection('rides')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'COMPLETED')
                .get();

            if (snapshot.empty && driverRidesSnapshot.empty) {
                container.innerHTML = '<div class="empty-state">No completed rides yet</div>';
                return;
            }

            container.innerHTML = '';
            
            for (const doc of snapshot.docs) {
                const booking = doc.data();
                const rideDoc = await db.collection('rides').doc(booking.rideId).get();
                if (rideDoc.exists) {
                    const ride = rideDoc.data();
                    container.appendChild(createBookingCard(booking, ride, false));
                }
            }

            for (const doc of driverRidesSnapshot.docs) {
                const ride = doc.data();
                container.appendChild(createPostedRideCard(ride));
            }
        } else if (userRole === 'driver') {
            const ridesSnapshot = await db.collection('rides')
                .where('driverId', '==', currentUser.uid)
                .where('status', '==', 'COMPLETED')
                .orderBy('completedAt', 'desc')
                .get();

            if (ridesSnapshot.empty) {
                container.innerHTML = '<div class="empty-state">No completed rides yet</div>';
                return;
            }

            container.innerHTML = '';
            
            for (const doc of ridesSnapshot.docs) {
                const ride = doc.data();
                
                const bookingsSnapshot = await db.collection('bookings')
                    .where('rideId', '==', ride.id)
                    .where('status', '==', 'COMPLETED')
                    .get();
                
                const card = document.createElement('div');
                card.className = 'ride-card completed-ride';
                card.innerHTML = `
                    <div class="ride-header">
                        <div class="ride-route">${ride.from} → ${ride.to}</div>
                        <div class="ride-price" style="background: #4CAF50; color: white; padding: 0.5rem 1rem; border-radius: 20px;">✓ Completed</div>
                    </div>
                    <div class="ride-info">
                        <div class="ride-info-item">
                            <strong>Date:</strong> ${ride.date}
                        </div>
                        <div class="ride-info-item">
                            <strong>Passengers:</strong> ${bookingsSnapshot.size}
                        </div>
                        <div class="ride-info-item">
                            <strong>Total Earned:</strong> ₹${(ride.farePerPerson * bookingsSnapshot.size).toFixed(0)}
                        </div>
                        <div class="ride-info-item">
                            <strong>Completed:</strong> ${ride.completedAt ? ride.completedAt.toDate().toLocaleDateString() : 'N/A'}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            }
        }
    } catch (error) {
        console.error('Error loading completed rides:', error);
        container.innerHTML = '<div class="empty-state">Error loading completed rides</div>';
    }
}

async function loadProfile() {
    if (!currentUser) return;

    if (!currentUserData) {
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) currentUserData = doc.data();
        } catch (e) {
            console.error('Error refreshing currentUserData in loadProfile:', e);
        }
    }
    if (!currentUserData) return;

    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = currentUserData.name || 'User';

    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = currentUserData.email || '';

    const ratingEl = document.getElementById('profileRating');
    if (ratingEl) ratingEl.textContent = (currentUserData.rating !== undefined ? currentUserData.rating : 5.0).toFixed(1);

    const phoneEl = document.getElementById('profilePhone');
    if (phoneEl) phoneEl.textContent = currentUserData.phone || '—';
    
    const collegeIdSpan = document.getElementById('profileCollegeId');
    const branchSpan = document.getElementById('profileBranch');
    const yearSpan = document.getElementById('profileYear');

    if (userRole === 'student') {
        if (collegeIdSpan) {
            collegeIdSpan.textContent = currentUserData.collegeId || '-';
            if (collegeIdSpan.parentElement) collegeIdSpan.parentElement.style.display = 'flex';
        }
        if (branchSpan) {
            branchSpan.textContent = currentUserData.branch || '-';
            if (branchSpan.parentElement) branchSpan.parentElement.style.display = 'flex';
        }
        if (yearSpan) {
            const yearVal = currentUserData.year || 0;
            yearSpan.textContent = yearVal > 0 ? `${yearVal}${getOrdinalSuffix(yearVal)} Year` : '-';
            if (yearSpan.parentElement) yearSpan.parentElement.style.display = 'flex';
        }
    } else {
        if (collegeIdSpan && collegeIdSpan.parentElement) collegeIdSpan.parentElement.style.display = 'none';
        if (branchSpan && branchSpan.parentElement) branchSpan.parentElement.style.display = 'none';
        if (yearSpan && yearSpan.parentElement) yearSpan.parentElement.style.display = 'none';
    }
    
    const avatar = document.getElementById('profileAvatar');
    if (avatar) {
        avatar.textContent = userRole === 'student' ? '🎓' : '🚗';
    }
    
    const roleBadge = document.getElementById('profileRoleBadge');
    if (roleBadge) {
        roleBadge.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        roleBadge.className = `role-badge ${userRole}`;
    }
    
    const vehicleField = document.getElementById('vehicleField');
    const vehicleSpan = document.getElementById('profileVehicle');
    if (userRole === 'driver' && currentUserData.vehicleInfo) {
        if (vehicleField && vehicleSpan) {
            vehicleField.style.display = 'flex';
            vehicleSpan.textContent = currentUserData.vehicleInfo;
        }
    } else if (vehicleField) {
        vehicleField.style.display = 'none';
    }

    // ⭐ Load all rides posted by user in real time
    try {
        const postedSnap = await db.collection('rides')
            .where('driverId', '==', currentUser.uid)
            .get();

        let rides = postedSnap.docs.map(doc => doc.data());
        rides.sort((a, b) => {
            const aTime = a.createdAt ? (a.createdAt.seconds || 0) : 0;
            const bTime = b.createdAt ? (b.createdAt.seconds || 0) : 0;
            return bTime - aTime;
        });

        const activeCount = rides.filter(r => r.status === 'ACTIVE').length;
        const totalPostedCount = rides.length;
        const completedCount = currentUserData.ridesCompleted || rides.filter(r => r.status === 'COMPLETED').length || 0;

        const profileRides = document.getElementById('profileRides');
        if (profileRides) profileRides.textContent = totalPostedCount;

        const profileCompleted = document.getElementById('profileCompleted');
        if (profileCompleted) profileCompleted.textContent = completedCount;

        const profileBadge = document.getElementById('profilePostedBadge');
        if (profileBadge) profileBadge.textContent = `${totalPostedCount} Total (${activeCount} Active)`;

        const profileList = document.getElementById('profilePostedRidesList');
        if (profileList) {
            if (rides.length === 0) {
                profileList.innerHTML = '<div class="empty-state">No rides posted yet. Click <strong>Post a Ride</strong> to offer a ride!</div>';
            } else {
                profileList.innerHTML = '';
                const grid = document.createElement('div');
                grid.style.display = 'grid';
                grid.style.gap = '1rem';
                rides.forEach(ride => {
                    grid.appendChild(createPostedRideCard(ride));
                });
                profileList.appendChild(grid);
            }
        }
    } catch (err) {
        console.error('Error fetching posted rides for profile:', err);
    }
}

function getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j == 1 && k != 11) return 'st';
    if (j == 2 && k != 12) return 'nd';
    if (j == 3 && k != 13) return 'rd';
    return 'th';
}

function resetMapToCampusView() {
    const card = document.getElementById('activeRideMapCard');
    if (card) card.style.display = 'block';
    const title = document.getElementById('liveMapTitle');
    if (title) title.textContent = '🚗 Campus Live Ride & Cab Map';
    const badge = document.getElementById('liveMapBadge');
    if (badge) badge.innerHTML = '<span class="live-dot"></span> Live';
    const simControls = document.getElementById('map-simulation-controls');
    if (simControls) simControls.style.display = 'none';
    const overlay = document.getElementById('rideInfoContent');
    if (overlay) {
        overlay.innerHTML = '📍 Campus Live Map · Showing active carpools & student transit across Jaipur';
    }
    if (typeof window.stopRideTracking === 'function') {
        window.stopRideTracking();
    }
    if (typeof leafletMap !== 'undefined' && leafletMap) {
        setTimeout(() => leafletMap.invalidateSize(), 150);
    }
}

// REAL-TIME RIDE MONITORING & LISTENERS
let activeUnsubscribes = [];

function startActiveRideMonitoring() {
    console.log("startActiveRideMonitoring called. role:", userRole, "uid:", currentUser ? currentUser.uid : null);
    activeUnsubscribes.forEach(unsub => unsub());
    activeUnsubscribes = [];

    if (userRole === 'student') {
        console.log("Setting up passenger bookings listener for passengerId:", currentUser.uid);
        const passengerUnsub = db.collection('bookings')
            .where('passengerId', '==', currentUser.uid)
            .where('status', 'in', ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'])
            .onSnapshot(snapshot => {
                console.log("Passenger active bookings snapshot change, empty:", snapshot.empty);
                if (!snapshot.empty) {
                    const booking = snapshot.docs[0].data();
                    console.log("Active booking found for passenger:", booking);
                    startRideTracking(booking, false);
                } else {
                    resetMapToCampusView();
                }
            }, error => {
                console.error("Passenger active bookings snapshot listener error:", error.message, error);
            });
        activeUnsubscribes.push(passengerUnsub);

        console.log("Setting up student rejection listener for passengerId:", currentUser.uid);
        const rejectionUnsub = db.collection('bookings')
            .where('passengerId', '==', currentUser.uid)
            .where('status', '==', 'REJECTED')
            .onSnapshot(snapshot => {
                console.log("Student rejection snapshot changed, size:", snapshot.size);
                snapshot.docChanges().forEach(async (change) => {
                    console.log("Student rejection change type:", change.type);
                    if (change.type === 'added' || change.type === 'modified') {
                        const booking = change.doc.data();
                        console.log("Decline received for booking:", booking);
                        showToast("1 rider have cancelled the ride", "error");
                        await db.collection('bookings').doc(booking.id).update({
                            status: 'REJECTED_ACKNOWLEDGED'
                        });
                    }
                });
            }, error => {
                console.error("Student rejection snapshot listener error:", error.message, error);
            });
        activeUnsubscribes.push(rejectionUnsub);
    } 
    else if (userRole === 'driver') {
        console.log("Setting up driver active bookings listener for driverId:", currentUser.uid);
        const driverUnsub = db.collection('bookings')
            .where('driverId', '==', currentUser.uid)
            .where('status', 'in', ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'])
            .onSnapshot(snapshot => {
                console.log("Driver active bookings snapshot changed, empty:", snapshot.empty);
                if (!snapshot.empty) {
                    const booking = snapshot.docs[0].data();
                    console.log("Active booking found for driver:", booking);
                    startRideTracking(booking, true);
                } else {
                    resetMapToCampusView();
                }
            }, error => {
                console.error("Driver active bookings snapshot listener error:", error.message, error);
            });
        activeUnsubscribes.push(driverUnsub);

        console.log("Setting up driver ride requests listener for driverId:", currentUser.uid);
        const requestsUnsub = db.collection('bookings')
            .where('driverId', '==', currentUser.uid)
            .where('status', '==', 'REQUESTED')
            .onSnapshot(snapshot => {
                console.log("Driver ride requests snapshot changed, size:", snapshot.size);
                const existingModal = document.getElementById('driverRequestModal');
                const existingBackdrop = document.getElementById('driverRequestBackdrop');
                if (existingModal) {
                    console.log("Removing existing request modal");
                    existingModal.remove();
                }
                if (existingBackdrop) existingBackdrop.remove();

                if (!snapshot.empty) {
                    const booking = snapshot.docs[0].data();
                    console.log("Showing ride request modal for booking:", booking);
                    showDriverRequestModal(booking);
                }
            }, error => {
                console.error("Driver ride requests snapshot listener error:", error.message, error);
            });
        activeUnsubscribes.push(requestsUnsub);
    }
}

function showDriverRequestModal(booking) {
    const backdrop = document.createElement('div');
    backdrop.id = 'driverRequestBackdrop';
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.id = 'driverRequestModal';
    modal.className = 'driver-request-modal';

    modal.innerHTML = `
        <h3 style="margin-bottom: 1rem; color: var(--primary);">🚗 New Ride Request!</h3>
        <p style="margin-bottom: 0.5rem;"><strong>Passenger:</strong> ${booking.passengerName}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Fare Share:</strong> ₹${booking.fareShare.toFixed(0)}</p>
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
            <button class="btn-primary" style="flex: 1;" onclick="acceptRequestedBooking('${booking.id}', '${booking.rideId}')">Accept</button>
            <button class="btn-secondary" style="flex: 1; border-color: var(--danger); color: var(--danger);" onclick="rejectRequestedBooking('${booking.id}')">Decline</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
}

window.acceptRequestedBooking = async function(bookingId, rideId) {
    const existingModal = document.getElementById('driverRequestModal');
    const existingBackdrop = document.getElementById('driverRequestBackdrop');
    if (existingModal) existingModal.remove();
    if (existingBackdrop) existingBackdrop.remove();

    await acceptBooking(bookingId, rideId);
};

window.rejectRequestedBooking = async function(bookingId) {
    const existingModal = document.getElementById('driverRequestModal');
    const existingBackdrop = document.getElementById('driverRequestBackdrop');
    if (existingModal) existingModal.remove();
    if (existingBackdrop) existingBackdrop.remove();

    await rejectBooking(bookingId);
};