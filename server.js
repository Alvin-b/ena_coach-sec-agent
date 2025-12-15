/**
 * Ena Coach AI Agent - Unified Server
 * Handles both the WhatsApp Webhook and serving the React Frontend.
 * Optimized for Render Deployment & Concurrency.
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

// API Keys & Runtime Config
// We use a mutable config object so the Dashboard can update credentials without a restart
const runtimeConfig = {
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
    evolutionUrl: process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '',
    evolutionToken: process.env.EVOLUTION_API_TOKEN || '',
    instanceName: process.env.INSTANCE_NAME || 'EnaCoach'
};

// Server URL Detection (Critical for Callbacks)
const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Daraja Config (M-Pesa)
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
const webhookLogs = []; 
const paymentStore = new Map(); 
const userSessions = new Map();

// **REAL TICKET STORE**
const ticketsStore = []; 
const BUS_CAPACITY = 45;

// **DYNAMIC ROUTES STORE**
const BASE_ROUTES_DEF = [
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
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '07:00 AM', price: 1200, busType: 'Luxury', stops: ['Narok', 'Bomet', 'Sotik'] },
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '11:00 AM', price: 1200, busType: 'Standard', stops: ['Narok', 'Bomet'] },
  { origin: 'Nairobi', destination: 'Homabay', departureTime: '08:00 AM', price: 1300, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Rongo'] },
  { origin: 'Nairobi', destination: 'Migori', departureTime: '07:30 AM', price: 1400, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Rongo', 'Awendo'] },
  { origin: 'Nairobi', destination: 'Sirare', departureTime: '06:00 AM', price: 1500, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Migori', 'Kehancha'] },
  { origin: 'Nairobi', destination: 'Mbita', departureTime: '08:00 PM', price: 1400, busType: 'Standard', stops: ['Narok', 'Homabay'] },
  { origin: 'Nairobi', destination: 'Sori', departureTime: '07:00 PM', price: 1400, busType: 'Standard', stops: ['Narok', 'Homabay', 'Rod Kopany'] },
  { origin: 'Nairobi', destination: 'Kendu Bay', departureTime: '01:00 PM', price: 1300, busType: 'Standard', stops: ['Narok', 'Oyugis'] },
  { origin: 'Nairobi', destination: 'Oyugis', departureTime: '02:00 PM', price: 1200, busType: 'Standard', stops: ['Narok', 'Kisii'] },
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi', 'Mariakani'] },
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '09:00 PM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi'] },
  { origin: 'Nairobi', destination: 'Malindi', departureTime: '07:00 PM', price: 2000, busType: 'Luxury', stops: ['Mombasa', 'Kilifi', 'Mtwapa'] },
  { origin: 'Nairobi', destination: 'Ukunda', departureTime: '08:00 PM', price: 1800, busType: 'Luxury', stops: ['Mombasa', 'Likoni'] },
  { origin: 'Mombasa', destination: 'Kisumu', departureTime: '04:00 PM', price: 2500, busType: 'Luxury', stops: ['Nairobi', 'Nakuru', 'Kericho'] },
  { origin: 'Mombasa', destination: 'Busia', departureTime: '03:00 PM', price: 2600, busType: 'Luxury', stops: ['Nairobi', 'Nakuru', 'Eldoret'] },
  { origin: 'Mombasa', destination: 'Kitale', departureTime: '03:30 PM', price: 2600, busType: 'Standard', stops: ['Nairobi', 'Eldoret'] },
  { origin: 'Nakuru', destination: 'Kisumu', departureTime: '10:00 AM', price: 800, busType: 'Standard', stops: ['Kericho'] },
  { origin: 'Eldoret', destination: 'Nairobi', departureTime: '02:00 PM', price: 1000, busType: 'Standard', stops: ['Nakuru'] },
  { origin: 'Kisumu', destination: 'Mombasa', departureTime: '01:00 PM', price: 2500, busType: 'Luxury', stops: ['Kericho', 'Nakuru', 'Nairobi'] },
];

function initializeRoutes() {
    let idCounter = 1;
    const allRoutes = [];
    BASE_ROUTES_DEF.forEach(route => {
        allRoutes.push({ id: `R${idCounter.toString().padStart(3, '0')}`, ...route, availableSeats: BUS_CAPACITY, capacity: BUS_CAPACITY });
        idCounter++;
        const reverseStops = route.stops ? [...route.stops].reverse() : [];
        allRoutes.push({
            id: `R${idCounter.toString().padStart(3, '0')}`, origin: route.destination, destination: route.origin,
            departureTime: route.departureTime, price: route.price, busType: route.busType, stops: reverseStops,
            availableSeats: BUS_CAPACITY, capacity: BUS_CAPACITY
        });
        idCounter++;
    });
    return allRoutes;
}

let routesStore = initializeRoutes();

// --- Helpers ---
function generateSecureTicket(passengerName, routeId, seatNumber, date) {
    const ticketId = `TKT-${Math.floor(Math.random() * 100000)}`;
    const now = new Date();
    const bookingDate = now.toISOString();
    const dataToSign = `${ticketId}:${passengerName}:${routeId}:${seatNumber}:${date}:${bookingDate}:${now.getTime()}`;
    const signature = crypto.createHmac('sha256', TICKET_SECRET).update(dataToSign).digest('hex');
    const qrData = JSON.stringify({ id: ticketId, p: passengerName, r: routeId, s: seatNumber, d: date, bd: bookingDate, sig: signature.substring(0, 16) });
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
    return { ticketId, qrCodeUrl, signature, bookingDate };
}

function getBookedSeats(routeId, date) {
    return ticketsStore.filter(t => t.routeId === routeId && t.date === date).length;
}

// --- Daraja Helpers ---
function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET) {
      console.error("[Daraja] Missing Credentials");
      return null;
  }
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  try {
    const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token;
  } catch (error) { return null; }
}

async function triggerSTKPush(phoneNumber, amount) {
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  const callbackUrl = `${SERVER_URL.replace(/\/$/, '')}/callback/mpesa`;

  try {
      const token = await getDarajaToken();
      if (!token) return { success: false, message: "Payment Auth Failed" };
      
      const timestamp = getDarajaTimestamp();
      const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
      const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
      const transactionType = DARAJA_SHORTCODE === '174379' ? 'CustomerPayBillOnline' : 'CustomerBuyGoodsOnline';

      const payload = {
        "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp,
        "TransactionType": transactionType, "Amount": Math.ceil(amount),
        "PartyA": formattedPhone, "PartyB": DARAJA_SHORTCODE, "PhoneNumber": formattedPhone,
        "CallBackURL": callbackUrl, "AccountReference": "EnaCoach", "TransactionDesc": "Bus Ticket"
      };

      const response = await fetch(url, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.ResponseCode === "0") {
          paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount: amount, timestamp: Date.now() });
          return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Push sent." };
      }
      return { success: false, message: data.CustomerMessage || "Failed to initiate." };
  } catch (error) { return { success: false, message: "Network error." }; }
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

// Updated to use runtime config and better logging
async function sendWhatsAppMessage(remoteJid, text, instanceOverride = null) {
    const activeInstance = instanceOverride || runtimeConfig.instanceName;
    const apiUrl = runtimeConfig.evolutionUrl;
    const apiToken = runtimeConfig.evolutionToken;

    // Sanitize JID: remove @s.whatsapp.net to get plain number, as Evolution API often expects strict numbers
    const cleanNumber = remoteJid ? remoteJid.replace(/@s\.whatsapp\.net|@lid/g, '') : '';

    // Create log entry reference
    const logEntry = { to: cleanNumber, text, timestamp: Date.now(), instance: activeInstance, status: 'pending' };
    debugOutbox.push(logEntry);
    if (debugOutbox.length > 50) debugOutbox.shift();

    if (!apiUrl || !apiToken) {
        console.error("Missing Evolution API URL/Token.");
        logEntry.status = 'failed: missing config';
        return;
    }
    if (!activeInstance) {
        console.error("Missing Instance Name.");
        logEntry.status = 'failed: missing instance';
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/message/sendText/${activeInstance}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiToken },
            body: JSON.stringify({ number: cleanNumber, text: text })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            console.error(`Evolution API Error: ${errText}`);
            logEntry.status = `failed: ${response.status}`;
            logEntry.error = errText;
        } else {
            logEntry.status = 'sent';
        }
    } catch(e) { 
        console.error("API Send Error:", e);
        logEntry.status = 'error: network';
        logEntry.error = e.message;
    }
}

// --- Tools Setup & Agent Singleton ---
let agentExecutorPromise = null;

async function getAgentExecutor() {
    if (agentExecutorPromise) return agentExecutorPromise;
    
    agentExecutorPromise = (async () => {
        if (!runtimeConfig.apiKey) throw new Error("API Key missing");
        
        const searchRoutesTool = new DynamicStructuredTool({
            name: "searchRoutes",
            description: "Search routes.",
            schema: z.object({ origin: z.string(), destination: z.string() }),
            func: async ({ origin, destination }) => {
                let matches = routesStore.filter(r => r.origin.toLowerCase().includes(origin.toLowerCase()) && r.destination.toLowerCase().includes(destination.toLowerCase()));
                if (matches.length === 0) return "No direct route found.";
                return JSON.stringify(matches.map(r => ({ id: r.id, org: r.origin, dst: r.destination, time: r.departureTime, price: r.price, type: r.busType })));
            },
        });
        
        const initiatePaymentTool = new DynamicStructuredTool({
            name: "initiatePayment",
            description: "Initiate M-Pesa. Args: phoneNumber, amount.",
            schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
            func: async ({ phoneNumber, amount }) => {
                const res = await triggerSTKPush(phoneNumber, amount);
                return JSON.stringify({ status: res.success ? 'initiated' : 'failed', message: res.message, checkoutRequestId: res.checkoutRequestId });
            },
        });

        const verifyPaymentTool = new DynamicStructuredTool({
            name: "verifyPayment",
            description: "Verify if payment is completed.",
            schema: z.object({ checkoutRequestId: z.string() }),
            func: async ({ checkoutRequestId }) => {
                const res = await queryDarajaStatus(checkoutRequestId);
                return JSON.stringify(res);
            }
        });
        
        const bookTicketTool = new DynamicStructuredTool({
            name: "bookTicket",
            description: "Book Ticket.",
            schema: z.object({ passengerName: z.string(), routeId: z.string(), phoneNumber: z.string(), travelDate: z.string(), checkoutRequestId: z.string() }),
            func: async ({ passengerName, routeId, phoneNumber, travelDate, checkoutRequestId }) => {
                const statusCheck = await queryDarajaStatus(checkoutRequestId);
                if (statusCheck.status !== 'COMPLETED') return JSON.stringify({ error: "Payment incomplete." });
                const booked = getBookedSeats(routeId, travelDate);
                if (booked >= BUS_CAPACITY) return "Bus Full.";
                const route = routesStore.find(r => r.id === routeId);
                const seatNumber = booked + 1;
                const { ticketId, qrCodeUrl, bookingDate } = generateSecureTicket(passengerName, routeId, seatNumber, travelDate);
                const ticket = { id: ticketId, passengerName, routeId, date: travelDate, seat: seatNumber, qrUrl: qrCodeUrl, paymentId: checkoutRequestId, bookingDate };
                ticketsStore.push(ticket);
                return JSON.stringify({ status: 'success', message: 'Ticket Booked.', ticketId: ticketId, seat: seatNumber });
            },
        });

        const tools = [searchRoutesTool, initiatePaymentTool, verifyPaymentTool, bookTicketTool];
        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash", apiKey: runtimeConfig.apiKey, temperature: 0.3, maxOutputTokens: 300,
        });
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `You are Ena Coach's friendly WhatsApp Assistant.
  
  **GOLDEN RULE: ASK ONLY ONE QUESTION AT A TIME.**
  Do not ask for Name, Date, and Route all at once. Treat this like a chat with a friend.

  **Booking Flow:**
  1. **Route**: Ask where they want to go. If they say "Kisumu", ask "From where?".
     - Use 'searchRoutes' tool to check availability.
     - Share the departure time and price.
  2. **Date**: Ask "What date would you like to travel?"
  3. **Confirm**: Summarize the trip (Route, Time, Price, Date) and ask to proceed.
  4. **Name**: Ask "May I have the passenger name?"
  5. **Phone**: Ask "What is the M-Pesa number?"
  6. **Payment**: Call 'initiatePayment'.

  Current Time: {current_time}.
  User Name: {user_name || 'Customer'}.
  `],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);
        const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
        return new AgentExecutor({ agent, tools, verbose: false });
    })();
    return agentExecutorPromise;
}

// --- API Endpoints ---

// Runtime Configuration Endpoint
app.post('/api/config/update', (req, res) => {
    const { apiUrl, apiToken, instanceName } = req.body;
    if (apiUrl) runtimeConfig.evolutionUrl = apiUrl.replace(/\/$/, '');
    if (apiToken) runtimeConfig.evolutionToken = apiToken;
    if (instanceName) runtimeConfig.instanceName = instanceName;
    console.log("[Config] Runtime config updated via Dashboard:", runtimeConfig.instanceName);
    
    // Reset agent executor if API Key changes (not implemented in UI but supported here)
    if (req.body.apiKey) {
        runtimeConfig.apiKey = req.body.apiKey;
        agentExecutorPromise = null;
    }
    
    res.json({ success: true, config: { ...runtimeConfig, evolutionToken: '***' } });
});

app.get('/api/config', (req, res) => res.json({ apiKey: runtimeConfig.apiKey || '' }));
app.post('/api/payment/initiate', async (req, res) => res.json(await triggerSTKPush(req.body.phoneNumber, Number(req.body.amount))));
app.get('/api/payment/status/:id', async (req, res) => res.json(await queryDarajaStatus(req.params.id)));
app.get('/api/routes', (req, res) => res.json(routesStore));
app.post('/api/routes', (req, res) => {
    const { origin, destination, price, departureTime, busType } = req.body;
    const newRoute = { id: `R${(routesStore.length + 1).toString().padStart(3, '0')}`, origin, destination, price: Number(price), departureTime, busType, availableSeats: BUS_CAPACITY, capacity: BUS_CAPACITY };
    routesStore.push(newRoute);
    res.json({ success: true, route: newRoute });
});
app.put('/api/routes/:id', (req, res) => {
    const r = routesStore.find(r => r.id === req.params.id);
    if(r) { r.price = Number(req.body.price); res.json({success:true}); } else res.status(404).json({error:"Not found"});
});

// Fixed Truncated Logic Here
app.get('/api/inventory', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
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

app.get('/api/manifest', (req, res) => {
    const { routeId, date } = req.query;
    const passengers = ticketsStore.filter(t => t.routeId === routeId && t.date === date)
        .map(t => ({ ticketId: t.id, name: t.passengerName, seat: t.seat, status: 'booked', boardingStatus: t.boardingStatus || 'pending' }));
    res.json({ routeId, date, passengers, total: passengers.length });
});

app.get('/api/contacts', (req, res) => {
    if(ticketsStore.length === 0) return res.json([{phoneNumber: '254712345678', name: 'John Doe', lastTravelDate: '2023-11-01', totalTrips: 3}]);
    res.json(ticketsStore.map(t => ({phoneNumber: 'Unknown', name: t.passengerName, lastTravelDate: t.date, totalTrips: 1})));
});

app.post('/api/broadcast', async (req, res) => {
    const { message, contacts } = req.body;
    let sentCount = 0;
    for (const phone of contacts) {
        const jid = phone.replace('+', '').replace(/^0/, '254') + "@s.whatsapp.net";
        await sendWhatsAppMessage(jid, message);
        sentCount++;
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
    const eventType = req.body?.type || req.body?.event;
    const { data, instance } = req.body || {}; 

    if (!data || !data.key || !data.message) return res.status(200).send('OK');

    const remoteJid = data.key.remoteJid;
    const text = data.message.conversation || data.message.extendedTextMessage?.text;

    webhookLogs.unshift({
        id: Date.now().toString(), timestamp: new Date().toISOString(), type: eventType, sender: remoteJid, content: text,
        raw: { key: data.key, instance }
    });
    if (webhookLogs.length > 50) webhookLogs.pop();

    if (eventType !== 'messages.upsert' || data.key.fromMe || !text) return res.status(200).send('OK');
    
    // LID Handling
    let finalJid = remoteJid;
    if (finalJid && finalJid.includes('@lid')) {
        if (data.key.remoteJidAlt) finalJid = data.key.remoteJidAlt;
        else if (data.key.participant) finalJid = data.key.participant;
    }
  
    // AI Execution
    (async () => {
        try {
           const executor = await getAgentExecutor();
           const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
           let history = userSessions.get(finalJid) || [];
           const truncatedInput = text.length > 500 ? text.substring(0, 500) + "...(truncated)" : text;

           const result = await executor.invoke({ input: truncatedInput, current_time: now, chat_history: history });
           
           history.push(new HumanMessage(truncatedInput));
           history.push(new AIMessage(result.output));
           if (history.length > 6) history = history.slice(-6);
           userSessions.set(finalJid, history);
           
           await sendWhatsAppMessage(finalJid, result.output, instance);
        } catch(e) { 
            console.error("Agent Error:", e);
            await sendWhatsAppMessage(finalJid, `System Error: ${e.message}`, instance);
        }
    })();
  
    res.status(200).send('OK');
};

app.post('/webhook', handleWebhook);
app.post('/webhook/:instance', handleWebhook);
app.post('/', handleWebhook);
app.post('/api/webhook', handleWebhook);

app.post('/callback/mpesa', (req, res) => {
    console.log("[M-Pesa Callback] Hit");
    try {
        const { Body } = req.body;
        if (Body?.stkCallback) {
            const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
            const current = paymentStore.get(CheckoutRequestID);
            const status = ResultCode === 0 ? 'COMPLETED' : 'FAILED';
            if(current) paymentStore.set(CheckoutRequestID, { ...current, status, resultDesc: ResultDesc });
            else paymentStore.set(CheckoutRequestID, { status, resultDesc: ResultDesc, timestamp: Date.now() });
        }
    } catch (e) { console.error(e); }
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Callback URL Root: ${SERVER_URL}`);
});