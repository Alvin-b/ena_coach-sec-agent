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

// API Keys & Runtime Config (Mutable)
const runtimeConfig = {
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
    evolutionUrl: process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '',
    evolutionToken: process.env.EVOLUTION_API_TOKEN || '',
    instanceName: process.env.INSTANCE_NAME || 'EnaCoach'
};

// --- Daraja Config (M-Pesa Sandbox Default) ---
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || 'A9QGd46yfsnrgM027yIGE0UDiUroPZdHr8CiTRs8NGTFaXH8';
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || 'IFZQQkXptDOUkGx6wZGEeiLADggUy39NUJzEPzhU1EytUBg5JmA3oR3OGvRC6wsb';
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '174379'; 
const TICKET_SECRET = process.env.TICKET_SECRET || 'ENA_SUPER_SECRET_KEY_2025';

const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// --- Initialize App ---
const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});
app.use(bodyParser.json());

// In-Memory Stores
const debugOutbox = []; 
const webhookLogs = []; 
const paymentStore = new Map(); 
const userSessions = new Map();
const ticketsStore = []; 
const BUS_CAPACITY = 45;

// Dynamic Routes Store
const BASE_ROUTES_DEF = [
  { origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { origin: 'Nairobi', destination: 'Kisumu', departureTime: '09:00 PM', price: 1500, busType: 'Luxury', stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Eldoret', 'Bungoma', 'Mumias'] },
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi', 'Mariakani'] },
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '07:00 AM', price: 1200, busType: 'Luxury', stops: ['Narok', 'Bomet', 'Sotik'] }
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

// --- Daraja Helpers ---
function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
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
      if (!token) return { success: false, message: "M-Pesa Auth Failed. Check Daraja Credentials." };
      
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
          return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Push sent to " + formattedPhone };
      }
      return { success: false, message: data.CustomerMessage || "Safaricom Error: " + data.errorMessage };
  } catch (error) { return { success: false, message: "Daraja Network Error: " + error.message }; }
}

async function queryDarajaStatus(checkoutRequestId) {
    const local = paymentStore.get(checkoutRequestId);
    if (local && local.status === 'COMPLETED') return { status: 'COMPLETED', message: 'Payment Received' };

    const token = await getDarajaToken();
    if (!token) return { status: 'UNKNOWN', message: 'Daraja Auth Failed' };
    
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
    } catch (e) { return { status: 'UNKNOWN', message: 'Query Network Error' }; }
}

// --- WhatsApp Logic ---
async function sendWhatsAppMessage(remoteJid, text, instanceOverride = null) {
    const activeInstance = instanceOverride || runtimeConfig.instanceName;
    const apiUrl = runtimeConfig.evolutionUrl;
    const apiToken = runtimeConfig.evolutionToken;

    const cleanNumber = remoteJid ? remoteJid.replace(/@s\.whatsapp\.net|@lid/g, '') : '';
    const logEntry = { to: cleanNumber, text, timestamp: Date.now(), instance: activeInstance, status: 'pending' };
    debugOutbox.push(logEntry);
    if (debugOutbox.length > 50) debugOutbox.shift();

    if (!apiUrl || !apiToken) {
        logEntry.status = `FAILED: MISSING ${!apiUrl ? 'EVOLUTION_API_URL' : ''} ${!apiToken ? 'EVOLUTION_API_TOKEN' : ''}`;
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/message/sendText/${activeInstance}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiToken },
            body: JSON.stringify({ number: cleanNumber, text: text })
        });
        if (!response.ok) {
            logEntry.status = `failed: ${response.status}`;
            logEntry.error = await response.text();
        } else {
            logEntry.status = 'sent';
        }
    } catch(e) { 
        logEntry.status = 'error: network';
        logEntry.error = e.message;
    }
}

