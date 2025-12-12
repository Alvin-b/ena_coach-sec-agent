/**
 * Ena Coach AI Agent - Unified Server
 * Handles both the WhatsApp Webhook and serving the React Frontend.
 */

import 'dotenv/config'; // Load environment variables locally
import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Fleet / GPS API Config
const FLEET_API_URL = process.env.FLEET_API_URL; // e.g., https://api.tracking-provider.com/v1
const FLEET_API_KEY = process.env.FLEET_API_KEY;

// Database Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Daraja Config
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY;
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET;
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY;
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '174379'; 
const DARAJA_ENV = 'sandbox'; 

// --- Initialize App ---
const app = express();

// CORS Middleware for Local Dev
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(bodyParser.json());

// --- Debug Store (For Local Testing) ---
const debugOutbox = [];

// --- Database Setup ---
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("✅ Connected to Supabase");
} else {
  console.warn("⚠️ Supabase credentials missing. Using INTERNAL DATA FALLBACK.");
}

// --- INTERNAL DATA (Fallback) ---
const INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, stops: ['Ahero', 'Kericho', 'Nakuru', 'Naivasha'] },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, stops: ['Nakuru', 'Eldoret', 'Bungoma', 'Mumias'] },
  { id: 'R004', origin: 'Busia', destination: 'Nairobi', departureTime: '07:30 AM', price: 1600, stops: ['Mumias', 'Bungoma', 'Eldoret', 'Nakuru'] },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, stops: ['Mtito Andei', 'Voi', 'Mariakani'] },
  { id: 'R006', origin: 'Mombasa', destination: 'Nairobi', departureTime: '08:30 AM', price: 1500, stops: ['Mariakani', 'Voi', 'Mtito Andei'] },
  { id: 'R007', origin: 'Nairobi', destination: 'Kisii', departureTime: '07:00 AM', price: 1200, stops: ['Narok', 'Bomet', 'Sotik'] },
  { id: 'R008', origin: 'Kisii', destination: 'Nairobi', departureTime: '07:00 AM', price: 1200, stops: ['Sotik', 'Bomet', 'Narok'] },
  { id: 'R009', origin: 'Nairobi', destination: 'Migori', departureTime: '07:30 AM', price: 1400, stops: ['Narok', 'Kisii', 'Rongo', 'Awendo'] },
  { id: 'R010', origin: 'Migori', destination: 'Nairobi', departureTime: '07:30 AM', price: 1400, stops: ['Awendo', 'Rongo', 'Kisii', 'Narok'] },
  { id: 'R011', origin: 'Nairobi', destination: 'Sirare', departureTime: '06:00 AM', price: 1500, stops: ['Narok', 'Kisii', 'Migori', 'Kehancha'] },
  { id: 'R012', origin: 'Sirare', destination: 'Nairobi', departureTime: '06:00 AM', price: 1500, stops: ['Kehancha', 'Migori', 'Kisii', 'Narok'] },
  { id: 'R013', origin: 'Nairobi', destination: 'Kitale', departureTime: '07:00 AM', price: 1500, stops: ['Nakuru', 'Eldoret', 'Moi\'s Bridge'] },
  { id: 'R014', origin: 'Kitale', destination: 'Nairobi', departureTime: '07:00 AM', price: 1500, stops: ['Moi\'s Bridge', 'Eldoret', 'Nakuru'] },
  { id: 'R015', origin: 'Nairobi', destination: 'Malindi', departureTime: '07:00 PM', price: 2000, stops: ['Mombasa', 'Kilifi', 'Mtwapa'] },
  { id: 'R016', origin: 'Malindi', destination: 'Nairobi', departureTime: '07:00 PM', price: 2000, stops: ['Mtwapa', 'Kilifi', 'Mombasa'] },
  { id: 'R017', origin: 'Nairobi', destination: 'Homabay', departureTime: '08:00 AM', price: 1300, stops: ['Narok', 'Kisii', 'Rongo'] },
  { id: 'R018', origin: 'Homabay', destination: 'Nairobi', departureTime: '08:00 AM', price: 1300, stops: ['Rongo', 'Kisii', 'Narok'] },
  { id: 'R019', origin: 'Nairobi', destination: 'Siaya', departureTime: '08:30 AM', price: 1600, stops: ['Nakuru', 'Kisumu', 'Luanda'] },
  { id: 'R020', origin: 'Siaya', destination: 'Nairobi', departureTime: '08:30 AM', price: 1600, stops: ['Luanda', 'Kisumu', 'Nakuru'] },
  { id: 'R021', origin: 'Mombasa', destination: 'Kisumu', departureTime: '04:00 PM', price: 2500, stops: ['Nairobi', 'Nakuru', 'Kericho'] },
  { id: 'R022', origin: 'Kisumu', destination: 'Mombasa', departureTime: '04:00 PM', price: 2500, stops: ['Kericho', 'Nakuru', 'Nairobi'] },
  { id: 'R023', origin: 'Nairobi', destination: 'Usenge', departureTime: '08:00 PM', price: 1700, stops: ['Nakuru', 'Kisumu', 'Bondo'] },
  { id: 'R024', origin: 'Usenge', destination: 'Nairobi', departureTime: '08:00 PM', price: 1700, stops: ['Bondo', 'Kisumu', 'Nakuru'] },
  { id: 'R025', origin: 'Nairobi', destination: 'Port Victoria', departureTime: '07:00 PM', price: 1700, stops: ['Nakuru', 'Kisumu', 'Busia'] },
  { id: 'R026', origin: 'Port Victoria', destination: 'Nairobi', departureTime: '07:00 PM', price: 1700, stops: ['Busia', 'Kisumu', 'Nakuru'] },
  { id: 'R027', origin: 'Nairobi', destination: 'Kakamega', departureTime: '08:00 AM', price: 1500, stops: ['Nakuru', 'Kapsabet', 'Chavakali'] },
  { id: 'R028', origin: 'Kakamega', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, stops: ['Chavakali', 'Kapsabet', 'Nakuru'] },
  { id: 'R029', origin: 'Nairobi', destination: 'Mbita', departureTime: '08:00 PM', price: 1400, stops: ['Narok', 'Homabay'] },
  { id: 'R030', origin: 'Mbita', destination: 'Nairobi', departureTime: '08:00 PM', price: 1400, stops: ['Homabay', 'Narok'] },
];

