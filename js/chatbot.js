/**
 * chatbot.js
 * Main UI Controller, Event Bindings, and Firebase synchronization for Uniride AI CoPilot.
 */

// Global State
let dbUser = null;
let currentFirebaseUser = null;
let activeRidesList = [];
let localChatHistory = [];
let isBotResponding = false;

// DOM Elements (referenced dynamically)
let messagesContainer = null;
let chatInputForm = null;
let userInputField = null;
let sidebarPanel = null;
let openSidebarBtn = null;
let closeSidebarBtn = null;
let geminiApiKeyInput = null;
let toggleApiKeyBtn = null;
let clearChatBtn = null;
let themeToggleBtn = null;
let engineStatusText = null;
let sidebarUserName = null;
let sidebarUserRole = null;
let chatPopup = null;
let closeChatBtn = null;
let minimizeChatBtn = null;
let maximizeChatBtn = null;
let toggleShortcutsBtn = null;
let chatShortcutsDrawer = null;
let closeShortcutsDrawerBtn = null;

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Ensure pop-out widget markup is mounted in DOM
    ensureChatPopupMounted();

    // 2. Query and bind all DOM element references
    bindElementReferences();

    // 3. Theme Configuration
    const savedTheme = localStorage.getItem('uniride_chatbot_theme') || 'dark';
    setTheme(savedTheme);

    // 4. Load API Key
    const savedApiKey = localStorage.getItem('uniride_gemini_api_key');
    if (savedApiKey) {
        if (geminiApiKeyInput) {
            geminiApiKeyInput.value = savedApiKey;
        }
        updateEngineStatus(true);
    } else {
        updateEngineStatus(false);
    }

    // 5. Setup Firebase Auth Listener
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentFirebaseUser = user;
                await syncUserProfile(user.uid);
                await fetchActiveRides();
            } else {
                setGuestUser();
            }
            renderInitialWelcome();
        });
    } else {
        console.warn("Firebase Auth not initialized in config.js. Running in guest offline mode.");
        setGuestUser();
        renderInitialWelcome();
    }

    // 6. Bind Event Listeners
    bindEvents();

    // 7. Auto-open if URL has ?chat=open
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('chat') === 'open') {
        setTimeout(() => {
            openChatPopup();
        }, 350);
    }
}

