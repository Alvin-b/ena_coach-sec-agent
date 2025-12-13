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
// RENDER SPECIFIC: Use process.env.PORT or default to 10000
const PORT = process.env.PORT || 10000;

// API Keys
const API_KEY = process.env.GEMINI_API_KEY;
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
    const timestamp = Date.now();
    const dataToSign = `${ticketId}:${passengerName}:${routeId}:${seatNumber}:${date}:${timestamp}`;
    const signature = crypto.createHmac('sha256', TICKET_SECRET).update(dataToSign).digest('hex');
    const qrData = JSON.stringify({ id: ticketId, p: passengerName, r: routeId, s: seatNumber, d: date, sig: signature.substring(0, 16) });
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
    return { ticketId, qrCodeUrl, signature };
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
    const token = await getDarajaToken();
    if (!token) return { status: 'UNKNOWN' };
    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
    
    try {
        const response = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp, "CheckoutRequestID": checkoutRequestId })
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            if (data.ResultCode === "0") return { status: 'COMPLETED', message: data.ResultDesc };
            if (['1032', '1037', '1'].includes(data.ResultCode)) return { status: 'FAILED', message: data.ResultDesc };
            return { status: 'PENDING', message: data.ResultDesc };
        }
        return { status: 'UNKNOWN' };
    } catch (e) { return { status: 'UNKNOWN' }; }
}

function scheduleTransactionCheck(checkoutRequestId, userJid) {
    const TIMEOUT_MS = 120000; // 2 minutes
    setTimeout(async () => {
        const payment = paymentStore.get(checkoutRequestId);
        if (!payment || payment.status === 'COMPLETED') return; 

        let finalStatus = payment.status;
        if (finalStatus === 'PENDING') {
            const check = await queryDarajaStatus(checkoutRequestId);
            if (check.status !== 'UNKNOWN') finalStatus = check.status;
        }

        if (finalStatus === 'PENDING') {
            paymentStore.set(checkoutRequestId, { ...payment, status: 'TIMEOUT' });
            await sendWhatsAppMessage(userJid, "⚠️ Payment Session Timed Out. We did not receive your payment. Please try again.");
        } else if (finalStatus === 'FAILED') {
             await sendWhatsAppMessage(userJid, "❌ Payment Failed. Please check your balance or PIN and try again.");
        } else if (finalStatus === 'COMPLETED') {
             paymentStore.set(checkoutRequestId, { ...payment, status: 'COMPLETED' });
             await sendWhatsAppMessage(userJid, "✅ Payment Confirmed! Please reply with 'Book Ticket' to finalize your booking.");
        }
    }, TIMEOUT_MS);
}

// --- Tools Definition ---
const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Search routes. Args: origin, destination.",
  schema: z.object({ origin: z.string(), destination: z.string() }),
  func: async ({ origin, destination }) => {
     let matches = INTERNAL_ROUTES.filter(r => r.origin.toLowerCase().includes(origin.toLowerCase()) && r.destination.toLowerCase().includes(destination.toLowerCase()));
     if (matches.length === 0) return "No direct route found.";
     return JSON.stringify(matches);
  },
});

const initiatePaymentTool = new DynamicStructuredTool({
  name: "initiatePayment",
  description: "Send M-Pesa Prompt. Args: phoneNumber, amount.",
  schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
  func: async ({ phoneNumber, amount }) => {
     const res = await triggerSTKPush(phoneNumber, amount);
     if (res.success) {
         const jid = phoneNumber.replace('+', '').replace(/^0/, '254') + "@s.whatsapp.net";
         scheduleTransactionCheck(res.checkoutRequestId, jid);
         return JSON.stringify({ status: 'initiated', checkoutRequestId: res.checkoutRequestId, message: "STK Push sent." });
     }
     return JSON.stringify(res);
  },
});

const verifyPaymentTool = new DynamicStructuredTool({
    name: "verifyPayment",
    description: "Check payment status. Args: checkoutRequestId.",
    schema: z.object({ checkoutRequestId: z.string() }),
    func: async ({ checkoutRequestId }) => {
        let data = paymentStore.get(checkoutRequestId);
        if (!data) return JSON.stringify({ status: 'NOT_FOUND' });
        
        if (data.status === 'PENDING') {
             const queryResult = await queryDarajaStatus(checkoutRequestId);
             if (queryResult.status !== 'UNKNOWN' && queryResult.status !== 'PENDING') {
                 data.status = queryResult.status;
                 paymentStore.set(checkoutRequestId, data);
             }
        }
        return JSON.stringify({ status: data.status, message: data.status === 'COMPLETED' ? "Payment Received" : "Waiting" });
    }
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Generate Ticket. Args: passengerName, routeId, phoneNumber, checkoutRequestId, travelDate.",
  schema: z.object({ 
      passengerName: z.string(), 
      routeId: z.string(), 
      phoneNumber: z.string(), 
      checkoutRequestId: z.string(),
      travelDate: z.string().describe("Format YYYY-MM-DD")
  }),
  func: async ({ passengerName, routeId, phoneNumber, checkoutRequestId, travelDate }) => {
    // 1. Verify Payment
    const payment = paymentStore.get(checkoutRequestId);
    if (!payment || payment.status !== 'COMPLETED') return JSON.stringify({ status: 'error', message: "Payment Not Verified." });
    
    // 2. Check Capacity for Date
    const booked = getBookedSeats(routeId, travelDate);
    if (booked >= BUS_CAPACITY) {
        return JSON.stringify({ status: 'error', message: "Bus is fully booked for this date." });
    }

    // 3. Book
    const seatNumber = booked + 1;
    const { ticketId, qrCodeUrl } = generateSecureTicket(passengerName, routeId, seatNumber, travelDate);
    
    const newTicket = {
        id: ticketId,
        routeId,
        passengerName,
        phone: phoneNumber,
        seatNumber,
        date: travelDate,
        paymentId: checkoutRequestId,
        qrCodeUrl,
        status: 'booked'
    };
    ticketsStore.push(newTicket);

    return JSON.stringify({ status: 'success', ticketId, qrCodeUrl, seatNumber, message: 'Ticket Generated.' });
  },
});