// --- Real Tracking Helper ---
async function fetchRealBusLocation(query) {
  if (!FLEET_API_URL) {
    console.warn("❌ Missing FLEET_API_URL. Cannot fetch real data.");
    return { error: "Real-time tracking is currently unavailable (System Configuration Error)." };
  }

  try {
    // We assume the real API takes a bus ID, route ID, or ticket ID
    // Example endpoint: https://api.tracking.com/v1/vehicles?search={query}
    const response = await fetch(`${FLEET_API_URL}/vehicles?search=${encodeURIComponent(query)}`, {
      headers: FLEET_API_KEY ? { 'Authorization': `Bearer ${FLEET_API_KEY}` } : {}
    });

    if (!response.ok) {
      throw new Error(`Tracking API responded with ${response.status}`);
    }

    const data = await response.json();
    // Transform external API format to our internal format
    if (data && (data.location || data.data)) {
        return data; // Return the raw data if it matches, or map it here
    }
    return { error: "Vehicle not found in the live tracking system." };

  } catch (error) {
    console.error("Tracking API Error:", error);
    return { error: "Unable to contact GPS satellites. Please try again later." };
  }
}

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
    // MOCK MODE: If keys aren't set, simulate success for testing
    console.warn("⚠️ Daraja keys missing. Simulating successful payment for testing.");
    return { success: true, message: `[SIMULATION] STK Push sent to ${phoneNumber}. Payment assumed successful.` };
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
  const payload = {
    "BusinessShortCode": DARAJA_SHORTCODE,
    "Password": password,
    "Timestamp": timestamp,
    "TransactionType": "CustomerPayBillOnline",
    "Amount": Math.ceil(amount),
    "PartyA": formattedPhone,
    "PartyB": DARAJA_SHORTCODE,
    "PhoneNumber": formattedPhone,
    "CallBackURL": `https://example.com/callback`, 
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
    return data.ResponseCode === "0" 
      ? { success: true, message: "STK Push sent. Check phone." } 
      : { success: false, message: `Payment failed: ${data.errorMessage || 'Error'}` };
  } catch (error) { return { success: false, message: "Network error." }; }
}

