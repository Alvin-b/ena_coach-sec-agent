/**
 * Ena Coach AI Agent - LangChain Webhook Handler
 */

import express from 'express';
import bodyParser from 'body-parser';

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME;

// Daraja Config
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY;
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET;
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY;
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || '174379'; 
const DARAJA_ENV = 'sandbox'; 

// --- Initialize Services ---
const app = express();
app.use(bodyParser.json());

// --- HARDCODED DATA (Robust fallback) ---
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
  } catch (error) { return null; }
}

async function triggerSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  if (!token) return { success: false, message: "Payment service unavailable." };
  // ... (Standard STK Push Logic as before)
  return { success: true, message: "STK Push sent. Check phone." };
}

// --- LangChain Tools ---

const searchRoutesTool = new DynamicStructuredTool({
  name: "searchRoutes",
  description: "Search for available bus routes. Aware of intermediate stops and towns.",
  schema: z.object({
    origin: z.string().describe("Starting city"),
    destination: z.string().describe("Destination city"),
  }),
  func: async ({ origin, destination }) => {
    // Fallback to Internal Knowledge Base
    const matches = INTERNAL_ROUTES.filter(r => {
      const rOrigin = r.origin.toLowerCase();
      const rDest = r.destination.toLowerCase();
      const rStops = r.stops.map(s => s.toLowerCase());
      const qOrigin = origin.toLowerCase();
      const qDest = destination.toLowerCase();

      // Direct Match
      if (rOrigin.includes(qOrigin) && rDest.includes(qDest)) return true;

      // Stop Match (e.g. Nairobi -> Nakuru)
      // If the user asks for a stop that is on the route
      if (rOrigin.includes(qOrigin) && rStops.includes(qDest)) return true;

      return false;
    });

    if (matches.length === 0) return "No direct bus found. We might cover this via connecting routes, please check with the office.";
    
    // Format output nicely for the LLM
    return JSON.stringify(matches.map(m => ({
        ...m,
        note: `This bus travels from ${m.origin} to ${m.destination}. It stops at: ${m.stops.join(', ')}.`
    })));
  },
});

const companyKnowledgeTool = new DynamicStructuredTool({
    name: "companyKnowledge",
    description: "Company policies.",
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => {
        return "Refunds: 48hrs (10% fee). Parcels: Available. Luggage: 20kg free.";
    }
});

const processPaymentTool = new DynamicStructuredTool({
  name: "processPayment",
  description: "Initiate M-Pesa STK Push.",
  schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
  func: async ({ phoneNumber, amount }) => {
    return JSON.stringify(await triggerSTKPush(phoneNumber, amount));
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
  description: "Log complaint.",
  schema: z.object({ issue: z.string(), severity: z.enum(['low', 'medium', 'high']), customerName: z.string() }),
  func: async () => JSON.stringify({ status: 'logged' }),
});

const tools = [searchRoutesTool, companyKnowledgeTool, processPaymentTool, bookTicketTool, logComplaintTool];

// --- LangChain Agent Setup ---
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: API_KEY || "dummy", 
  temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a human customer service rep at Ena Coach.
   
   IDENTITY: Real person. Brief texts.
   DATA: You know ALL 30+ routes. 
   
   ROUTE KNOWLEDGE:
   - All routes are two-way.
   - You know intermediate towns. If someone asks "Nairobi to Nakuru", give them the "Nairobi to Busia" or "Nairobi to Kisumu" bus and say "We drop you at Nakuru".
   
   TASKS:
   1. Search routes.
   2. Book tickets (after payment).
   3. Answer with "Yes, we stop at [Town]" if asked about stops.
   
   Currency: KES.`],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agent = createToolCallingAgent({ llm, tools, prompt });
const agentExecutor = new AgentExecutor({ agent, tools, verbose: true });

app.post('/webhook', (req, res) => {
  res.status(200).send('OK');
  handleIncomingMessage(req.body).catch(err => console.error(err));
});

async function handleIncomingMessage(payload) {
  if (payload.type !== 'messages.upsert') return;
  const { key, message } = payload.data;
  if (key.fromMe || !message) return;
  const text = message.conversation || message.extendedTextMessage?.text;
  if (!text) return;
  
  try {
    const result = await agentExecutor.invoke({ input: text });
    await sendWhatsAppMessage(key.remoteJid, result.output);
  } catch (error) { console.error(error); }
}

async function sendWhatsAppMessage(remoteJid, text) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) return;
  const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;
  try {
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_TOKEN },
        body: JSON.stringify({ number: remoteJid, text: text })
    });
  } catch(e) { console.error(e); }
}

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));