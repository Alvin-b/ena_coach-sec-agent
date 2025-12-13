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
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`; 

// Daraja Config (M-Pesa)
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || 'A9QGd46yfsnrgM027yIGE0UDiUroPZdHr8CiTRs8NGTFaXH8';
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || 'IFZQQkXptDOUkGx6wZGEeiLADggUy39NUJzEPzhU1EytUBg5JmA3oR3OGvRC6wsb';
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY || '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f';
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '4159923'; // Till Number
const TICKET_SECRET = process.env.TICKET_SECRET || 'ENA_SUPER_SECRET_KEY_2025';

// --- Initialize App ---
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(bodyParser.json());

// --- In-Memory Stores ---
const debugOutbox = []; 
const paymentStore = new Map(); 
const userSessions = new Map();

// **REAL TICKET STORE (Source of Truth)**
const ticketsStore = []; 
const BUS_CAPACITY = 45;

// --- Routes Definition (Master List) ---
const INTERNAL_ROUTES = [
  // Western
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, busType: 'Luxury' },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, busType: 'Luxury' },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, busType: 'Luxury' },
  { id: 'R004', origin: 'Busia', destination: 'Nairobi', departureTime: '08:00 PM', price: 1600, busType: 'Standard' },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, busType: 'Luxury' },
  { id: 'R006', origin: 'Mombasa', destination: 'Nairobi', departureTime: '08:30 PM', price: 1500, busType: 'Luxury' },
  { id: 'R007', origin: 'Nairobi', destination: 'Kisii', departureTime: '07:00 AM', price: 1200, busType: 'Luxury' },
  { id: 'R008', origin: 'Kisii', destination: 'Nairobi', departureTime: '11:00 AM', price: 1200, busType: 'Standard' },
  { id: 'R009', origin: 'Nairobi', destination: 'Homabay', departureTime: '08:00 AM', price: 1300, busType: 'Luxury' },
  { id: 'R010', origin: 'Homabay', destination: 'Nairobi', departureTime: '08:00 PM', price: 1300, busType: 'Standard' },
];

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
    return ticketsStore.filter(t => t.routeId === routeId && t.date === date).length;
}

// --- Daraja Helpers ---
function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET) return null;
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
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
    // Fallback simulation
    const mockId = `ws_CO_${Date.now()}`;
    paymentStore.set(mockId, { status: 'COMPLETED', phone: phoneNumber, amount, receipt: 'MOCK123', timestamp: Date.now() });
    return { success: true, checkoutRequestId: mockId, message: "[SIMULATION] Payment Auto-Completed." };
  }
  
  const timestamp = getDarajaTimestamp();
  const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
  const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  const transactionType = DARAJA_SHORTCODE === '4159923' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';

  const payload = {
    "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp,
    "TransactionType": transactionType, "Amount": Math.ceil(amount),
    "PartyA": formattedPhone, "PartyB": DARAJA_SHORTCODE, "PhoneNumber": formattedPhone,
    "CallBackURL": `${SERVER_URL}/callback/mpesa`, "AccountReference": "EnaCoach", "TransactionDesc": "Bus Ticket"
  };

  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.ResponseCode === "0") {
        paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount: amount, timestamp: Date.now() });
        return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Push sent." };
    }
    return { success: false, message: `Payment API Error` };
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
            if (['1032', '1037', '1'].includes(data.ResultCode)) {
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
    const TIMEOUT_MS = 60000; // 1 min check
    setTimeout(async () => {
        const check = await queryDarajaStatus(checkoutRequestId);
        if (check.status === 'PENDING') {
            await sendWhatsAppMessage(userJid, "⏳ Payment is taking longer than usual. Please ensure you entered your PIN.");
        } else if (check.status === 'FAILED') {
            await sendWhatsAppMessage(userJid, "❌ Payment Failed/Cancelled. Please try again.");
        } else if (check.status === 'COMPLETED') {
            await sendWhatsAppMessage(userJid, "✅ Payment Confirmed! Processing your ticket...");
            // Optionally auto-book here if we had state, but we wait for user to say "Book"
        }
    }, TIMEOUT_MS);
}

// --- Tools Setup ---
let agentExecutor;

async function initAgent() {
    if (agentExecutor) return agentExecutor;
    
    // Tools
    const searchRoutesTool = new DynamicStructuredTool({
        name: "searchRoutes",
        description: "Search routes.",
        schema: z.object({ origin: z.string(), destination: z.string() }),
        func: async ({ origin, destination }) => {
           let matches = INTERNAL_ROUTES.filter(r => r.origin.toLowerCase().includes(origin.toLowerCase()) && r.destination.toLowerCase().includes(destination.toLowerCase()));
           if (matches.length === 0) return "No direct route found.";
           return JSON.stringify(matches);
        },
    });
      
    const initiatePaymentTool = new DynamicStructuredTool({
        name: "initiatePayment",
        description: "Initiate M-Pesa. Args: phoneNumber, amount.",
        schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
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
      
            const route = INTERNAL_ROUTES.find(r => r.id === routeId);
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
        RULES:
        1. Ask Origin/Dest.
        2. Show Route & Price.
        3. Ask Date.
        4. Ask Phone & Confirm Amount.
        5. Call 'initiatePayment'.
        6. Wait for user to confirm they paid.
        7. Call 'verifyPayment'.
        8. If success, Call 'bookTicket'.
        `],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
    ]);
      
    const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
    return new AgentExecutor({ agent, tools, verbose: true });
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
    const result = await triggerSTKPush(phoneNumber, amount);
    res.json(result);
});

app.get('/api/payment/status/:id', async (req, res) => {
    const result = await queryDarajaStatus(req.params.id);
    res.json(result);
});

app.get('/api/inventory', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    // Return routes with availability for that date
    const inventory = INTERNAL_ROUTES.map(route => {
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

// Debug Endpoints
app.get('/api/debug/messages', (req, res) => res.json(debugOutbox));
app.post('/api/debug/clear', (req, res) => { debugOutbox.length = 0; res.sendStatus(200); });

// --- Webhook Endpoint ---
app.post('/webhook', async (req, res) => {
    const { type, data } = req.body;
    if (type !== 'messages.upsert' || !data.message) return res.status(200).send('OK');
    
    const text = data.message.conversation || data.message.extendedTextMessage?.text;
    if (!text) return res.status(200).send('OK');
    const remoteJid = data.key.remoteJid;
  
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
            console.error("Agent Error:", e); 
            await sendWhatsAppMessage(remoteJid, "System is briefly unavailable. Please try again.");
        }
    })();
  
    res.status(200).send('OK');
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
    console.log(`Gemini Key Present: ${!!API_KEY}`);
});