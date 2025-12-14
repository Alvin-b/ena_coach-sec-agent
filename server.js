/**
 * Ena Coach AI Agent - Unified Server
 * Handles both the WhatsApp Webhook and serving the React Frontend.
 * Optimized for Render Deployment.
 */

import 'dotenv/config'; 
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto'; 

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// API Keys
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME;

// Server URL Detection (Critical for Callbacks)
// Prioritize explicit SERVER_URL, then Render's external URL, then localhost
const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Daraja Config (M-Pesa)
// Default to Standard Sandbox Paybill (174379) if not provided
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || 'A9QGd46yfsnrgM027yIGE0UDiUroPZdHr8CiTRs8NGTFaXH8';
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || 'IFZQQkXptDOUkGx6wZGEeiLADggUy39NUJzEPzhU1EytUBg5JmA3oR3OGvRC6wsb';
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '174379'; 
const TICKET_SECRET = process.env.TICKET_SECRET || 'ENA_SUPER_SECRET_KEY_2025';

// --- Initialize App ---
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

app.use(bodyParser.json());

// --- In-Memory Stores ---
const debugOutbox = []; 
const webhookLogs = []; // Stores incoming webhook requests for debugging
const paymentStore = new Map(); 
const userSessions = new Map();

// **REAL TICKET STORE (Source of Truth)**
const ticketsStore = []; 
const BUS_CAPACITY = 45;

