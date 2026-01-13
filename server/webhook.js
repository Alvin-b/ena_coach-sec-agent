
/**
 * Ena Coach AI Agent - WhatsApp Webhook Bridge
 * Bridge between Evolution API (WhatsApp) and Gemini AI Agent
 */

import express from 'express';
import bodyParser from 'body-parser';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// --- Configuration & Environment ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'EnaCoach';

// M-Pesa Production Credentials (Synced with Main Server)
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J';
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm';
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY || '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f';
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '5512238'; 
const DARAJA_PARTY_B = process.env.DARAJA_PARTY_B || '4159923';

// Storage for Chat Context and Payments
const userSessions = new Map();

const INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500 },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500 },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600 },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500 },
];

const app = express();
app.use(bodyParser.json());

// --- Helper: Send WhatsApp Message via Evolution API ---
async function sendWhatsApp(jid, text) {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) {
        console.error("Evolution API Credentials Missing");
        return;
    }
    try {
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': EVOLUTION_API_TOKEN 
            },
            body: JSON.stringify({ 
                number: jid, 
                text: text 
            })
        });
        if (!response.ok) {
            const err = await response.text();
            console.error(`Evolution API Error: ${err}`);
        }
    } catch(e) { 
        console.error("Failed to send WhatsApp message:", e.message); 
    }
}

// --- Helper: Daraja M-Pesa Status Polling ---
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

async function checkPaymentStatus(checkoutId) {
    const token = await getDarajaToken();
    if (!token) return 'ERROR';
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
    
    try {
        const res = await fetch('https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                "BusinessShortCode": DARAJA_SHORTCODE, 
                "Password": password, 
                "Timestamp": timestamp, 
                "CheckoutRequestID": checkoutId 
            })
        });
        const data = await res.json();
        if (data.ResultCode === "0") return 'COMPLETED';
        if (['1032', '1037', '1'].includes(data.ResultCode)) return 'FAILED';
        return 'PENDING';
    } catch (e) { return 'ERROR'; }
}

function monitorPaymentAndFinalize(jid, checkoutId) {
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const status = await checkPaymentStatus(checkoutId);
        
        if (status === 'COMPLETED') {
            clearInterval(interval);
            // Proactively notify the AI agent of the success internally
            await processIncomingMessage(jid, `[PAYMENT_SUCCESS] Checkout: ${checkoutId}`);
        } else if (status === 'FAILED' || attempts > 24) { // Stop after 2 mins
            clearInterval(interval);
            if (status === 'FAILED') {
                await sendWhatsApp(jid, "❌ I couldn't verify your payment. Please ensure you entered the correct PIN and have enough balance, then try again.");
            }
        }
    }, 5000); // Poll every 5 seconds
}

// --- Agent Tools ---

const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Search for available bus routes between cities.",
  schema: z.object({ origin: z.string(), destination: z.string() }),
  func: async ({ origin, destination }) => {
     const matches = INTERNAL_ROUTES.filter(r => 
        r.origin.toLowerCase().includes(origin.toLowerCase()) && 
        r.destination.toLowerCase().includes(destination.toLowerCase())
     );
     return matches.length > 0 ? JSON.stringify(matches) : "No direct routes found for this search.";
  },
});