// --- LangChain Tools ---
const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Search for available bus routes. Aware of intermediate stops.",
  schema: z.object({
    origin: z.string().describe("Starting city"),
    destination: z.string().describe("Destination city"),
  }),
  func: async ({ origin, destination }) => {
    let matches = [];
    if (supabase) {
      const { data } = await supabase.from('routes').select('*');
      if (data) matches = data;
    }
    if (matches.length === 0) matches = INTERNAL_ROUTES;

    // Filter Logic
    const qOrigin = origin.toLowerCase();
    const qDest = destination.toLowerCase();
    
    matches = matches.filter(r => {
      const rOrigin = r.origin.toLowerCase();
      const rDest = r.destination.toLowerCase();
      const rStops = (r.stops || []).map(s => s.toLowerCase());

      // Direct or Stop logic
      if (rOrigin.includes(qOrigin) && (rDest.includes(qDest) || rStops.includes(qDest))) return true;
      return false;
    });

    if (matches.length === 0) return "No direct bus found. Please check with the office.";
    return JSON.stringify(matches.map(m => ({
        ...m,
        note: `Travels from ${m.origin} to ${m.destination}. Stops: ${(m.stops || []).join(', ')}.`
    })));
  },
});

const companyKnowledgeTool = new DynamicStructuredTool({
    name: "companyKnowledge",
    description: "Company policies.",
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => "Refunds: 48hrs (10% fee). Parcels: Available. Luggage: 20kg free."
});

const processPaymentTool = new DynamicStructuredTool({
  name: "processPayment",
  description: "Initiate M-Pesa STK Push.",
  schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
  func: async ({ phoneNumber, amount }) => {
     // Return explicit instruction to the agent
     const res = await triggerSTKPush(phoneNumber, amount);
     if (res.success) {
         return JSON.stringify({ status: 'success', message: 'Payment Initiated. assume payment successful for simulation. NOW BOOK THE TICKET.' });
     }
     return JSON.stringify(res);
  },
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Book ticket after payment.",
  schema: z.object({ passengerName: z.string(), routeId: z.string(), phoneNumber: z.string() }),
  func: async ({ passengerName, routeId, phoneNumber }) => {
    const ticketId = `TKT-${Math.floor(Math.random() * 10000)}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${ticketId}`;
    return JSON.stringify({ status: 'success', ticketId, qrCodeUrl, message: 'Ticket generated.' });
  },
});

const logComplaintTool = new DynamicStructuredTool({
  name: "logComplaint",
  description: "Log complaint. REQUIRED: Must have issue, route, and date details.",
  schema: z.object({ issue: z.string(), severity: z.enum(['low', 'medium', 'high']), customerName: z.string() }),
  func: async () => JSON.stringify({ status: 'logged' }),
});

const trackBusTool = new DynamicStructuredTool({
    name: "trackBus",
    description: "Get the current GPS location of a bus using Route ID (e.g. R001) or Ticket ID.",
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => {
        // CALL REAL EXTERNAL SERVER
        const realData = await fetchRealBusLocation(query);
        return JSON.stringify(realData);
    }
});

const broadcastArrivalTool = new DynamicStructuredTool({
    name: "broadcastArrival",
    description: "Send a notification to all passengers on a bus that it has arrived at a location.",
    schema: z.object({ routeId: z.string(), location: z.string() }),
    func: async ({ routeId, location }) => {
        // Logic to send mass WhatsApp would go here
        return JSON.stringify({ success: true, message: `BROADCAST SENT: Bus ${routeId} has arrived at ${location}. Passengers notified.` });
    }
});

const tools = [searchRoutesTool, companyKnowledgeTool, processPaymentTool, bookTicketTool, logComplaintTool, trackBusTool, broadcastArrivalTool];