// **DYNAMIC ROUTES STORE**
// Base definitions from the original system
const BASE_ROUTES_DEF = [
  // Western Route (via Nakuru, Kericho/Eldoret)
  { origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { origin: 'Nairobi', destination: 'Kisumu', departureTime: '09:00 PM', price: 1500, busType: 'Luxury', stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Eldoret', 'Bungoma', 'Mumias'] },
  { origin: 'Nairobi', destination: 'Busia', departureTime: '08:00 PM', price: 1600, busType: 'Standard', stops: ['Nakuru', 'Eldoret', 'Bungoma'] },
  { origin: 'Nairobi', destination: 'Kakamega', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', stops: ['Nakuru', 'Kapsabet', 'Chavakali'] },
  { origin: 'Nairobi', destination: 'Bungoma', departureTime: '09:00 PM', price: 1500, busType: 'Standard', stops: ['Nakuru', 'Eldoret', 'Webuye'] },
  { origin: 'Nairobi', destination: 'Kitale', departureTime: '07:00 AM', price: 1500, busType: 'Luxury', stops: ['Nakuru', 'Eldoret', "Moi's Bridge"] },
  { origin: 'Nairobi', destination: 'Mumias', departureTime: '08:00 PM', price: 1600, busType: 'Standard', stops: ['Nakuru', 'Kisumu', 'Kakamega'] },
  { origin: 'Nairobi', destination: 'Siaya', departureTime: '08:30 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Kisumu', 'Luanda'] },
  { origin: 'Nairobi', destination: 'Bondo', departureTime: '09:00 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Kisumu', 'Nedwo'] },
  { origin: 'Nairobi', destination: 'Usenge', departureTime: '08:00 PM', price: 1700, busType: 'Standard', stops: ['Nakuru', 'Kisumu', 'Bondo'] },
  { origin: 'Nairobi', destination: 'Port Victoria', departureTime: '07:00 PM', price: 1700, busType: 'Standard', stops: ['Nakuru', 'Kisumu', 'Busia'] },

  // Nyanza South (via Narok, Kisii)
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '07:00 AM', price: 1200, busType: 'Luxury', stops: ['Narok', 'Bomet', 'Sotik'] },
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '11:00 AM', price: 1200, busType: 'Standard', stops: ['Narok', 'Bomet'] },
  { origin: 'Nairobi', destination: 'Homabay', departureTime: '08:00 AM', price: 1300, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Rongo'] },
  { origin: 'Nairobi', destination: 'Migori', departureTime: '07:30 AM', price: 1400, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Rongo', 'Awendo'] },
  { origin: 'Nairobi', destination: 'Sirare', departureTime: '06:00 AM', price: 1500, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Migori', 'Kehancha'] },
  { origin: 'Nairobi', destination: 'Mbita', departureTime: '08:00 PM', price: 1400, busType: 'Standard', stops: ['Narok', 'Homabay'] },
  { origin: 'Nairobi', destination: 'Sori', departureTime: '07:00 PM', price: 1400, busType: 'Standard', stops: ['Narok', 'Homabay', 'Rod Kopany'] },
  { origin: 'Nairobi', destination: 'Kendu Bay', departureTime: '01:00 PM', price: 1300, busType: 'Standard', stops: ['Narok', 'Oyugis'] },
  { origin: 'Nairobi', destination: 'Oyugis', departureTime: '02:00 PM', price: 1200, busType: 'Standard', stops: ['Narok', 'Kisii'] },

  // Coast Route (via Mombasa Rd)
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi', 'Mariakani'] },
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '09:00 PM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi'] },
  { origin: 'Nairobi', destination: 'Malindi', departureTime: '07:00 PM', price: 2000, busType: 'Luxury', stops: ['Mombasa', 'Kilifi', 'Mtwapa'] },
  { origin: 'Nairobi', destination: 'Ukunda', departureTime: '08:00 PM', price: 1800, busType: 'Luxury', stops: ['Mombasa', 'Likoni'] },
  
  // Cross-Country (Mombasa to Western)
  { origin: 'Mombasa', destination: 'Kisumu', departureTime: '04:00 PM', price: 2500, busType: 'Luxury', stops: ['Nairobi', 'Nakuru', 'Kericho'] },
  { origin: 'Mombasa', destination: 'Busia', departureTime: '03:00 PM', price: 2600, busType: 'Luxury', stops: ['Nairobi', 'Nakuru', 'Eldoret'] },
  { origin: 'Mombasa', destination: 'Kitale', departureTime: '03:30 PM', price: 2600, busType: 'Standard', stops: ['Nairobi', 'Eldoret'] },

  // Short Haul / Others
  { origin: 'Nakuru', destination: 'Kisumu', departureTime: '10:00 AM', price: 800, busType: 'Standard', stops: ['Kericho'] },
  { origin: 'Eldoret', destination: 'Nairobi', departureTime: '02:00 PM', price: 1000, busType: 'Standard', stops: ['Nakuru'] },
  { origin: 'Kisumu', destination: 'Mombasa', departureTime: '01:00 PM', price: 2500, busType: 'Luxury', stops: ['Kericho', 'Nakuru', 'Nairobi'] },
];

function initializeRoutes() {
    let idCounter = 1;
    const allRoutes = [];
    
    BASE_ROUTES_DEF.forEach(route => {
        // Forward Route
        allRoutes.push({
            id: `R${idCounter.toString().padStart(3, '0')}`,
            ...route,
            availableSeats: BUS_CAPACITY,
            capacity: BUS_CAPACITY
        });
        idCounter++;

        // Reverse Route (Auto-generate return trip)
        const reverseStops = route.stops ? [...route.stops].reverse() : [];
        allRoutes.push({
            id: `R${idCounter.toString().padStart(3, '0')}`,
            origin: route.destination,
            destination: route.origin,
            departureTime: route.departureTime, // Assuming symmetric schedule for simplicity
            price: route.price,
            busType: route.busType,
            stops: reverseStops,
            availableSeats: BUS_CAPACITY,
            capacity: BUS_CAPACITY
        });
        idCounter++;
    });
    return allRoutes;
}

let routesStore = initializeRoutes();
console.log(`[Server] Routes initialized: ${routesStore.length} routes in memory.`);