const initiatePaymentTool = new DynamicStructuredTool({
  name: "initiatePayment",
  description: "Triggers an M-Pesa STK Push. Use this when the user chooses a route and is ready to pay.",
  schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
  func: async ({ phoneNumber, amount }) => {
     const token = await getDarajaToken();
     if (!token) return "M-Pesa auth failed.";
     
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
            "CallBackURL": "https://ena-coach-bot.onrender.com/callback/mpesa", 
            "AccountReference": "EnaCoach", "TransactionDesc": "Bus Ticket"
          })
        });
        const data = await res.json();
        if (data.ResponseCode === "0") {
             const jid = formattedPhone + "@s.whatsapp.net";
             monitorPaymentAndFinalize(jid, data.CheckoutRequestID);
             return JSON.stringify({ success: true, checkoutId: data.CheckoutRequestID });
        }
        return "M-Pesa prompt could not be sent. Please check the number.";
     } catch (e) { return "Internal M-Pesa error."; }
  },
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Finalizes the booking and generates a ticket. Call this ONLY after [PAYMENT_SUCCESS].",
  schema: z.object({ passengerName: z.string(), routeId: z.string(), travelDate: z.string() }),
  func: async ({ passengerName, routeId, travelDate }) => {
    const ticketId = `E-TKT-${Math.floor(Math.random()*999999)}`;
    return JSON.stringify({ 
        status: 'success', 
        ticketId, 
        message: `CONFIRMED: ${passengerName}, Route ${routeId}, Date ${travelDate}. Seat allocated.` 
    });
  },
});

const tools = [searchRoutesTool, initiatePaymentTool, bookTicketTool];

// --- AI Agent Setup ---

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY,
  temperature: 0.1,
});

const promptTemplate = ChatPromptTemplate.fromMessages([
  ["system", `You are Martha, the Ena Coach AI Assistant.
  
  **CORE PRINCIPLES:**
  - BE REACTIVE: Never start the conversation. Only speak when spoken to.
  - NO WELCOME: Do not send a "Welcome" or "How can I help you" message as your first interaction unless the user asks for help.
  - PROACTIVE MONITORING: When you initiate a payment, say: "I've sent a prompt to your phone. Please enter your PIN. I'll finalize your ticket automatically once I detect the payment."
  - AUTOMATION: If you see the message "[PAYMENT_SUCCESS]", immediately call 'bookTicket' to finalize the booking.
  
  **OPERATIONS:**
  - Use [CURRENT TIME] in messages to understand "today" vs "tomorrow".
  - Ask only ONE question at a time.
  - Keep responses concise and formatted for WhatsApp.`],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt: promptTemplate });
const agentExecutor = new AgentExecutor({ agent, tools });

// --- Request Processing ---

async function processIncomingMessage(remoteJid, text, pushName = 'Customer') {
    try {
        const now = new Date();
        const fullTime = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
        
        let history = userSessions.get(remoteJid) || [];
        
        const result = await agentExecutor.invoke({
            input: `[CURRENT TIME: ${fullTime}]\nUser: ${text}`,
            chat_history: history
        });

        // Store history (keep it slim)
        history.push(new HumanMessage(text));
        history.push(new AIMessage(result.output));
        if (history.length > 10) history = history.slice(-10);
        userSessions.set(remoteJid, history);

        // Send reply back to WhatsApp
        await sendWhatsApp(remoteJid, result.output);
    } catch (e) { 
        console.error("AI Agent Error:", e);
        if (text.includes('[PAYMENT_SUCCESS]')) {
            await sendWhatsApp(remoteJid, "✅ Your payment was received! However, I encountered a temporary error generating your ticket. An agent will contact you shortly.");
        }
    }
}

// --- Webhook Endpoint ---

app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;
  
  // Handle Evolution API Webhook Payload
  if (type === 'messages.upsert' && data?.message) {
      const remoteJid = data.key.remoteJid;
      const fromMe = data.key.fromMe;
      
      // Extract text from standard conversation or extended text messages
      const text = data.message.conversation || data.message.extendedTextMessage?.text;

      if (text && !fromMe) {
          // Offload to background process to respond within webhook timeout
          processIncomingMessage(remoteJid, text, data.pushName);
      }
  }
  
  res.status(200).send('OK');
});

// Acknowledgement for M-Pesa Callbacks (Polling handles status)
app.post('/callback/mpesa', (req, res) => {
    res.sendStatus(200);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Ena Coach WhatsApp Bridge Online`);
    console.log(`📍 Webhook Endpoint: http://your-domain:${PORT}/webhook`);
    console.log(`🤖 Model: Gemini 2.5 Flash\n`);
});
