/**
 * Ena Coach AI Agent - LangChain Webhook Handler
 * 
 * =========================================================
 * DEPLOYMENT GUIDE
 * =========================================================
 * 1. Deploy this code to a public Node.js server (Render, Railway, Heroku).
 * 2. Set Environment Variables:
 *    - GEMINI_API_KEY
 *    - EVOLUTION_API_URL
 *    - EVOLUTION_API_TOKEN
 *    - INSTANCE_NAME
 *    - SUPABASE_URL
 *    - SUPABASE_KEY
 *    - DARAJA_CONSUMER_KEY
 *    - DARAJA_CONSUMER_SECRET
 *    - DARAJA_PASSKEY
 *    - DARAJA_SHORTCODE (Default Sandbox: 174379)
 * 3. Your Webhook URL will be: https://<your-domain>/webhook
 * =========================================================
 */

import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME;

// Database Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Daraja Config
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY;
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET;
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY;
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '174379'; 
const DARAJA_ENV = 'sandbox'; 

// --- Initialize Services ---
const app = express();
app.use(bodyParser.json());

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("✅ Connected to Supabase");
} else {
  console.warn("⚠️ Supabase credentials missing. Using fallback mock data.");
}

// --- Daraja Helper Functions ---
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
  } catch (error) {
    console.error("Daraja Auth Error:", error);
    return null;
  }
}

async function triggerSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  if (!token) return { success: false, message: "Payment service unavailable (Auth failed)." };

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
    "CallBackURL": `https://placeholder.com/callback`, 
    "AccountReference": "EnaCoach",
    "TransactionDesc": "Bus Ticket"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (data.ResponseCode === "0") {
      return { success: true, message: "STK Push sent. Please check your phone to enter PIN." };
    } else {
      return { success: false, message: `Payment failed: ${data.errorMessage || 'Unknown error'}` };
    }
  } catch (error) {
    return { success: false, message: "Network error connecting to payment gateway." };
  }
}

// --- LangChain Tools ---

const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Search for available bus routes. Returns list of buses with prices and times. If no args provided, lists all routes.",
  schema: z.object({
    origin: z.string().optional().describe("Starting city"),
    destination: z.string().optional().describe("Destination city"),
  }),
  func: async ({ origin, destination }) => {
    if (supabase) {
      let query = supabase.from('routes').select('*');
      if (origin) query = query.ilike('origin', `%${origin}%`);
      if (destination) query = query.ilike('destination', `%${destination}%`);
      
      const { data, error } = await query;
      if (error) return JSON.stringify({ error: "Database error" });
      return JSON.stringify(data || []);
    } else {
      // Mock Data
      const allRoutes = [
        { id: 'R1', origin: 'Nairobi', destination: 'Kisumu', time: '08:00 AM', price: 1500, type: 'Luxury', seats: 24 },
        { id: 'R2', origin: 'Nairobi', destination: 'Mombasa', time: '09:00 PM', price: 1200, type: 'Standard', seats: 45 },
        { id: 'R3', origin: 'Kisumu', destination: 'Nairobi', time: '07:00 AM', price: 1500, type: 'Luxury', seats: 12 }
      ];
      if (!origin && !destination) return JSON.stringify(allRoutes);
      return JSON.stringify(allRoutes.filter(r => 
        (!origin || r.origin.toLowerCase().includes(origin.toLowerCase())) &&
        (!destination || r.destination.toLowerCase().includes(destination.toLowerCase()))
      ));
    }
  },
});

const companyKnowledgeTool = new DynamicStructuredTool({
  name: "companyKnowledge",
  description: "Retrieve general company information, policies, contact details, or service catalog.",
  schema: z.object({
      query: z.string().describe("The topic to search for (e.g., 'refund policy', 'parcel services', 'office location', 'about us')"),
  }),
  func: async ({ query }) => {
      // If we had a vector store, we'd search it here. 
      // For now, we simulate a 'knowledge_base' table or a static map.
      if (supabase) {
           const { data } = await supabase
              .from('company_info')
              .select('content')
              .ilike('topic', `%${query}%`)
              .limit(1);
           
           if (data && data.length > 0) return data[0].content;
      }
      
      // Fallback Knowledge Base
      const kb = {
          "refund": "Refunds within 48hrs. 10% fee.",
          "parcel": "Parcel services available. From KES 300.",
          "location": "Main office: KPCU Building, Nairobi.",
          "contact": "Call 0712345678.",
          "luggage": "1 suitcase free (20kg).",
          "pet": "Small pets in carriers allowed.",
          "about": "Ena Coach is a leading transport company in Kenya."
      };
      
      for (const [key, value] of Object.entries(kb)) {
          if (query.toLowerCase().includes(key)) return value;
      }
      
      return "I couldn't find specific details. Please call our office.";
  }
});

const processPaymentTool = new DynamicStructuredTool({
  name: "processPayment",
  description: "Initiate M-Pesa STK Push payment. Required before booking.",
  schema: z.object({
    phoneNumber: z.string().describe("Customer phone number (e.g., 2547...)"),
    amount: z.number().describe("Amount to charge in KES"),
  }),
  func: async ({ phoneNumber, amount }) => {
    return JSON.stringify(await triggerSTKPush(phoneNumber, amount));
  },
});

