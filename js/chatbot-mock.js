/**
 * chatbot-mock.js
 * An intelligent rule-based mock responder for Uniride FAQ and widgets when Gemini API Key is not set.
 */

/**
 * Generate a rule-based mock response based on user input keywords.
 * @param {string} input - User typed query.
 * @param {Object} currentUser - Current logged-in user context.
 * @returns {string} Response text (potentially including [WIDGET:...] tags).
 */
function getMockResponse(input, currentUser) {
    const query = input.toLowerCase().trim();
    
    // Greeting
    if (query.match(/\b(hi|hello|hey|greetings|yo|sup)\b/)) {
        const userName = currentUser ? currentUser.name : "Student";
        return `Hello, ${userName}! 🚗 Welcome to the **UniRide CoPilot**. 

I am your AI assistant for student-only carpooling. Since no Gemini API key is configured, I am running in **Mock Mode**. I can still help you navigate the app!

You can ask me questions about:
• 🎓 **Student Verification** (How to get approved)
• 💳 **Automatic Fare Splitting** (How we share costs)
• 🔍 **Finding available rides**
• ⚙️ **Dashboard features**

What can I help you with today?`;
    }

    // Verification
    if (query.includes("verify") || query.includes("verification") || query.includes("id card") || query.includes("email") || query.includes("approve")) {
        const status = currentUser ? currentUser.status : "Offline / Guest";
        return `Student verification is a **mandatory safety feature** of UniRide to ensure a secure, student-only carpooling network.

To verify your account, you must provide:
1. **College Email Address** (e.g. \`@student.edu\`)
2. **Phone Number** (for SMS alerts)
3. **Academic Details** (Branch, Academic Year)
4. **College ID Card Photo** (checked by admins)

Here is your current verification status details:
[WIDGET:VERIFY_STATUS]`;
    }

    // Fare Splitting & Calculator
    if (query.includes("fare") || query.includes("split") || query.includes("calc") || query.includes("cost") || query.includes("price") || query.includes("money")) {
        return `UniRide features an **Automatic Fare Splitter** for college journeys. 

**How it works:**
• The Driver posts a ride and sets the **Total Fare** for the fuel/car cost.
• As passengers request and get accepted, the fare splits **equally** between the passengers and driver.
• For example, if the total fare is ₹600 and there are 3 passengers + 1 driver (4 people), each pays ₹150.

You can simulate splits using this interactive calculator:
[WIDGET:FARE_CALC]`;
    }

    // Ride Search / Find Rides
    if (query.includes("ride") || query.includes("search") || query.includes("find") || query.includes("available") || query.includes("book") || query.includes("destination") || query.includes("driver")) {
        const name = currentUser ? currentUser.name : "";
        return `Searching for active carpools in the UniRide database... 

Here are the available rides matching our system. You can view vehicle details and submit a booking request directly from this card:
[WIDGET:RIDE_LIST]`;
    }

    // Post a ride (Drivers)
    if (query.includes("post") || query.includes("create") || query.includes("offer") || query.includes("drive")) {
        return `To post a ride as a **Driver**, follow these steps:
1. Ensure your profile has **Driver details** configured (Vehicle Brand, Model, Year, License Plate Number).
2. Navigate to the **Post a Ride** section in the sidebar.
3. Input your **Departure (From)**, **Destination (To)**, date, time, available seat count, and total fare.
4. The system will automatically show the estimated fare split per seat before you submit.
5. Once submitted, you can review student booking requests in your Home dashboard.`;
    }

    // Live Tracking Maps
    if (query.includes("map") || query.includes("track") || query.includes("simulat") || query.includes("speed") || query.includes("leaflet")) {
        return `UniRide features **Real-Time Simulation Tracking** utilizing Leaflet.js and OpenStreetMap:
• Once a booking is active, a tracking card opens on your Home dashboard.
• It renders a route map and simulates the car's current GPS position along the path.
• Testing/Debugging controls allow you to speed up the simulation to **1x, 5x, 10x, or 50x** to preview the entire trip path within seconds.`;
    }

    // Help / Getting Started
    if (query.includes("help") || query.includes("started") || query.includes("faq") || query.includes("what can you do")) {
        return `Here is a quick overview of what you can do on **UniRide**:
• 🚗 **Find Carpools**: Search by origin and destination, view ratings, check split fares, and request seats.
• 🛣️ **Track Live Trips**: View simulated vehicle progress on maps.
• 💳 **Post & Share**: Drivers post rides, and the system handles cost splitting automatically.
• 🔒 **Stay Safe**: Strict college ID verification ensures a student-only environment.

Would you like to search active rides or calculate split fares? Click a suggestion tag at the bottom or type:
• *"Show active rides"*
• *"Fare Split Calculator"*
• *"Check my verification status"*`;
    }

    // Default Fallback
    return `I'm here to help you with **UniRide** carpooling. In **Mock Mode**, I match keywords from your inputs. 

Here are some helpful commands you can try:
• **"Show active rides"** (Displays the rides listing card)
• **"Check verification status"** (Displays your profile status card)
• **"Fare Split Calculator"** (Renders an interactive calculator)
• **"How does cost splitting work?"** (Explains the fare model)

*(Tip: You can insert your Gemini API Key in the left sidebar to enable fully dynamic conversations!)*`;
}