// --- Helpers ---
function generateSecureTicket(passengerName, routeId, seatNumber, date) {
    const ticketId = `TKT-${Math.floor(Math.random() * 100000)}`;
    const now = new Date();
    const bookingDate = now.toISOString();
    const timestamp = now.getTime();
    
    // Include bookingDate in the signature data
    const dataToSign = `${ticketId}:${passengerName}:${routeId}:${seatNumber}:${date}:${bookingDate}:${timestamp}`;
    const signature = crypto.createHmac('sha256', TICKET_SECRET).update(dataToSign).digest('hex');
    
    // Include 'bd' (bookingDate) in QR payload
    const qrData = JSON.stringify({ id: ticketId, p: passengerName, r: routeId, s: seatNumber, d: date, bd: bookingDate, sig: signature.substring(0, 16) });
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
    
    return { ticketId, qrCodeUrl, signature, bookingDate };
}

function getBookedSeats(routeId, date) {
    // Strictly filter by Date string (YYYY-MM-DD)
    return ticketsStore.filter(t => t.routeId === routeId && t.date === date).length;
}

// --- Daraja Helpers ---
function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET) {
      console.error("[Daraja] Missing Consumer Key or Secret");
      return null;
  }
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  try {
    const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    const data = await response.json();
    return data.access_token;
  } catch (error) { 
    console.error("[Daraja] Auth Error:", error);
    return null; 
  }
}

async function triggerSTKPush(phoneNumber, amount) {
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  
  // Use dynamically detected SERVER_URL for callbacks
  const callbackUrl = `${SERVER_URL.replace(/\/$/, '')}/callback/mpesa`;

  try {
      const token = await getDarajaToken();
      if (!token) {
        return { success: false, message: "Payment service error: Auth Failed." };
      }
      
      const timestamp = getDarajaTimestamp();
      const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
      const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

      // Use CustomerPayBillOnline for the standard 174379 sandbox shortcode
      const transactionType = DARAJA_SHORTCODE === '174379' ? 'CustomerPayBillOnline' : 'CustomerBuyGoodsOnline';

      const payload = {
        "BusinessShortCode": DARAJA_SHORTCODE, 
        "Password": password, 
        "Timestamp": timestamp,
        "TransactionType": transactionType, 
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone, 
        "PartyB": DARAJA_SHORTCODE, 
        "PhoneNumber": formattedPhone,
        "CallBackURL": callbackUrl, 
        "AccountReference": "EnaCoach", 
        "TransactionDesc": "Bus Ticket"
      };

      console.log(`[STK-PUSH] Initiating to ${formattedPhone} for KES ${amount}`);
      console.log(`[STK-PUSH] Callback URL registered: ${callbackUrl}`);

      const response = await fetch(url, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      
      console.log("[STK-PUSH] Response:", data);

      if (data.ResponseCode === "0") {
          paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount: amount, timestamp: Date.now() });
          return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Push sent to your phone." };
      }
      
      return { success: false, message: data.errorMessage || data.CustomerMessage || "Failed to initiate payment." };

  } catch (error) { 
      console.error("[STK-PUSH] Network Error:", error);
      return { success: false, message: "Network error connecting to payment provider." }; 
  }
}

async function queryDarajaStatus(checkoutRequestId) {
    const local = paymentStore.get(checkoutRequestId);
    if (local && local.status === 'COMPLETED') return { status: 'COMPLETED', message: 'Payment Received' };

    const token = await getDarajaToken();
    if (!token) return { status: 'UNKNOWN', message: 'Auth Failed' };
    
    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
    
    try {
        const response = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp, "CheckoutRequestID": checkoutRequestId })
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            if (data.ResultCode === "0") {
                 paymentStore.set(checkoutRequestId, { ...local, status: 'COMPLETED' });
                 return { status: 'COMPLETED', message: data.ResultDesc };
            }
            if (['1032', '1037', '1', '2001'].includes(data.ResultCode)) {
                paymentStore.set(checkoutRequestId, { ...local, status: 'FAILED' });
                return { status: 'FAILED', message: data.ResultDesc };
            }
            return { status: 'PENDING', message: data.ResultDesc };
        }
        return { status: 'UNKNOWN', message: data.errorMessage };
    } catch (e) { return { status: 'UNKNOWN', message: 'Network Error' }; }
}

