/**
 * Ena Coach AI Agent - Unified Server
 * Handles both the WhatsApp Webhook and serving the React Frontend.
 */

import 'dotenv/config'; // Load environment variables locally
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto'; // For Secure Ticket Signing

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// API Keys
const API_KEY = process.env.GEMINI_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; // Needed for callbacks

// Fleet / GPS API Config
const FLEET_API_URL = process.env.FLEET_API_URL; 
const FLEET_API_KEY = process.env.FLEET_API_KEY;

// Daraja Config
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY;
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET;
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY;
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '174379'; 
const DARAJA_ENV = 'sandbox'; 
const TICKET_SECRET = process.env.TICKET_SECRET || 'ENA_SUPER_SECRET_KEY_2025';

// --- Initialize App ---
const app = express();

// CORS Middleware for Local Dev
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(bodyParser.json());

// --- In-Memory Stores ---
// Stores latest 50 messages for the Admin Dashboard Simulator
const debugOutbox = []; 
const paymentStore = new Map(); // Key: CheckoutRequestID, Value: { status: 'PENDING'|'COMPLETED'|'FAILED', phone, amount, receipt, timestamp }

// Track passengers for Geofencing Broadcasts
// Key: RouteID (e.g., R001), Value: { passengers: Set<phoneNumber>, lastStop: string | null }
const activeTrips = new Map();

// --- Geofence Definitions ---
const GEOFENCES = [
  { name: "Nairobi Office", lat: -1.286389, lng: 36.817223, radiusKm: 0.8 },
  { name: "Nakuru Stage", lat: -0.292115, lng: 36.069930, radiusKm: 1.0 },
  { name: "Kisumu Office", lat: -0.091702, lng: 34.767956, radiusKm: 1.0 },
  { name: "Eldoret Town", lat: 0.514277, lng: 35.269780, radiusKm: 1.0 },
  { name: "Kericho Town", lat: -0.3689, lng: 35.2863, radiusKm: 1.0 },
  { name: "Narok Stopover", lat: -1.0788, lng: 35.8601, radiusKm: 1.0 },
  { name: "Mombasa Office", lat: -4.0435, lng: 39.6682, radiusKm: 1.0 }
];

// --- INTERNAL DATA ---
const INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, stops: ['Ahero', 'Kericho', 'Nakuru', 'Naivasha'] },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, stops: ['Nakuru', 'Eldoret', 'Bungoma', 'Mumias'] },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, stops: ['Mtito Andei', 'Voi', 'Mariakani'] },
];

// --- Secure Ticket Generator ---
function generateSecureTicket(passengerName, routeId, seatNumber) {
    const ticketId = `TKT-${Math.floor(Math.random() * 100000)}`;
    const dataToSign = `${ticketId}:${passengerName}:${routeId}:${seatNumber}`;
    
    // Create HMAC SHA256 Signature
    const signature = crypto.createHmac('sha256', TICKET_SECRET)
                            .update(dataToSign)
                            .digest('hex');
    
    const qrData = JSON.stringify({
        id: ticketId,
        p: passengerName,
        r: routeId,
        s: seatNumber,
        sig: signature.substring(0, 16) // Shortened sig for QR capacity
    });

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
    
    return { ticketId, qrCodeUrl, signature };
}

// --- Real Tracking Helper ---
async function fetchRealBusLocation(query) {
  if (!FLEET_API_URL) {
    // If no real API, we can't track.
    return { error: "Real-time tracking is currently unavailable (System Configuration Error)." };
  }
  try {
    const response = await fetch(`${FLEET_API_URL}/vehicles?search=${encodeURIComponent(query)}`, {
      headers: FLEET_API_KEY ? { 'Authorization': `Bearer ${FLEET_API_KEY}` } : {}
    });
    if (!response.ok) throw new Error(`Tracking API responded with ${response.status}`);
    
    const data = await response.json();
    // Normalizing data structure for our geofence logic
    // We expect { latitude: 1.23, longitude: 36.5 } or similar
    // If the API returns a list, take the first one
    const vehicle = Array.isArray(data) ? data[0] : data;
    
    // Map common GPS fields to standard lat/lng
    const lat = vehicle.latitude || vehicle.lat || vehicle.gps?.lat;
    const lng = vehicle.longitude || vehicle.lng || vehicle.gps?.lng;
    
    if (lat && lng) {
        return { ...vehicle, lat: parseFloat(lat), lng: parseFloat(lng) };
    }
    
    return data;
  } catch (error) {
    console.error("Tracking Error:", error.message);
    return { error: "Unable to contact GPS satellites. Please try again later." };
  }
}