// --- Agent Singleton ---
let agentExecutorPromise = null;
async function getAgentExecutor() {
    if (agentExecutorPromise) return agentExecutorPromise;
    agentExecutorPromise = (async () => {
        if (!runtimeConfig.apiKey) throw new Error("GEMINI_API_KEY Missing. Please set it in the Integration tab.");
        
        const tools = [
            new DynamicStructuredTool({
                name: "searchRoutes",
                description: "Search routes.",
                schema: z.object({ origin: z.string(), destination: z.string() }),
                func: async ({ origin, destination }) => JSON.stringify(routesStore.filter(r => r.origin.toLowerCase().includes(origin.toLowerCase()) && r.destination.toLowerCase().includes(destination.toLowerCase())))
            }),
            new DynamicStructuredTool({
                name: "initiatePayment",
                description: "Initiate M-Pesa. Args: phoneNumber, amount.",
                schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
                func: async ({ phoneNumber, amount }) => JSON.stringify(await triggerSTKPush(phoneNumber, amount))
            }),
            new DynamicStructuredTool({
                name: "verifyPayment",
                description: "Check if payment is completed.",
                schema: z.object({ checkoutRequestId: z.string() }),
                func: async ({ checkoutRequestId }) => JSON.stringify(await queryDarajaStatus(checkoutRequestId))
            }),
            new DynamicStructuredTool({
                name: "bookTicket",
                description: "Book Ticket.",
                schema: z.object({ passengerName: z.string(), routeId: z.string(), phoneNumber: z.string(), travelDate: z.string(), checkoutRequestId: z.string() }),
                func: async ({ passengerName, routeId, travelDate, checkoutRequestId }) => {
                    const statusCheck = await queryDarajaStatus(checkoutRequestId);
                    if (statusCheck.status !== 'COMPLETED') return JSON.stringify({ error: "Payment incomplete." });
                    const ticketId = `TKT-${Math.floor(Math.random()*10000)}`;
                    ticketsStore.push({ id: ticketId, passengerName, routeId, date: travelDate });
                    return JSON.stringify({ status: 'success', ticketId });
                }
            })
        ];

        const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", apiKey: runtimeConfig.apiKey, temperature: 0.2 });
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `You are Martha, the Ena Coach assistant. Flow: Route -> Date -> Name -> Phone -> initiatePayment -> verifyPayment -> bookTicket. Ask only one question at a time.`],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);
        const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
        return new AgentExecutor({ agent, tools });
    })();
    return agentExecutorPromise;
}

// --- API ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    const { apiUrl, apiToken, instanceName, apiKey } = req.body;
    if (apiUrl) runtimeConfig.evolutionUrl = apiUrl.replace(/\/$/, '');
    if (apiToken) runtimeConfig.evolutionToken = apiToken;
    if (instanceName) runtimeConfig.instanceName = instanceName;
    if (apiKey) {
        runtimeConfig.apiKey = apiKey;
        agentExecutorPromise = null; // Recreate agent on next call
    }
    res.json({ success: true, config: runtimeConfig });
});

app.get('/api/debug/messages', (req, res) => res.json(debugOutbox));
app.post('/api/debug/clear', (req, res) => { debugOutbox.length = 0; res.sendStatus(200); });
app.get('/api/debug/webhook-logs', (req, res) => res.json(webhookLogs));

app.post('/webhook', async (req, res) => {
    const { type, data, instance } = req.body || {};
    if (!data || !data.message || type !== 'messages.upsert') return res.status(200).send('OK');
    const text = data.message.conversation || data.message.extendedTextMessage?.text;
    if (!text || data.key.fromMe) return res.status(200).send('OK');

    webhookLogs.unshift({ sender: data.key.remoteJid, content: text, timestamp: new Date().toISOString() });
    
    (async () => {
        try {
           const executor = await getAgentExecutor();
           const jid = data.key.remoteJid;
           let history = userSessions.get(jid) || [];
           const result = await executor.invoke({ input: text, current_time: new Date().toLocaleString(), chat_history: history, user_name: data.pushName || 'Customer' });
           history.push(new HumanMessage(text));
           history.push(new AIMessage(result.output));
           if (history.length > 8) history = history.slice(-8);
           userSessions.set(jid, history);
           await sendWhatsAppMessage(jid, result.output, instance);
        } catch(e) { 
           console.error("Agent Fail:", e);
           await sendWhatsAppMessage(data.key.remoteJid, "Agent Error: " + e.message, instance);
        }
    })();
    res.status(200).send('OK');
});

app.post('/callback/mpesa', (req, res) => {
    const { Body } = req.body;
    if (Body?.stkCallback) {
        const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
        const current = paymentStore.get(CheckoutRequestID);
        if(current) paymentStore.set(CheckoutRequestID, { ...current, status: ResultCode === 0 ? 'COMPLETED' : 'FAILED', resultDesc: ResultDesc });
    }
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Ena Coach Server on ${PORT}`));