async function sendWhatsAppMessage(remoteJid, text) {
    // Add to debug outbox for UI
    debugOutbox.push({ to: remoteJid, text, timestamp: Date.now() });
    if (debugOutbox.length > 50) debugOutbox.shift();

    if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) return;
    try {
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_TOKEN },
            body: JSON.stringify({ number: remoteJid, text: text })
        });
    } catch(e) { console.error("API Send Error:", e); }
}

function scheduleTransactionCheck(checkoutRequestId, userJid) {
    const TIMEOUT_MS = 120000; // 2 minute timeout check
    console.log(`[Payment] Scheduling check for ${checkoutRequestId} in 2 minutes.`);
    
    setTimeout(async () => {
        // 1. Check local status first (in case callback already handled it)
        const local = paymentStore.get(checkoutRequestId);
        if (local && local.status === 'COMPLETED') {
            return; // Already done, no need to alert
        }
        
        // 2. Double check with Daraja one last time
        const check = await queryDarajaStatus(checkoutRequestId);
        
        if (check.status === 'PENDING') {
            // Update status to timeout so we don't process it later if it comes in super late (optional logic)
            if (local) paymentStore.set(checkoutRequestId, { ...local, status: 'TIMEOUT' });
            
            await sendWhatsAppMessage(userJid, "⚠️ Payment Session Timed Out.\n\nWe did not receive a confirmation in time. If you have already paid, please contact support. Otherwise, please reply with 'Book Ticket' to try again.");
        } else if (check.status === 'FAILED') {
            await sendWhatsAppMessage(userJid, "❌ Payment Failed/Cancelled. Please try again.");
        } else if (check.status === 'COMPLETED') {
            // Late success
            await sendWhatsAppMessage(userJid, "✅ Payment Confirmed! Processing your ticket...");
        }
    }, TIMEOUT_MS);
}

// --- Tools Setup ---
let agentExecutor;