// --- Geofencing Logic ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

async function checkGeofences() {
    if (activeTrips.size === 0) return;

    // console.log(`[Geofence] Checking ${activeTrips.size} active routes...`); // Commented to reduce noise in logs
    
    for (const [routeId, tripData] of activeTrips.entries()) {
        try {
            const location = await fetchRealBusLocation(routeId);
            
            // Check if we have valid coordinates
            if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
                
                for (const fence of GEOFENCES) {
                    const dist = getDistanceFromLatLonInKm(location.lat, location.lng, fence.lat, fence.lng);
                    
                    if (dist <= fence.radiusKm) {
                        // Bus is inside the fence
                        if (tripData.lastStop !== fence.name) {
                            // New entry! Broadcast.
                            const msg = `📍 *Ena Coach Travel Update*\n\nBus ${routeId} has arrived at *${fence.name}*.\nWe will be stopping here briefly. Please ensure you are back on board before departure.`;
                            console.log(`[Geofence] TRIGGERED: ${fence.name} for Route ${routeId}`);
                            
                            // Send to all passengers
                            const phoneNumbers = Array.from(tripData.passengers);
                            for (const phone of phoneNumbers) {
                                await sendWhatsAppMessage(phone, msg);
                            }
                            
                            // Update state to prevent spamming
                            tripData.lastStop = fence.name;
                            activeTrips.set(routeId, tripData);
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[Geofence] Error checking route ${routeId}:`, e.message);
        }
    }
}

// Run Geofence Check every 60 seconds
setInterval(checkGeofences, 60000);


// --- Daraja Helpers ---
async function getDarajaToken() {
  if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET) return null;
  const url = DARAJA_ENV === 'sandbox' 
    ? 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  try {
    const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    const data = await response.json();
    return data.access_token;
  } catch (error) { return null; }
}

async function triggerSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  if (!token) {
    console.warn("⚠️ Daraja keys missing. Simulating payment.");
    // Simulate a successful ID for testing
    const mockId = `ws_CO_${Date.now()}`;
    paymentStore.set(mockId, { status: 'COMPLETED', phone: phoneNumber, amount, receipt: 'MOCK123', timestamp: Date.now() });
    return { success: true, checkoutRequestId: mockId, message: "[SIMULATION] Payment Auto-Completed for testing." };
  }
  
  const date = new Date();
  const timestamp = date.getFullYear() +
    ("0" + (date.getMonth() + 1)).slice(-2) +
    ("0" + date.getDate()).slice(-2) +
    ("0" + date.getHours()).slice(-2) +
    ("0" + date.getMinutes()).slice(-2) +
    ("0" + date.getSeconds()).slice(-2);

  const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
  const url = DARAJA_ENV === 'sandbox'
    ? 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
    : 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  const callbackUrl = `${SERVER_URL}/callback/mpesa`;

  const payload = {
    "BusinessShortCode": DARAJA_SHORTCODE,
    "Password": password,
    "Timestamp": timestamp,
    "TransactionType": "CustomerPayBillOnline",
    "Amount": Math.ceil(amount),
    "PartyA": formattedPhone,
    "PartyB": DARAJA_SHORTCODE,
    "PhoneNumber": formattedPhone,
    "CallBackURL": callbackUrl, 
    "AccountReference": "EnaCoach",
    "TransactionDesc": "Bus Ticket"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    
    if (data.ResponseCode === "0") {
        // Store Pending Transaction
        paymentStore.set(data.CheckoutRequestID, {
            status: 'PENDING',
            phone: formattedPhone,
            amount: amount,
            timestamp: Date.now()
        });
        return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Push sent. Waiting for PIN." };
    } else {
        return { success: false, message: `Payment API Error: ${data.errorMessage}` };
    }
  } catch (error) { return { success: false, message: "Network error contacting M-Pesa." }; }
}

// --- Routes & Endpoints ---

// 1. Health Check (Useful for Render auto-deploy checks)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// 2. Debug Endpoints for Admin Dashboard Simulator
app.get('/api/debug/messages', (req, res) => {
    res.json(debugOutbox);
});

app.post('/api/debug/clear', (req, res) => {
    debugOutbox.length = 0;
    res.json({ success: true });
});

// 3. M-Pesa Callback (The Critical Part)
app.post('/callback/mpesa', (req, res) => {
    console.log("Create Callback Hit:", JSON.stringify(req.body));
    const { Body } = req.body;
    
    if (!Body || !Body.stkCallback) {
        return res.status(400).send('Invalid Payload');
    }

    const { stkCallback } = Body;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    // Default to failed
    let newStatus = 'FAILED';
    let receipt = null;

    if (resultCode === 0) {
        newStatus = 'COMPLETED';
        // Extract Receipt
        const items = stkCallback.CallbackMetadata?.Item || [];
        const receiptItem = items.find(i => i.Name === 'MpesaReceiptNumber');
        receipt = receiptItem ? receiptItem.Value : 'UNKNOWN';
    }

    // Update Store
    const existing = paymentStore.get(checkoutRequestId);
    if (existing) {
        paymentStore.set(checkoutRequestId, {
            ...existing,
            status: newStatus,
            receipt: receipt,
            failureReason: stkCallback.ResultDesc
        });
        console.log(`✅ Payment Updated: ${checkoutRequestId} -> ${newStatus}`);
    } else {
        console.warn(`⚠️ Callback received for unknown ID: ${checkoutRequestId}`);
    }

    res.status(200).send('OK');
});

// 4. Client Payment API Endpoints (For Web Simulator)
app.post('/api/payment/initiate', async (req, res) => {
    const { phoneNumber, amount } = req.body;
    const result = await triggerSTKPush(phoneNumber, amount);
    res.json(result);
});

app.get('/api/payment/status/:checkoutRequestId', (req, res) => {
    const { checkoutRequestId } = req.params;
    const data = paymentStore.get(checkoutRequestId);
    if (!data) return res.json({ status: 'NOT_FOUND' });
    res.json(data);
});

// 5. LangChain Tools
const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Search for available bus routes.",
  schema: z.object({ origin: z.string(), destination: z.string() }),
  func: async ({ origin, destination }) => {
     let matches = INTERNAL_ROUTES.filter(r => 
        r.origin.toLowerCase().includes(origin.toLowerCase()) && 
        r.destination.toLowerCase().includes(destination.toLowerCase())
     );
     if (matches.length === 0) return "No direct route found.";
     return JSON.stringify(matches);
  },
});

const initiatePaymentTool = new DynamicStructuredTool({
  name: "initiatePayment",
  description: "Start M-Pesa payment. Returns a CheckoutRequestID to verify later.",
  schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
  func: async ({ phoneNumber, amount }) => {
     const res = await triggerSTKPush(phoneNumber, amount);
     if (res.success) {
         return JSON.stringify({ 
             status: 'initiated', 
             checkoutRequestId: res.checkoutRequestId,
             message: "STK Push sent. Ask user to enter PIN." 
         });
     }
     return JSON.stringify(res);
  },
});

const verifyPaymentTool = new DynamicStructuredTool({
    name: "verifyPayment",
    description: "Check if payment was successful using CheckoutRequestID or Phone Number.",
    schema: z.object({ checkoutRequestId: z.string() }),
    func: async ({ checkoutRequestId }) => {
        const data = paymentStore.get(checkoutRequestId);
        if (!data) return JSON.stringify({ status: 'NOT_FOUND', message: "Transaction not found." });
        
        if (data.status === 'COMPLETED') {
            return JSON.stringify({ status: 'COMPLETED', receipt: data.receipt, message: "Payment Confirmed." });
        } else if (data.status === 'FAILED') {
            return JSON.stringify({ status: 'FAILED', reason: data.failureReason || "User cancelled or failed." });
        } else {
            return JSON.stringify({ status: 'PENDING', message: "User has not entered PIN yet." });
        }
    }
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Book ticket. REQUIRED: Must have verified payment 'COMPLETED' status first.",
  schema: z.object({ passengerName: z.string(), routeId: z.string(), phoneNumber: z.string(), seatNumber: z.number().optional() }),
  func: async ({ passengerName, routeId, phoneNumber, seatNumber }) => {
    // 1. Generate Ticket
    const seat = seatNumber || Math.floor(Math.random() * 40) + 1;
    const { ticketId, qrCodeUrl, signature } = generateSecureTicket(passengerName, routeId, seat);
    
    // 2. Register Passenger for Geofence Tracking
    if (!activeTrips.has(routeId)) {
        activeTrips.set(routeId, { passengers: new Set(), lastStop: null });
    }
    const trip = activeTrips.get(routeId);
    trip.passengers.add(phoneNumber);
    
    // Convert formatted phone if needed (ensure it has format for WhatsApp)
    let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
    trip.passengers.add(formattedPhone);

    console.log(`[Booking] Registered ${formattedPhone} on ${routeId} for tracking.`);

    return JSON.stringify({ 
        status: 'success', 
        ticketId, 
        qrCodeUrl, 
        securitySignature: signature,
        message: 'Secure Ticket Generated. You will receive travel updates.' 
    });
  },
});

const logComplaintTool = new DynamicStructuredTool({
  name: "logComplaint",
  description: "Log a customer complaint. You must ask for the date/time of incident and route details if they are not provided.",
  schema: z.object({ 
    issue: z.string(), 
    severity: z.enum(['low', 'medium', 'high']), 
    customerName: z.string(),
    incidentDate: z.string().describe("When the incident happened"),
    routeInfo: z.string().optional().describe("Which route or bus was involved")
  }),
  func: async ({ issue, severity, customerName, incidentDate, routeInfo }) => {
      // In a real DB we would save this. For now just ack.
      console.log(`[Complaint] ${customerName} (${severity}): ${issue} @ ${incidentDate} on ${routeInfo || 'N/A'}`);
      return JSON.stringify({ status: 'logged', ticketId: `CMP-${Date.now()}` });
  },
});

const trackBusTool = new DynamicStructuredTool({
    name: "trackBus",
    description: "Get real-time bus location.",
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => JSON.stringify(await fetchRealBusLocation(query))
});

const tools = [searchRoutesTool, initiatePaymentTool, verifyPaymentTool, bookTicketTool, trackBusTool, logComplaintTool];

// --- AI Agent ---
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY || "dummy", 
  temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a human customer service rep at Ena Coach.
   
   CURRENT TIME: {current_time}
   USER NAME: {user_name}
   
   PAYMENT FLOW (STRICT):
   1. Agree on Route & Price.
   2. Ask for Phone Number.
   3. Call 'initiatePayment'.
   4. TELL USER: "I have sent a payment prompt to your phone. Please enter your PIN."
   5. WAIT for user to say "Done" or "I paid".
   6. Call 'verifyPayment' with the 'checkoutRequestId' you got from step 3.
   7. IF 'verifyPayment' returns 'COMPLETED': Call 'bookTicket'.
   8. IF 'verifyPayment' returns 'PENDING': Tell user "It hasn't reflected yet. Please wait a moment."
   9. IF 'verifyPayment' returns 'FAILED': Tell user "Payment failed: [Reason]. Should we try again?"
   
   COMPLAINT HANDLING:
   - When logging a complaint, you MUST ask for the **date/time of the incident** and the **specific route or bus details** if the user has not provided them.
   - Only call 'logComplaint' once you have these details, or if the user explicitly says they don't remember the route.
   - You can use the 'user_name' to fill in the customer name if needed, or ask them.
   
   SECURITY:
   - NEVER book a ticket without 'verifyPayment' returning COMPLETED.
   `],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"], // CRITICAL FIX: This allows LangChain to inject tool outputs
]);

// CRITICAL FIX: Explicitly bind tools to the LLM and await the agent creation
const agent = await createToolCallingAgent({ 
    llm: llm.bindTools(tools), 
    tools, 
    prompt 
});

const agentExecutor = new AgentExecutor({ agent, tools, verbose: true });

// --- Server Routes ---

// Webhook for Evolution API (WhatsApp)
app.post('/webhook', (req, res) => {
  res.status(200).send('OK');
  handleIncomingMessage(req.body).catch(err => console.error(err));
});

// Bus Location Proxy
app.get('/api/bus-location/:query', async (req, res) => {
    const data = await fetchRealBusLocation(req.params.query);
    res.json(data);
});

// Helper for WhatsApp
async function handleIncomingMessage(payload) {
  if (payload.type !== 'messages.upsert') return;
  const { key, message, pushName } = payload.data;
  if (key.fromMe || !message) return;
  const text = message.conversation || message.extendedTextMessage?.text;
  if (!text) return;
  
  try {
    const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    const user = pushName || "Customer";
    const result = await agentExecutor.invoke({ 
        input: text, 
        current_time: now,
        user_name: user
    });
    await sendWhatsAppMessage(key.remoteJid, result.output);
  } catch (error) { console.error("Agent Error:", error); }
}

async function sendWhatsAppMessage(remoteJid, text) {
  // 1. Capture in Memory for Admin Dashboard Simulator
  debugOutbox.unshift({
      to: remoteJid,
      text: text,
      timestamp: Date.now()
  });
  if (debugOutbox.length > 50) debugOutbox.pop();

  // 2. Send to Real Evolution API (if configured)
  if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) {
      console.log(`[Simulator] Message to ${remoteJid}: ${text}`);
      return;
  }
  
  const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;
  try {
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_TOKEN },
        body: JSON.stringify({ number: remoteJid, text: text })
    });
  } catch(e) { console.error("API Send Error:", e); }
}

// Serve Static Frontend
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/webhook') || req.path.startsWith('/api') || req.path.startsWith('/callback')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Server
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));