const bookTicketTool = new DynamicStructuredTool({
  name: "bookTicket",
  description: "Finalize booking after payment. Updates available seats and generates a ticket with QR code.",
  schema: z.object({
    passengerName: z.string(),
    routeId: z.string(),
    phoneNumber: z.string(),
  }),
  func: async ({ passengerName, routeId, phoneNumber }) => {
    const ticketId = `TKT-${Math.floor(Math.random() * 10000)}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${ticketId}`;
    
    if (supabase) {
      // 1. Transaction-like: Check seats -> Decrement -> Insert Ticket
      
      // Fetch Route
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('available_seats')
        .eq('id', routeId)
        .single();
        
      if (routeError || !route) return JSON.stringify({ error: "Route not found" });
      if (route.available_seats < 1) return JSON.stringify({ error: "Route is fully booked." });

      // Update Seats
      const { error: updateError } = await supabase
        .from('routes')
        .update({ available_seats: route.available_seats - 1 })
        .eq('id', routeId);
        
      if (updateError) return JSON.stringify({ error: "Failed to reserve seat." });

      // Create Ticket
      const { error: ticketError } = await supabase.from('tickets').insert({
        passenger_name: passengerName,
        route_id: routeId,
        phone: phoneNumber,
        ticket_id: ticketId,
        status: 'booked',
        boarding_status: 'pending',
        qr_code_url: qrCodeUrl,
        created_at: new Date()
      });

      if (ticketError) return JSON.stringify({ error: "Failed to generate ticket record." });
    }
    
    return JSON.stringify({ 
        status: 'success', 
        ticketId, 
        qrCodeUrl,
        message: 'Ticket generated. Present QR for boarding.' 
    });
  },
});

const logComplaintTool = new DynamicStructuredTool({
  name: "logComplaint",
  description: "Log a complex customer complaint to the escalation queue for admin review.",
  schema: z.object({
    issue: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    customerName: z.string(),
  }),
  func: async ({ issue, severity, customerName }) => {
    if (supabase) {
      await supabase.from('complaints').insert({
        customer_name: customerName,
        issue: issue,
        severity: severity,
        status: 'open'
      });
    }
    return JSON.stringify({ status: 'logged', reference: "CMP-" + Date.now().toString().slice(-4) });
  },
});

const tools = [searchRoutesTool, companyKnowledgeTool, processPaymentTool, bookTicketTool, logComplaintTool];

// --- LangChain Agent Setup ---
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY || "dummy", 
  temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a human customer service representative for Ena Coach.
   
   YOUR PERSONA:
   - You are HUMAN. You are NOT an AI, bot, or assistant.
   - You work at the Ena Coach office.
   - Your replies must be VERY BRIEF and DIRECT. Text like a human. No long paragraphs.
   
   DATA SAFETY:
   - NEVER leak internal IDs, database keys, or raw JSON.
   - Only share the specific Ticket details meant for the user.
   
   TASKS:
   1. Search routes ('searchRoutes').
   2. Answer policies using 'companyKnowledge'.
   3. Process M-Pesa payments ('processPayment').
   4. Book tickets ('bookTicket') - ONLY after payment.
   5. Log complex issues ('logComplaint').
   
   IMPORTANT: 
   - When a ticket is booked, send the QR Code URL to the user and tell them to show it when boarding.
   
   Current Date: {date}
   Currency: KES`],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agent = createToolCallingAgent({
  llm,
  tools,
  prompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: true,
  maxIterations: 5, 
});

// --- Webhook Endpoint ---
app.post('/webhook', (req, res) => {
  // 1. NON-BLOCKING: Send 200 OK immediately
  res.status(200).send('OK');

  // 2. Process logic asynchronously
  handleIncomingMessage(req.body).catch(err => {
    console.error("Async Processing Error:", err);
  });
});

async function handleIncomingMessage(payload) {
  if (payload.type !== 'messages.upsert') return;
  
  const { key, message, pushName } = payload.data;
  if (key.fromMe || !message) return;

  const remoteJid = key.remoteJid;
  const text = message.conversation || message.extendedTextMessage?.text;

  if (!text) return;

  console.log(`[WhatsApp] Processing async message from ${pushName}: ${text}`);

  try {
    const result = await agentExecutor.invoke({
      input: text,
      date: new Date().toDateString()
    });

    const replyText = result.output;
    await sendWhatsAppMessage(remoteJid, replyText);

  } catch (error) {
    console.error("LangChain Agent Error:", error);
    await sendWhatsAppMessage(remoteJid, "System's a bit busy. Try again shortly.");
  }
}

// --- Helper: Send Message ---
async function sendWhatsAppMessage(remoteJid, text) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) return;

  const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;
  try {
    await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_TOKEN
        },
        body: JSON.stringify({ number: remoteJid, text: text })
    });
  } catch(e) { console.error("Send Error", e); }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});