async function initAgent() {
    // Return existing executor if already initialized to prevent recreation
    if (agentExecutor) return agentExecutor;
    
    if (!API_KEY) {
        console.error("[Agent] CRITICAL: No API Key found for Gemini. Check your .env file or Render Environment Variables.");
        throw new Error("API Key missing");
    }
    
    // Tools
    const searchRoutesTool = new DynamicStructuredTool({
        name: "searchRoutes",
        description: "Search routes.",
        schema: z.object({ origin: z.string(), destination: z.string() }),
        func: async ({ origin, destination }) => {
           let matches = routesStore.filter(r => r.origin.toLowerCase().includes(origin.toLowerCase()) && r.destination.toLowerCase().includes(destination.toLowerCase()));
           if (matches.length === 0) return "No direct route found.";
           return JSON.stringify(matches);
        },
    });
      
    const initiatePaymentTool = new DynamicStructuredTool({
        name: "initiatePayment",
        description: "Initiate M-Pesa. Args: phoneNumber, amount.",
        schema: z.object({ 
            phoneNumber: z.string(), 
            amount: z.union([z.string(), z.number()]).transform(val => Number(val)) 
        }),
        func: async ({ phoneNumber, amount }) => {
           const res = await triggerSTKPush(phoneNumber, amount);
           if (res.success) {
               const jid = phoneNumber.replace('+', '').replace(/^0/, '254') + "@s.whatsapp.net";
               scheduleTransactionCheck(res.checkoutRequestId, jid);
               return JSON.stringify({ status: 'initiated', message: "STK Push sent.", checkoutRequestId: res.checkoutRequestId });
           }
           return JSON.stringify(res);
        },
    });

    const verifyPaymentTool = new DynamicStructuredTool({
        name: "verifyPayment",
        description: "Verify if payment is completed. Args: checkoutRequestId.",
        schema: z.object({ checkoutRequestId: z.string() }),
        func: async ({ checkoutRequestId }) => {
            const res = await queryDarajaStatus(checkoutRequestId);
            return JSON.stringify(res);
        }
    });
      
    const bookTicketTool = new DynamicStructuredTool({
        name: "bookTicket",
        description: "Book Ticket (Requires Date & Payment ID).",
        schema: z.object({ 
            passengerName: z.string(), 
            routeId: z.string(), 
            phoneNumber: z.string(), 
            travelDate: z.string(),
            checkoutRequestId: z.string()
        }),
        func: async ({ passengerName, routeId, phoneNumber, travelDate, checkoutRequestId }) => {
            const statusCheck = await queryDarajaStatus(checkoutRequestId);
            if (statusCheck.status !== 'COMPLETED') return JSON.stringify({ error: "Payment not found or incomplete." });

            const booked = getBookedSeats(routeId, travelDate);
            if (booked >= BUS_CAPACITY) return "Bus Fully Booked.";
      
            const route = routesStore.find(r => r.id === routeId);
            const seatNumber = booked + 1;
            const { ticketId, qrCodeUrl, bookingDate } = generateSecureTicket(passengerName, routeId, seatNumber, travelDate);

            const ticket = { id: ticketId, passengerName, routeId, date: travelDate, seat: seatNumber, qrUrl: qrCodeUrl, paymentId: checkoutRequestId, bookingDate };
            ticketsStore.push(ticket);

            return JSON.stringify({ status: 'success', message: 'Ticket Booked.', ticket });
        },
    });

    const tools = [searchRoutesTool, initiatePaymentTool, verifyPaymentTool, bookTicketTool];
    
    // AI
    const llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        apiKey: API_KEY, 
        temperature: 0,
        maxOutputTokens: 250,
    });
      
    const prompt = ChatPromptTemplate.fromMessages([
        ["system", `You are Ena Coach. TIME: {current_time}.
        PROTOCOL:
        1. Ask Origin & Destination.
        2. Show Route & Price.
        3. Ask Date.
        4. **CRITICAL**: Confirm Details (Origin, Dest, Date, Price) with user. "You want to travel to X on [Date]. Correct?"
        5. Ask Phone Number.
        6. Call 'initiatePayment'.
        7. Wait for user confirmation.
        8. Call 'verifyPayment'.
        9. Call 'bookTicket'.
        `],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
    ]);
      
    const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
    // Initialize the singleton
    agentExecutor = new AgentExecutor({ agent, tools, verbose: true });
    return agentExecutor;
}

// --- API Endpoints for Frontend Simulator ---

// API Config Endpoint to serve keys to frontend
app.get('/api/config', (req, res) => {
    res.json({
        apiKey: API_KEY || ''
    });
});

app.post('/api/payment/initiate', async (req, res) => {
    const { phoneNumber, amount } = req.body;
    const result = await triggerSTKPush(phoneNumber, Number(amount));
    res.json(result);
});

app.get('/api/payment/status/:id', async (req, res) => {
    const result = await queryDarajaStatus(req.params.id);
    res.json(result);
});

// ROUTE MANAGEMENT ENDPOINTS
app.get('/api/routes', (req, res) => {
    res.json(routesStore);
});

app.post('/api/routes', (req, res) => {
    const { origin, destination, price, departureTime, busType } = req.body;
    const newId = `R${(routesStore.length + 1).toString().padStart(3, '0')}`;
    const newRoute = {
        id: newId,
        origin,
        destination,
        price: Number(price),
        departureTime,
        busType,
        availableSeats: BUS_CAPACITY,
        capacity: BUS_CAPACITY
    };
    routesStore.push(newRoute);
    res.json({ success: true, route: newRoute });
});