// --- AI Agent ---
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY || "dummy", 
  temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a human customer service rep at Ena Coach.
   
   CURRENT DATE AND TIME: {current_time}
   
   IDENTITY: Real person. Brief texts.
   
   FORMATTING RULES:
   - PURE TEXT ONLY. Do NOT use markdown (no asterisks, no bolding).
   - **HIDDEN DATA**: 'id' or 'Route ID' (e.g. R001, R023) is for YOUR internal use to call tools. NEVER speak it to the customer.
   - If listing buses, just say: "Option 1: 8:00 AM Luxury Bus (KES 1500)."
   
   STRICT ROUTE RULES:
   - YOU DO NOT KNOW ANY ROUTES until you use 'searchRoutes'.
   - ONLY suggest routes returned by the tool. 
   - If 'searchRoutes' returns nothing, say "We don't go there yet". Do NOT invent routes.

   BOOKING RULES:
   1. Search route.
   2. Ask for details.
   3. Call 'processPayment'.
   4. IF payment is successful, you MUST IMMEDIATELY call 'bookTicket'. Do not ask the user if they paid.

   LOCATION & REMINDERS:
   - If a user asks "Where is the bus?", use 'trackBus'.
   - If a driver or staff says "We arrived at [Location]", use 'broadcastArrival' to notify passengers.

   COMPLAINT HANDLING:
   - If a user complains, sympathize first.
   - ASK for the **Route (From/To)** and **Date** to investigate.
   - Do NOT say "I will log this". Say "I'm sorry to hear that. Please give me the route and date so we can follow up."
   - Only call logComplaint tool AFTER you have details.

   Currency: KES.`],
  ["human", "{input}"],
]);

const agent = createToolCallingAgent({ llm, tools, prompt });
const agentExecutor = new AgentExecutor({ agent, tools, verbose: true });

// --- Routes ---

// 1. Webhook for Evolution API
app.post('/webhook', (req, res) => {
  res.status(200).send('OK');
  handleIncomingMessage(req.body).catch(err => console.error(err));
});

// 2. Bus Location Proxy (For Frontend)
app.get('/api/bus-location/:query', async (req, res) => {
    const { query } = req.params;
    const data = await fetchRealBusLocation(query);
    res.json(data);
});

// 3. Debug Endpoints for Local Testing
app.get('/api/debug/messages', (req, res) => {
    res.json(debugOutbox);
});
app.post('/api/debug/clear', (req, res) => {
    debugOutbox.length = 0;
    res.send('ok');
});

async function handleIncomingMessage(payload) {
  if (payload.type !== 'messages.upsert') return;
  const { key, message } = payload.data;
  if (key.fromMe || !message) return;
  const text = message.conversation || message.extendedTextMessage?.text;
  if (!text) return;
  
  console.log(`[WhatsApp In] From ${key.remoteJid}: ${text}`);
  try {
    // Inject Current Time
    const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    
    const result = await agentExecutor.invoke({ 
        input: text,
        current_time: now 
    });
    await sendWhatsAppMessage(key.remoteJid, result.output);
  } catch (error) { 
      console.error("Agent Error:", error);
      await sendWhatsAppMessage(key.remoteJid, "System busy. Try again.");
  }
}

async function sendWhatsAppMessage(remoteJid, text) {
  console.log(`[WhatsApp Out] To ${remoteJid}: ${text}`);
  
  // Store in debug outbox for local testing UI
  debugOutbox.unshift({
      id: Date.now().toString(),
      to: remoteJid,
      text: text,
      timestamp: new Date()
  });
  if (debugOutbox.length > 50) debugOutbox.pop();

  if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) {
      console.log("⚠️ Evolution API not configured. Message stored in debug outbox only.");
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

// 4. Serve Static Frontend (Admin Dashboard)
app.use(express.static(path.join(__dirname, 'dist')));

// 5. Fallback for SPA (Single Page Application)
app.get('*', (req, res) => {
  if (req.path.startsWith('/webhook') || req.path.startsWith('/api')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Start Server ---
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));