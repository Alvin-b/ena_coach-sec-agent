/**
 * Ena Coach AI Agent - LangChain Webhook Handler
 * Optimized for Speed & Concurrency
 */

import express from 'express';
import bodyParser from 'body-parser';

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME;

// Daraja Config - PRODUCTION (Verified)
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J';
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm';
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY || '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f';
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '5512238'; // Business Store Number
const DARAJA_PARTY_B = process.env.DARAJA_PARTY_B || '4159923'; // Actual Till Number

// In-Memory Stores
const userSessions = new Map();
const paymentStore = new Map();
const ticketsStore = [];
const BUS_CAPACITY = 45;

const INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500 },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500 },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600 },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500 },
];

const app = express();
app.use(bodyParser.json());

// --- Helpers ---
function getBookedSeats(routeId, date) {
    return ticketsStore.filter(t => t.routeId === routeId && t.date === date).length;
}

// --- Daraja Helpers ---
async function getDarajaToken() {
  if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET) return null;
  const baseUrl = 'https://api.safaricom.co.ke';
  const url = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  try {
    const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    const data = await response.json();
    return data.access_token;
  } catch (error) { return null; }
}

async function triggerSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  if (!token) return { success: false, message: "Payment service unavailable." };
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
  const url = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  const transactionType = 'CustomerBuyGoodsOnline';
  
  const payload = {
    "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp,
    "TransactionType": transactionType, "Amount": Math.ceil(amount),
    "PartyA": formattedPhone, "PartyB": DARAJA_PARTY_B, "PhoneNumber": formattedPhone,
    "CallBackURL": "https://ena-coach-bot.onrender.com/callback/mpesa", "AccountReference": "EnaCoach", "TransactionDesc": "Bus Ticket"
  };

  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.ResponseCode === "0") {
         paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount: amount });
         return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Push sent." };
    }
    return { success: false, message: data.CustomerMessage || data.errorMessage };
  } catch (error) { return { success: false, message: "Network error." }; }
}

async function queryDarajaStatus(checkoutRequestId) {
    const token = await getDarajaToken();
    if (!token) return { status: 'UNKNOWN' };
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
    
    try {
        const response = await fetch('https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
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
    const TIMEOUT_MS = 120000;
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

async function sendWhatsAppMessage(remoteJid, text) {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) return;
    try {
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_TOKEN },
            body: JSON.stringify({ number: remoteJid, text: text })
        });
    } catch(e) { console.error("API Send Error:", e); }
}

// --- Tools ---
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
         return JSON.stringify({ status: 'initiated', message: "STK Push sent." });
     }
     return JSON.stringify(res);
  },
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Book Ticket (Requires Date).",
  schema: z.object({ 
      passengerName: z.string(), 
      routeId: z.string(), 
      phoneNumber: z.string(), 
      travelDate: z.string()
  }),
  func: async ({ passengerName, routeId, phoneNumber, travelDate }) => {
    const booked = getBookedSeats(routeId, travelDate);
    if (booked >= BUS_CAPACITY) return "Bus Fully Booked.";

    const ticket = { id: `TKT-${Date.now()}`, passengerName, routeId, date: travelDate, seat: booked+1 };
    ticketsStore.push(ticket);
    return JSON.stringify({ status: 'success', message: 'Ticket Booked.', ticket });
  },
});

const tools = [searchRoutesTool, initiatePaymentTool, bookTicketTool];

// --- AI Agent ---
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY || "dummy", 
  temperature: 0,
  maxOutputTokens: 150,
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are Ena Coach assistant. Ask for route, then price, then date, then phone. Use initiatePayment to trigger STK."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
const agentExecutor = new AgentExecutor({ agent, tools, verbose: false });

// --- Webhook Endpoint ---
app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;
  if (type !== 'messages.upsert' || !data.message) return res.status(200).send('OK');
  
  const text = data.message.conversation || data.message.extendedTextMessage?.text;
  if (!text) return res.status(200).send('OK');
  const remoteJid = data.key.remoteJid;

  (async () => {
      try {
         const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
         let history = userSessions.get(remoteJid) || [];

         const result = await agentExecutor.invoke({ 
             input: text, 
             current_time: now, 
             user_name: data.pushName || 'Customer',
             chat_history: history
         });
         
         history.push(new HumanMessage(text));
         history.push(new AIMessage(result.output));
         if (history.length > 8) history = history.slice(-8);
         userSessions.set(remoteJid, history);
         
         await sendWhatsAppMessage(remoteJid, result.output);
      } catch(e) { console.error("Agent Error:", e); }
  })();

  res.status(200).send('OK');
});

app.listen(PORT, () => console.log(`Webhook Server running on port ${PORT}`));
