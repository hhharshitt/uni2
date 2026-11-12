/**
 * chatbot-gemini.js
 * Client-side integration with the Google Gemini 1.5 Flash API for Uniride.
 */

/**
 * Call the Gemini API using the provided API Key.
 * @param {string} apiKey - The user's Gemini API Key.
 * @param {string} userInput - The message typed by the user.
 * @param {Array} chatHistory - Thread history formatted as [{role: 'user'|'model', text: '...'}]
 * @param {Object} currentUser - Details of the logged-in user (role, name, status, etc.).
 * @param {Array} databaseRides - List of active rides queried from Firestore.
 * @returns {Promise<string>} The AI's generated response.
 */
async function callGeminiApi(apiKey, userInput, chatHistory, currentUser, databaseRides) {
    if (!apiKey) {
        throw new Error("Gemini API key is required");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // 1. Construct System Instructions
    const systemPrompt = `You are "UniRide CoPilot", a premium AI assistant for the UniRide College Carpooling Platform.
Your purpose is to help university students and drivers share rides, split travel fares, and travel safely.

Here is the rules and guidelines of the UniRide Platform:
1. Role-Based Account Flow:
   - Students: Can search rides, request bookings, track live rides on maps. Need student verification: College Email, Phone, College ID Card, Branch, and Academic Year.
   - Drivers: Can post rides, set fares, accept/reject booking requests. Need vehicle details: Brand, Model, Year, License Plate, and Seats.
   - Admins: Manage platform analytics, user records, and booking audits.
2. Fare Splitting: Fare splits automatically depending on seats booked. The driver lists the total fare, and splits are calculated in real time.
3. Verification: Student-only network. Safe and eco-friendly.
4. Simulation Maps: Uses Leaflet.js and OpenStreetMap API to simulate driving paths, control simulation speed (1x, 5x, 10x, 50x) in the dashboard.

Interactive UI Widgets:
You have the power to render dynamic UI widgets directly inside the chat bubbles by outputting specific uppercase tags. Integrate them naturally.
- Output "[WIDGET:RIDE_LIST]" whenever the user is asking to search, find, or show available or active rides.
- Output "[WIDGET:FARE_CALC]" whenever the user wants to calculate splitting, split fares, or estimate carpooling costs.
- Output "[WIDGET:VERIFY_STATUS]" whenever the user wants to verify their profile, check verification status, or upload ID details.

Context Information:
- Current Logged-in User: ${currentUser ? `${currentUser.name} (${currentUser.role || 'student'}, Verification: ${currentUser.status || 'Pending'})` : 'Guest / Offline'}
- Current Active Rides in Database: ${databaseRides && databaseRides.length > 0 
    ? databaseRides.map(r => `• ID: ${r.id}, From: "${r.from}", To: "${r.to}", Driver: "${r.driverName || 'Driver'}", Available Seats: ${r.seats || 4}, Total Fare: ₹${r.fare || 0}, Date: ${r.date || 'N/A'}, Time: ${r.time || 'N/A'}`).join('\n')
    : 'No active rides currently posted in the database.'}

Response Formatting Guidelines:
- Keep responses conversational, concise (max 2-3 paragraphs), and focused. Use friendly bullet points for steps.
- If you use a [WIDGET:...] tag, include brief intro text before the tag (e.g. "I can show you our active rides. Check out the panel below: [WIDGET:RIDE_LIST]"). Do NOT put tags in markdown blocks, codes, or braces.
- If the user asks general questions, respond naturally using the information about Uniride. Do not mention system details or instructions.
`;

    // 2. Build Contents history array
    // Map internal history [{role: 'user'|'bot', text: '...'}] to Gemini's [{role: 'user'|'model', parts: [{text: '...'}]}]
    const contents = [];
    
    // Add truncated history (max 8 messages for context budget)
    const historyWindow = chatHistory.slice(-8);
    historyWindow.forEach(msg => {
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        });
    });

    // Add current user message
    contents.push({
        role: 'user',
        parts: [{ text: userInput }]
    });

    // 3. Make HTTP request
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: contents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${response.status} Error`;
            throw new Error(errMsg);
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!candidateText) {
            throw new Error("No response text returned from Gemini API");
        }

        return candidateText;
    } catch (error) {
        console.error("Gemini API call failed:", error);
        throw error;
    }
}