// Ensures the pop-out chat widget exists in the DOM
function ensureChatPopupMounted() {
    if (document.getElementById('unirideChatPopup')) {
        return;
    }

    const popupHtml = `
    <div class="uniride-chat-popup hidden dark-theme" id="unirideChatPopup" role="dialog" aria-labelledby="chatPopupTitle" aria-modal="true">
        <!-- Header -->
        <header class="chat-header">
            <div class="header-left">
                <div class="header-brand-avatar">🤖</div>
                <div class="bot-info">
                    <h3 id="chatPopupTitle">UniRide CoPilot</h3>
                    <div class="status-indicator">
                        <span class="status-dot pulsing" id="popupStatusDot"></span>
                        <span class="status-text" id="engineStatusText">Mock Mode active</span>
                    </div>
                </div>
            </div>
            <div class="header-right">
                <button class="icon-btn" id="toggleShortcutsBtn" title="Quick Shortcuts & FAQ">
                    <i class="fa-solid fa-bolt"></i>
                </button>
                <button class="icon-btn" id="themeToggleBtn" title="Toggle Theme">
                    <i class="fa-solid fa-sun"></i>
                </button>
                <button class="icon-btn" id="clearChatBtn" title="Clear Conversation">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
                <button class="icon-btn" id="maximizeChatBtn" title="Toggle Expand">
                    <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
                </button>
                <button class="icon-btn" id="minimizeChatBtn" title="Minimize">
                    <i class="fa-solid fa-minus"></i>
                </button>
                <button class="icon-btn close-btn" id="closeChatBtn" title="Close Chat">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </header>

        <!-- Slide-down Quick Shortcuts & Config Drawer -->
        <div class="chat-shortcuts-drawer" id="chatShortcutsDrawer">
            <div class="shortcuts-drawer-header">
                <span class="shortcuts-drawer-title"><i class="fa-solid fa-bolt"></i> Quick Shortcuts</span>
                <button class="shortcuts-close-btn" id="closeShortcutsDrawerBtn" title="Close Panel">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="shortcuts-drawer-grid">
                <button class="drawer-shortcut-btn" onclick="triggerQuickQuery('How do I verify my student account?')">
                    <i class="fa-solid fa-graduation-cap"></i> Student Verification
                </button>
                <button class="drawer-shortcut-btn" onclick="triggerQuickQuery('How does the automatic fare splitter work?')">
                    <i class="fa-solid fa-wallet"></i> Fare Splitting Logic
                </button>
                <button class="drawer-shortcut-btn" onclick="triggerQuickQuery('Search for available rides today')">
                    <i class="fa-solid fa-route"></i> Find Rides
                </button>
                <button class="drawer-shortcut-btn" onclick="triggerQuickQuery('How can I post a ride as a driver?')">
                    <i class="fa-solid fa-car"></i> Post a Ride
                </button>
            </div>
            <div class="shortcuts-drawer-gemini">
                <label for="geminiApiKey"><i class="fa-solid fa-key"></i> Gemini AI API Key (Optional)</label>
                <div class="api-key-input-wrapper">
                    <input type="password" id="geminiApiKey" placeholder="AIzaSy... (Leave blank for Mock Mode)" autocomplete="off">
                    <button class="icon-btn toggle-password-btn" id="toggleApiKeyVisibility" title="Toggle visibility">
                        <i class="fa-solid fa-eye-slash"></i>
                    </button>
                </div>
                <p class="settings-hint">Stored locally in your browser. If not provided, CoPilot runs in intelligent Mock Mode.</p>
            </div>
        </div>

        <!-- Messages Thread -->
        <div class="messages-container" id="messagesContainer"></div>

        <!-- Suggestion Tags Row -->
        <div class="suggestion-row-wrapper">
            <div class="suggestion-row" id="suggestionRow">
                <button class="suggestion-tag" onclick="triggerQuickQuery('Show active rides')">
                    <i class="fa-solid fa-magnifying-glass-location"></i> Show active rides
                </button>
                <button class="suggestion-tag" onclick="triggerQuickQuery('Fare Split Calculator')">
                    <i class="fa-solid fa-calculator"></i> Fare Split Calculator
                </button>
                <button class="suggestion-tag" onclick="triggerQuickQuery('Check my verification status')">
                    <i class="fa-solid fa-shield-check"></i> Check verification status
                </button>
                <button class="suggestion-tag" onclick="triggerQuickQuery('Help me get started')">
                    <i class="fa-solid fa-circle-info"></i> Help me get started
                </button>
            </div>
        </div>

        <!-- Chat Input Footer -->
        <footer class="chat-footer">
            <form class="input-form" id="chatInputForm">
                <input type="text" id="userInputField" placeholder="Ask UniRide CoPilot anything..." autocomplete="off" required>
                <button type="submit" class="send-btn" id="sendBtn" title="Send Message">
                    <i class="fa-solid fa-arrow-up"></i>
                </button>
            </form>
        </footer>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
}

function bindElementReferences() {
    chatPopup = document.getElementById('unirideChatPopup');
    messagesContainer = document.getElementById('messagesContainer');
    chatInputForm = document.getElementById('chatInputForm');
    userInputField = document.getElementById('userInputField');
    sidebarPanel = document.getElementById('sidebarPanel');
    openSidebarBtn = document.getElementById('openSidebarBtn');
    closeSidebarBtn = document.getElementById('closeSidebarBtn');
    geminiApiKeyInput = document.getElementById('geminiApiKey');
    toggleApiKeyBtn = document.getElementById('toggleApiKeyVisibility');
    clearChatBtn = document.getElementById('clearChatBtn');
    themeToggleBtn = document.getElementById('themeToggleBtn');
    engineStatusText = document.getElementById('engineStatusText');
    sidebarUserName = document.getElementById('sidebarUserName');
    sidebarUserRole = document.getElementById('sidebarUserRole');
    closeChatBtn = document.getElementById('closeChatBtn');
    minimizeChatBtn = document.getElementById('minimizeChatBtn');
    maximizeChatBtn = document.getElementById('maximizeChatBtn');
    toggleShortcutsBtn = document.getElementById('toggleShortcutsBtn');
    chatShortcutsDrawer = document.getElementById('chatShortcutsDrawer');
    closeShortcutsDrawerBtn = document.getElementById('closeShortcutsDrawerBtn');
}

// Pop-Out Window Controls
function openChatPopup() {
    if (!chatPopup) bindElementReferences();
    if (!chatPopup) return;

    chatPopup.classList.remove('hidden');
    chatPopup.classList.add('active');

    const fab = document.getElementById('unirideAiFab');
    if (fab) {
        fab.classList.add('chat-open');
    }

    if (userInputField) {
        setTimeout(() => userInputField.focus(), 250);
    }

    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function closeChatPopup() {
    if (!chatPopup) bindElementReferences();
    if (!chatPopup) return;

    chatPopup.classList.remove('active');
    chatPopup.classList.add('hidden');

    const fab = document.getElementById('unirideAiFab');
    if (fab) {
        fab.classList.remove('chat-open');
    }

    closeShortcutsDrawer();
}

function toggleChatPopup() {
    if (!chatPopup) bindElementReferences();
    if (!chatPopup) return;

    if (chatPopup.classList.contains('active')) {
        closeChatPopup();
    } else {
        openChatPopup();
    }
}

function toggleShortcutsDrawer() {
    if (!chatShortcutsDrawer) bindElementReferences();
    if (!chatShortcutsDrawer) return;
    chatShortcutsDrawer.classList.toggle('active');
}

function closeShortcutsDrawer() {
    if (chatShortcutsDrawer) {
        chatShortcutsDrawer.classList.remove('active');
    }
}

function toggleMaximizePopup() {
    if (!chatPopup) bindElementReferences();
    if (!chatPopup) return;
    chatPopup.classList.toggle('fullscreen');
    if (maximizeChatBtn) {
        const icon = maximizeChatBtn.querySelector('i');
        if (icon) {
            icon.className = chatPopup.classList.contains('fullscreen') 
                ? 'fa-solid fa-down-left-and-up-right-to-center' 
                : 'fa-solid fa-up-right-and-down-left-from-center';
        }
    }
}

// Expose global controller methods
window.openChatPopup = openChatPopup;
window.closeChatPopup = closeChatPopup;
window.toggleChatPopup = toggleChatPopup;
window.toggleShortcutsDrawer = toggleShortcutsDrawer;

// Bind UI interaction events
function bindEvents() {
    // Pop-Out controls
    if (closeChatBtn) closeChatBtn.addEventListener('click', closeChatPopup);
    if (minimizeChatBtn) minimizeChatBtn.addEventListener('click', closeChatPopup);
    if (maximizeChatBtn) maximizeChatBtn.addEventListener('click', toggleMaximizePopup);
    if (toggleShortcutsBtn) toggleShortcutsBtn.addEventListener('click', toggleShortcutsDrawer);
    if (closeShortcutsDrawerBtn) closeShortcutsDrawerBtn.addEventListener('click', closeShortcutsDrawer);

    // ESC key closes drawer or popout
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (chatShortcutsDrawer && chatShortcutsDrawer.classList.contains('active')) {
                closeShortcutsDrawer();
            } else if (chatPopup && chatPopup.classList.contains('active')) {
                closeChatPopup();
            }
        }
    });

    // Sidebar Toggles (for standalone mode if present)
    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    
    // API Key Input
    if (geminiApiKeyInput) {
        geminiApiKeyInput.addEventListener('input', (e) => {
            const key = e.target.value.trim();
            if (key) {
                localStorage.setItem('uniride_gemini_api_key', key);
                updateEngineStatus(true);
            } else {
                localStorage.removeItem('uniride_gemini_api_key');
                updateEngineStatus(false);
            }
        });
    }

    if (toggleApiKeyBtn) {
        toggleApiKeyBtn.addEventListener('click', () => {
            const type = geminiApiKeyInput.type === 'password' ? 'text' : 'password';
            geminiApiKeyInput.type = type;
            const icon = toggleApiKeyBtn.querySelector('i');
            if (icon) {
                icon.className = type === 'password' ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }
        });
    }

    // Clear Chat
    if (clearChatBtn) clearChatBtn.addEventListener('click', clearChat);

    // Theme Toggle
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentIsDark = chatPopup 
                ? chatPopup.classList.contains('dark-theme') 
                : document.body.classList.contains('dark-theme');
            setTheme(currentIsDark ? 'light' : 'dark');
        });
    }

    // Chat Submission
    if (chatInputForm) {
        chatInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleMessageSubmit();
        });
    }
}

// ======================================================
// PROFILE SYNCING & DATABASE QUERIES
// ======================================================
async function syncUserProfile(uid) {
    if (typeof db === 'undefined') return;
    
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            dbUser = userDoc.data();
            if (sidebarUserName) sidebarUserName.textContent = dbUser.name || "UniRide Student";
            if (sidebarUserRole) {
                sidebarUserRole.textContent = dbUser.role ? `${dbUser.role} Account` : "Student Account";
                sidebarUserRole.className = `profile-role ${dbUser.role || 'student'}`;
            }
        } else {
            setGuestUser();
        }
    } catch (err) {
        console.error("Error reading Firestore profile:", err);
        setGuestUser();
    }
}

function setGuestUser() {
    dbUser = null;
    currentFirebaseUser = null;
    if (sidebarUserName) sidebarUserName.textContent = "Guest Student";
    if (sidebarUserRole) {
        sidebarUserRole.textContent = "Offline Mode";
        sidebarUserRole.className = "profile-role offline";
    }
}

async function fetchActiveRides() {
    if (typeof db === 'undefined') return;
    
    try {
        const snapshot = await db.collection('rides')
            .where('status', '==', 'active')
            .limit(10)
            .get();
        
        activeRidesList = [];
        snapshot.forEach(doc => {
            activeRidesList.push({ id: doc.id, ...doc.data() });
        });
        console.log(`Fetched ${activeRidesList.length} active rides from Firestore.`);
    } catch (err) {
        console.error("Error querying active rides:", err);
        activeRidesList = [];
    }
}

// ======================================================
// THEME & SIDEBAR STATE MANAGERS
// ======================================================
function setTheme(theme) {
    if (!chatPopup) bindElementReferences();
    const isDark = theme === 'dark';

    if (chatPopup) {
        chatPopup.classList.toggle('dark-theme', isDark);
        chatPopup.classList.toggle('light-theme', !isDark);
    }
    
    if (document.body.classList.contains('standalone-chatbot')) {
        document.body.classList.toggle('dark-theme', isDark);
        document.body.classList.toggle('light-theme', !isDark);
    }

    localStorage.setItem('uniride_chatbot_theme', isDark ? 'dark' : 'light');
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
}

function openSidebar() {
    if (sidebarPanel) sidebarPanel.classList.add('active');
}

function closeSidebar() {
    if (sidebarPanel) sidebarPanel.classList.remove('active');
}

function updateEngineStatus(hasKey) {
    if (engineStatusText) {
        engineStatusText.textContent = hasKey ? "Live AI Active" : "Mock Mode active";
    }
    const indicator = document.querySelector('.status-dot');
    if (indicator) {
        indicator.className = hasKey ? "status-dot pulsing" : "status-dot";
    }
}

// ======================================================
// CONVERSATION RENDER ENGINE
// ======================================================
function clearChat() {
    if (confirm("Are you sure you want to clear this conversation history?")) {
        localChatHistory = [];
        sessionStorage.removeItem('uniride_chat_history');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        renderInitialWelcome();
        if (typeof showToast === 'function') {
            showToast('Chat history cleared', 'info');
        }
    }
}

function renderInitialWelcome() {
    messagesContainer.innerHTML = '';
    
    // Welcome card
    const card = document.createElement('div');
    card.className = 'welcome-system-card';
    
    const name = dbUser ? dbUser.name : "Student";
    card.innerHTML = `
        <div class="welcome-icon"><i class="fa-solid fa-compass-drafting"></i></div>
        <h2>Welcome to UniRide CoPilot!</h2>
        <p>Hello <strong>${name}</strong>! I'm your AI driving companion. I can help search campus carpools, calculate fare shares, and explain account requirements.</p>
        <p style="font-size:0.78rem; opacity:0.8;">Get started by typing a query below, clicking a suggested tag, or entering a Gemini API key in the configuration panel on the left.</p>
    `;
    messagesContainer.appendChild(card);
    
    // Load existing history if any
    const savedHist = sessionStorage.getItem('uniride_chat_history');
    if (savedHist) {
        try {
            const parsed = JSON.parse(savedHist);
            localChatHistory = parsed;
            parsed.forEach(msg => {
                renderBubble(msg.role, msg.text, false);
            });
        } catch (e) {
            console.error("Error loading chat history from session:", e);
        }
    }
}

// Submits a message from the input form
async function handleMessageSubmit() {
    if (isBotResponding) return;

    const val = userInputField.value.trim();
    if (!val) return;

    userInputField.value = '';
    
    // Render user message
    appendMessage('user', val);

    // AI logic response
    isBotResponding = true;
    showTypingIndicator();

    const apiKey = localStorage.getItem('uniride_gemini_api_key');
    let responseText = "";

    try {
        if (apiKey) {
            // Live AI Mode
            responseText = await callGeminiApi(apiKey, val, localChatHistory, dbUser, activeRidesList);
        } else {
            // Mock Mode
            await new Promise(r => setTimeout(r, 700)); // Delay to simulate thinking
            responseText = getMockResponse(val, dbUser);
        }
        
        removeTypingIndicator();
        appendMessage('bot', responseText);
    } catch (err) {
        console.error(err);
        removeTypingIndicator();
        appendMessage('bot', `⚠️ **Error generating response**: ${err.message || 'An unknown network error occurred.'}. Please ensure your API key is correct or fallback to Mock Mode.`);
    } finally {
        isBotResponding = false;
    }
}

// Programmatic query injection (used by tags and buttons)
window.triggerQuickQuery = function(text) {
    if (isBotResponding) return;
    userInputField.value = text;
    handleMessageSubmit();
};

function appendMessage(role, text) {
    localChatHistory.push({ role, text });
    sessionStorage.setItem('uniride_chat_history', JSON.stringify(localChatHistory));
    renderBubble(role, text, true);
}

// Render message bubbles in HTML container
function renderBubble(role, text, shouldScroll = true) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;

    // Meta Header
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const sender = role === 'user' ? 'You' : 'UniRide CoPilot';
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.innerHTML = `<span>${sender}</span> <span>${now}</span>`;
    wrapper.appendChild(meta);

    // Text Bubble
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    // Check for Widget Tags
    let widgetTag = null;
    let cleanText = text;
    
    const widgetMatch = text.match(/\[WIDGET:(RIDE_LIST|FARE_CALC|VERIFY_STATUS)\]/i);
    if (widgetMatch) {
        widgetTag = widgetMatch[1].toUpperCase();
        cleanText = text.replace(widgetMatch[0], '').trim();
    }

    // Markdown conversion helpers
    bubble.innerHTML = formatMarkdown(cleanText);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);

    // Append Widgets below the message bubble
    if (widgetTag) {
        renderWidgetCard(widgetTag);
    }

    if (shouldScroll) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Basic markdown to html helper (converts bold and bullet stars)
function formatMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Bold tags (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Monospace tags (`text`)
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');

    // Bullet points (• or *)
    const lines = html.split('\n');
    let inList = false;
    let processedLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('•') || trimmed.startsWith('* ')) {
            const content = trimmed.substring(trimmed.startsWith('•') ? 1 : 2).trim();
            if (!inList) {
                inList = true;
                return '<ul><li>' + content + '</li>';
            }
            return '<li>' + content + '</li>';
        } else {
            if (inList) {
                inList = false;
                return '</ul>' + line;
            }
            return line + '<br>';
        }
    });

    if (inList) {
        processedLines.push('</ul>');
    }

    return processedLines.join('\n');
}

// Bouncing Typing Indicator
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator-bubble';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// ======================================================
// INTERACTIVE CUSTOM WIDGET RENDER SYSTEM
// ======================================================
function renderWidgetCard(widgetType) {
    const widget = document.createElement('div');
    widget.className = 'chat-widget-card';

    if (widgetType === 'FARE_CALC') {
        widget.innerHTML = `
            <div class="widget-header">
                <i class="fa-solid fa-calculator"></i>
                <h4>Fare Split Estimator</h4>
            </div>
            <div class="widget-calc-inputs">
                <div class="calc-field">
                    <label>Total Ride Fare (₹)</label>
                    <input type="number" id="widgetTotalFare" value="600" min="0" step="50">
                </div>
                <div class="calc-field">
                    <label>Seats Occupied (Driver + Pass)</label>
                    <input type="number" id="widgetSeats" value="4" min="1" max="10">
                </div>
            </div>
            <div class="widget-calc-results">
                <span class="result-label">Fare Share (Per Person):</span>
                <span class="result-value" id="widgetSplitResult">₹150</span>
            </div>
            <button class="btn-calc-widget" onclick="calculateWidgetSplit()">Calculate Split</button>
        `;
    } 
    else if (widgetType === 'VERIFY_STATUS') {
        const isVerified = dbUser && dbUser.idCardApproved;
        const emailVerified = currentFirebaseUser && currentFirebaseUser.emailVerified;
        
        widget.innerHTML = `
            <div class="widget-header">
                <i class="fa-solid fa-shield-halved"></i>
                <h4>Profile Verification Check</h4>
            </div>
            <div class="verify-list">
                <div class="verify-list-item">
                    <i class="${emailVerified ? 'fa-solid fa-circle-check check' : 'fa-solid fa-circle-xmark times'}"></i>
                    <span>College Email Verified</span>
                </div>
                <div class="verify-list-item">
                    <i class="${dbUser && dbUser.branch ? 'fa-solid fa-circle-check check' : 'fa-solid fa-circle-xmark times'}"></i>
                    <span>Academic Information Configured</span>
                </div>
                <div class="verify-list-item">
                    <i class="${isVerified ? 'fa-solid fa-circle-check check' : 'fa-solid fa-circle-xmark times'}"></i>
                    <span>College ID Approved (Admin Audit)</span>
                </div>
            </div>
            <div style="margin-top: 1rem; padding-top:0.75rem; border-top: 1px solid var(--border-main); text-align: center;">
                <span class="role-badge ${isVerified ? 'student' : 'offline'}" style="padding: 0.35rem 1rem; border-radius: 8px;">
                    Overall: ${isVerified ? 'VERIFIED' : 'PENDING APPROVAL'}
                </span>
            </div>
        `;
    } 
    else if (widgetType === 'RIDE_LIST') {
        // List real rides or fallback to mock rides
        let ridesMarkup = "";
        
        const ridesToDisplay = activeRidesList.length > 0 ? activeRidesList : [
            {
                id: "mock_ride_1",
                from: "Hostel Blocks",
                to: "Main Campus Gate",
                driverName: "Rohit Sharma",
                driverRating: 4.8,
                farePerPerson: 30,
                seats: 3,
                date: "Today",
                time: "15:45"
            },
            {
                id: "mock_ride_2",
                from: "Main Campus",
                to: "Manipal Junction Station",
                driverName: "Priya Patel",
                driverRating: 4.9,
                farePerPerson: 120,
                seats: 2,
                date: "Tomorrow",
                time: "09:30"
            }
        ];

        ridesToDisplay.forEach(ride => {
            const fare = ride.farePerPerson || (ride.fare / ((ride.seats || 4) + 1)) || 0;
            ridesMarkup += `
                <div class="ride-item-card">
                    <div class="ride-route-details">
                        <span>${ride.from}</span>
                        <i class="fa-solid fa-arrow-right-long route-arrow"></i>
                        <span>${ride.to}</span>
                    </div>
                    <div class="ride-info-grid">
                        <span><i class="fa-solid fa-user-tie"></i> ${ride.driverName || 'Driver'}</span>
                        <span><i class="fa-solid fa-chair"></i> ${ride.seats} Seats left</span>
                        <span><i class="fa-solid fa-calendar-day"></i> ${ride.date}</span>
                        <span><i class="fa-solid fa-clock"></i> ${ride.time}</span>
                    </div>
                    <div class="ride-item-action">
                        <span class="ride-fare">₹${Math.round(fare)}/seat</span>
                        <button class="ride-btn-book" onclick="requestWidgetRide('${ride.id}', '${ride.driverName || 'Driver'}', ${fare})">
                            Request Seat
                        </button>
                    </div>
                </div>
            `;
        });

        widget.innerHTML = `
            <div class="widget-header">
                <i class="fa-solid fa-route"></i>
                <h4>Available Rides Matching</h4>
            </div>
            <div class="ride-widget-list">
                ${ridesMarkup}
            </div>
            ${activeRidesList.length === 0 ? '<p style="font-size:0.68rem; color:var(--tx-muted); text-align:center; margin-top:0.25rem;">(Demonstration: Mock rides loaded since DB queries returned empty results)</p>' : ''}
        `;
    }

    messagesContainer.appendChild(widget);
}

// Widget calculator computation logic
window.calculateWidgetSplit = function() {
    const fare = parseFloat(document.getElementById('widgetTotalFare').value) || 0;
    const count = parseInt(document.getElementById('widgetSeats').value) || 1;
    const split = fare / count;
    
    document.getElementById('widgetSplitResult').textContent = `₹${Math.round(split)}`;
};

// Widget booking submit action
window.requestWidgetRide = async function(rideId, driverName, fareShare) {
    if (!currentFirebaseUser) {
        if (typeof showToast === 'function') {
            showToast("Please log in to Uniride to request carpool bookings!", "error");
        } else {
            alert("Please log in to Uniride to request carpool bookings!");
        }
        return;
    }

    if (rideId.startsWith('mock_')) {
        if (typeof showToast === 'function') {
            showToast(`Simulated request sent to ${driverName}!`, "success");
        } else {
            alert(`Simulated request sent to ${driverName}!`);
        }
        return;
    }

    // Submit actual Firestore booking document!
    try {
        if (typeof db === 'undefined') throw new Error("Firestore not available");

        // Prevent double booking checking
        const existing = await db.collection('bookings')
            .where('rideId', '==', rideId)
            .where('passengerId', '==', currentFirebaseUser.uid)
            .get();

        if (!existing.empty) {
            const active = existing.docs.find(d => ['REQUESTED', 'ACCEPTED'].includes(d.data().status));
            if (active) {
                if (typeof showToast === 'function') {
                    showToast("You already have an active request for this carpool!", "error");
                } else {
                    alert("You already have an active request for this carpool!");
                }
                return;
            }
        }

        // Get Ride details to find driverId
        const rideDoc = await db.collection('rides').doc(rideId).get();
        if (!rideDoc.exists) throw new Error("Carpool not found in database");
        const rideData = rideDoc.data();

        const bookingRef = db.collection('bookings').doc();
        await bookingRef.set({
            id: bookingRef.id,
            rideId: rideId,
            passengerId: currentFirebaseUser.uid,
            passengerName: dbUser ? dbUser.name : (currentFirebaseUser.displayName || 'Student'),
            driverId: rideData.driverId,
            status: 'REQUESTED',
            fareShare: fareShare,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (typeof showToast === 'function') {
            showToast("Seat requested successfully!", "success");
        } else {
            alert("Seat requested successfully! The driver will be notified.");
        }
    } catch (err) {
        console.error("Booking failed:", err);
        if (typeof showToast === 'function') {
            showToast(`Request failed: ${err.message}`, "error");
        } else {
            alert(`Booking request failed: ${err.message}`);
        }
    }
};