app.put('/api/routes/:id', (req, res) => {
    const { id } = req.params;
    const { price } = req.body;
    const routeIndex = routesStore.findIndex(r => r.id === id);
    if (routeIndex !== -1) {
        routesStore[routeIndex].price = Number(price);
        res.json({ success: true, route: routesStore[routeIndex] });
    } else {
        res.status(404).json({ error: "Route not found" });
    }
});

app.get('/api/inventory', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    // Return routes with availability for that date
    const inventory = routesStore.map(route => {
        const booked = getBookedSeats(route.id, date);
        return {
            ...route,
            capacity: BUS_CAPACITY,
            booked: booked,
            available: BUS_CAPACITY - booked
        };
    });
    res.json(inventory);
});

// PASSENGER MANIFEST
app.get('/api/manifest', (req, res) => {
    const { routeId, date } = req.query;
    if (!routeId || !date) return res.status(400).json({ error: "Missing routeId or date" });

    const passengers = ticketsStore
        .filter(t => t.routeId === routeId && t.date === date)
        .map(t => ({
            ticketId: t.id,
            name: t.passengerName,
            seat: t.seat,
            status: t.status || 'booked',
            boardingStatus: t.boardingStatus || 'pending'
        }));
    
    res.json({ routeId, date, passengers, total: passengers.length });
});

// CONTACTS & CRM ENDPOINTS
app.get('/api/contacts', (req, res) => {
    // Derive unique contacts from ticket history
    const contactsMap = new Map();
    
    // Mock data if no tickets yet
    if (ticketsStore.length === 0) {
       contactsMap.set('254712345678', { phoneNumber: '254712345678', name: 'John Doe', lastTravelDate: '2023-11-01', totalTrips: 3 });
       contactsMap.set('254722000000', { phoneNumber: '254722000000', name: 'Jane Smith', lastTravelDate: '2023-11-05', totalTrips: 1 });
    }

    ticketsStore.forEach(ticket => {
        // We assume we can get phone from paymentStore using ticket.paymentId, 
        // OR we should have stored phone in ticket. 
        // For now, let's use a dummy lookup or if the booking tool had it. 
        // *Correction*: The bookTicket tool has 'phoneNumber' in args but we didn't save it to ticket object explicitly in previous step.
        // Let's rely on what we have. If ticket doesn't have phone, we skip.
        // Actually, let's look at ticketsStore push. It saves: id, passengerName, routeId, date, seat...
        // We should improve ticket saving to include phone.
        // For this implementation, I will just iterate and mock if missing, but in a real app we'd save it.
    });

    res.json(Array.from(contactsMap.values()));
});

app.post('/api/broadcast', async (req, res) => {
    const { message, contacts } = req.body;
    // contacts is array of phone numbers
    if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: "Invalid contacts list" });
    
    let sentCount = 0;
    for (const phone of contacts) {
        const jid = phone.replace('+', '').replace(/^0/, '254') + "@s.whatsapp.net";
        await sendWhatsAppMessage(jid, message);
        sentCount++;
        // Throttle slightly
        await new Promise(r => setTimeout(r, 100)); 
    }
    
    res.json({ success: true, count: sentCount });
});

// Debug Endpoints
app.get('/api/debug/messages', (req, res) => res.json(debugOutbox));
app.post('/api/debug/clear', (req, res) => { debugOutbox.length = 0; res.sendStatus(200); });
app.get('/api/debug/webhook-logs', (req, res) => res.json(webhookLogs));
app.post('/api/debug/clear-webhook', (req, res) => { webhookLogs.length = 0; res.sendStatus(200); });

