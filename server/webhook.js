
/**
 * Ena Coach AI Agent - WhatsApp Webhook (Evolution API + Gemini)
 * High-Performance Automation with Proactive Payment Monitoring
 */

import express from 'express';
import bodyParser from 'body-parser';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// --- Env & Config ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'EnaCoach';

// M-Pesa Production Credentials
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J';
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm';
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY || '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f';
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '5512238'; 
const DARAJA_PARTY_B = process.env.DARAJA_PARTY_B || '4159923';

// In-memory Session Storage
const userSessions = new Map();
const activePayments = new Map(); 

const INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500 },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500 },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600 },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500 },
];

const app = express();
app.use(bodyParser.json());

// --- Core Helper Functions ---

async function sendWhatsApp(jid, text) {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) return console.error("Evolution API Config Missing");
    try {
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_TOKEN },
            body: JSON.stringify({ number: jid, text: text })
        });
    } catch(e) { console.error("WhatsApp Send Failed:", e.message); }
}

async function getDarajaToken() {
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY.trim()}:${DARAJA_CONSUMER_SECRET.trim()}`).toString('base64');
  try {
    const res = await fetch('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await res.json();
    return data.access_token;
  } catch (e) { return null; }
}

async function checkDarajaStatus(checkoutId) {
    const token = await getDarajaToken();
    if (!token) return 'ERROR';
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
    
    try {
        const res = await fetch('https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp, "CheckoutRequestID": checkoutId })
        });
        const data = await res.json();
        if (data.ResultCode === "0") return 'COMPLETED';
        if (['1032', '1037', '1'].includes(data.ResultCode)) return 'FAILED';
        return 'PENDING';
    } catch (e) { return 'ERROR'; }
}

/**
 * BACKGROUND POLLER:
 * Once a payment is started, this polls Safaricom and then re-triggers the agent.
 */
function startPaymentPolling(jid, checkoutId) {
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const status = await checkDarajaStatus(checkoutId);
        
        if (status === 'COMPLETED') {
            clearInterval(interval);
            // Trigger the AI agent with a hidden success message
            await processIncomingMessage(jid, `[PAYMENT_SUCCESS] Checkout: ${checkoutId}`);
        } else if (status === 'FAILED' || attempts > 30) {
            clearInterval(interval);
            if (status === 'FAILED') await sendWhatsApp(jid, "❌ It seems the M-Pesa transaction was cancelled or failed. Would you like to try again?");
        }
    }, 5000);
}

// --- Agent Tools ---

const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Find bus routes.",
  schema: z.object({ origin: z.string(), destination: z.string() }),
  func: async ({ origin, destination }) => {
     const matches = INTERNAL_ROUTES.filter(r => r.origin.toLowerCase().includes(origin.toLowerCase()) && r.destination.toLowerCase().includes(destination.toLowerCase()));
     return matches.length > 0 ? JSON.stringify(matches) : "No buses found for that route today.";
  },
});

const initiatePaymentTool = new DynamicStructuredTool({
  name: "initiatePayment",
  description: "Trigger M-Pesa STK Push.",
  schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
  func: async ({ phoneNumber, amount }) => {
     const token = await getDarajaToken();
     if (!token) return "Payment system unavailable.";
     
     const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
     const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
     let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');

     try {
        const res = await fetch('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            "BusinessShortCode": DARAJA_SHORTCODE, "Password": password, "Timestamp": timestamp,
            "TransactionType": "CustomerBuyGoodsOnline", "Amount": Math.ceil(amount),
            "PartyA": formattedPhone, "PartyB": DARAJA_PARTY_B, "PhoneNumber": formattedPhone,
            "CallBackURL": "https://ena-coach-bot.onrender.com/callback/mpesa", "AccountReference": "EnaCoach", "TransactionDesc": "Bus Ticket"
          })
        });
        const data = await res.json();
        if (data.ResponseCode === "0") {
             const jid = formattedPhone + "@s.whatsapp.net";
             startPaymentPolling(jid, data.CheckoutRequestID);
             return JSON.stringify({ success: true, checkoutId: data.CheckoutRequestID });
        }
        return "Failed to send M-Pesa prompt.";
     } catch (e) { return "M-Pesa service error."; }
  },
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Generate the ticket.",
  schema: z.object({ passengerName: z.string(), routeId: z.string(), travelDate: z.string() }),
  func: async ({ passengerName, routeId, travelDate }) => {
    const ticketId = `TKT-${Math.floor(Math.random()*100000)}`;
    return JSON.stringify({ status: 'success', ticketId, message: `Ticket ${ticketId} confirmed for ${passengerName}. Seat assigned.` });
  },
});

const tools = [searchRoutesTool, initiatePaymentTool, bookTicketTool];

// --- AI Setup ---

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY,
  temperature: 0,
});

const promptTemplate = ChatPromptTemplate.fromMessages([
  ["system", `You are Martha, the Ena Coach AI Assistant.
  
  **BEHAVIOR:**
  - Wait for the user to speak first. Do not introduce yourself at the start.
  - Be reactive to the user's needs.
  
  **PROACTIVE FLOW:**
  - When you initiate a payment, tell the user: "I've sent an M-Pesa prompt to your phone. Please enter your PIN. I'll automatically detect the payment once it's complete."
  - **NEVER** ask the user to notify you when they are finished.
  - If the user provides a destination, check for routes immediately.
  - Calculate relative dates (like 'tomorrow') based ONLY on the timestamp provided in the user message.
  
  **GOLDEN RULE:** Ask only ONE question at a time. Keep it helpful and brief.`],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt: promptTemplate });
const agentExecutor = new AgentExecutor({ agent, tools });

// --- Message Processing ---

async function processIncomingMessage(remoteJid, text, pushName = 'Customer') {
    try {
        const now = new Date();
        const fullTime = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
        
        let history = userSessions.get(remoteJid) || [];
        
        const result = await agentExecutor.invoke({
            input: `[CURRENT TIME: ${fullTime}]\nMessage: ${text}`,
            chat_history: history
        });

        history.push(new HumanMessage(text));
        history.push(new AIMessage(result.output));
        if (history.length > 10) history = history.slice(-10);
        userSessions.set(remoteJid, history);

        await sendWhatsApp(remoteJid, result.output);
    } catch (e) { console.error("Agent Logic Error:", e); }
}

// --- Webhook Endpoints ---

app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;
  
  // Only process incoming messages
  if (type === 'messages.upsert' && data.message) {
      const text = data.message.conversation || data.message.extendedTextMessage?.text;
      const remoteJid = data.key.remoteJid;
      const fromMe = data.key.fromMe;

      if (text && !fromMe) {
          // Process in background to keep webhook response fast
          processIncomingMessage(remoteJid, text, data.pushName);
      }
  }
  
  res.status(200).send('OK');
});

// For M-Pesa Callbacks
app.post('/callback/mpesa', (req, res) => {
    // Simply acknowledge. Polling handles the heavy lifting.
    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`🚀 Ena Coach WhatsApp Bot Live on port ${PORT}`));