const tools = [searchRoutesTool, initiatePaymentTool, verifyPaymentTool, bookTicketTool];

// --- AI Agent Setup (Global Lazy Init) ---
let agentExecutor = null;

async function initAgent() {
  try {
    const llm = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: API_KEY || "dummy", 
      temperature: 0,
      maxOutputTokens: 150,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are Ena Coach. Be concise.
      TIME: {current_time}
      USER: {user_name}
      
      RULES:
      1. Search route -> Show price.
      2. Ask for **Travel Date** (YYYY-MM-DD).
      3. Get phone -> Call initiatePayment.
      4. WAIT for user to confirm payment.
      5. Call verifyPayment.
      6. If COMPLETED -> bookTicket (Must include date).
      `],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
    agentExecutor = new AgentExecutor({ agent, tools, verbose: false });
    console.log("✅ AI Agent Initialized Successfully");
  } catch (error) {
    console.error("❌ AI Agent Initialization Failed (Check API Key):", error.message);
  }
}

// --- API Endpoints ---
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// ADMIN ENDPOINT: Inventory for a specific date
app.get('/api/inventory', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date required" });

    const inventory = INTERNAL_ROUTES.map(route => {
        const booked = getBookedSeats(route.id, date);
        return {
            ...route,
            capacity: BUS_CAPACITY,
            booked,
            available: BUS_CAPACITY - booked
        };
    });
    res.json(inventory);
});

app.get('/api/debug/messages', (req, res) => res.json(debugOutbox));
app.post('/api/debug/clear', (req, res) => { debugOutbox.length = 0; res.json({ success: true }); });

// M-Pesa Callback
app.post('/callback/mpesa', (req, res) => {
    const { Body } = req.body;
    if (Body && Body.stkCallback) {
        const { CheckoutRequestID, ResultCode } = Body.stkCallback;
        const newStatus = ResultCode === 0 ? 'COMPLETED' : 'FAILED';
        const existing = paymentStore.get(CheckoutRequestID) || {};
        paymentStore.set(CheckoutRequestID, { ...existing, status: newStatus, timestamp: Date.now() });
    }
    res.status(200).send('OK');
});

// --- Webhook ---
async function handleIncomingMessage(payload) {
  if (payload.type !== 'messages.upsert') return;
  const { key, message, pushName } = payload.data;
  if (key.fromMe || !message) return;
  const text = message.conversation || message.extendedTextMessage?.text;
  if (!text) return;
  
  const remoteJid = key.remoteJid;
  
  // Guard Clause for Agent
  if (!agentExecutor) {
      console.error("Agent not ready, ignoring message.");
      return;
  }

  try {
    const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    const user = pushName || "Customer";
    let history = userSessions.get(remoteJid) || [];
    
    const result = await agentExecutor.invoke({ 
        input: text, 
        current_time: now, 
        user_name: user,
        chat_history: history 
    });

    history.push(new HumanMessage(text));
    history.push(new AIMessage(result.output));
    if (history.length > 8) history = history.slice(-8);
    userSessions.set(remoteJid, history);

    await sendWhatsAppMessage(remoteJid, result.output);
  } catch (error) { console.error("Agent Error:", error); }
}

async function sendWhatsAppMessage(remoteJid, text) {
  debugOutbox.unshift({ to: remoteJid, text: text, timestamp: Date.now() });
  if (debugOutbox.length > 50) debugOutbox.pop();
  if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) return;
  try {
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_TOKEN },
        body: JSON.stringify({ number: remoteJid, text: text })
    });
  } catch(e) { console.error("API Send Error:", e); }
}

app.post('/webhook', (req, res) => {
    handleIncomingMessage(req.body); 
    res.status(200).send('OK');
});

// --- Static Files & Fallback ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/webhook') || req.path.startsWith('/api') || req.path.startsWith('/callback')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Start Server (Corrected for Render) ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  // Initialize Agent AFTER server is listening to prevent startup timeouts
  initAgent(); 
});