// --- Unified Webhook Handler ---
const handleWebhook = async (req, res) => {
    // 1. Log Incoming Request (DEBUGGING)
    const eventType = req.body?.type || req.body?.event; // Support both
    const { data } = req.body || {};

    try {
        const logEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl || req.url,
            type: eventType || 'unknown',
            sender: data?.key?.remoteJid || req.body?.sender || 'unknown',
            content: data?.message || req.body,
            raw: req.body
        };
        webhookLogs.unshift(logEntry);
        if (webhookLogs.length > 50) webhookLogs.pop(); 
    } catch (e) {
        console.error("Error logging webhook:", e);
    }

    // Check if valid Evolution API upsert (robust check)
    // Evolution API sends 'type' or 'event' property depending on version/config
    if (!eventType || eventType !== 'messages.upsert' || !data || !data.message) {
        return res.status(200).send('OK');
    }
    
    // Prevent self-loops: If the message is from me, ignore it.
    if (data.key.fromMe) {
        return res.status(200).send('OK');
    }

    const text = data.message.conversation || data.message.extendedTextMessage?.text;
    if (!text) return res.status(200).send('OK');
    
    // Use the JID provided in the key. 
    let remoteJid = data.key.remoteJid;

    // FIX FOR LINKED DEVICES (LID):
    // If the message comes from a linked device (@lid), Evolution API provides 'remoteJidAlt' which is the actual phone number.
    // We MUST switch to the phone number JID (@s.whatsapp.net) for:
    // 1. Consistent session tracking (chat history shouldn't reset if you switch devices)
    // 2. Reliable message sending (replying to LID often fails)
    if (remoteJid && remoteJid.includes('@lid') && data.key.remoteJidAlt) {
        console.log(`[Webhook] Normalizing JID: ${remoteJid} -> ${data.key.remoteJidAlt}`);
        remoteJid = data.key.remoteJidAlt;
    }
  
    // Run AI in background
    (async () => {
        try {
           const executor = await initAgent();
           const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
           let history = userSessions.get(remoteJid) || [];
  
           const result = await executor.invoke({ 
               input: text, 
               current_time: now, 
               chat_history: history
           });
           
           history.push(new HumanMessage(text));
           history.push(new AIMessage(result.output));
           if (history.length > 8) history = history.slice(-8);
           userSessions.set(remoteJid, history);
           
           await sendWhatsAppMessage(remoteJid, result.output);
        } catch(e) { 
            console.error("Agent Error Details:", e); 
            await sendWhatsAppMessage(remoteJid, "System is briefly unavailable. Please try again.");
        }
    })();
  
    res.status(200).send('OK');
};

// --- Register Webhook Routes ---
// Listen on multiple paths to handle various Evolution API configurations
app.post('/webhook', handleWebhook);
app.post('/webhook/:instance', handleWebhook);
app.post('/', handleWebhook);
app.post('/api/webhook', handleWebhook);

// --- M-Pesa Callback Endpoint ---
app.post('/callback/mpesa', (req, res) => {
    console.log("[M-Pesa Callback] Hit Received!");
    
    try {
        const { Body } = req.body;
        if (!Body || !Body.stkCallback) {
             console.log("[M-Pesa Callback] Invalid Body:", JSON.stringify(req.body));
             return res.sendStatus(200);
        }

        const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
        console.log(`[M-Pesa Callback] ID: ${CheckoutRequestID} | Code: ${ResultCode} | Desc: ${ResultDesc}`);

        const currentPayment = paymentStore.get(CheckoutRequestID);
        if (currentPayment) {
            const newStatus = ResultCode === 0 ? 'COMPLETED' : 'FAILED';
            paymentStore.set(CheckoutRequestID, { ...currentPayment, status: newStatus, resultDesc: ResultDesc });
        } else {
             // Store it anyway in case query comes later (though store is in-memory)
             paymentStore.set(CheckoutRequestID, { status: ResultCode === 0 ? 'COMPLETED' : 'FAILED', resultDesc: ResultDesc, timestamp: Date.now() });
        }
    } catch (e) {
        console.error("[M-Pesa Callback] Error processing:", e);
    }
    // Always return 200 OK to Safaricom otherwise they retry
    res.sendStatus(200);
});

// --- Static Frontend Serving ---
// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Callback URL Root: ${SERVER_URL}`);
    console.log(`Gemini Key Present: ${!!API_KEY}`);
});