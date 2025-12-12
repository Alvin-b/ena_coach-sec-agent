/**
 * Ena Coach AI Agent - Real Webhook Handler (Backend)
 * 
 * =========================================================
 * DEPLOYMENT GUIDE
 * =========================================================
 * This file CANNOT run inside the browser. It must be deployed to a Node.js server.
 * 
 * Recommended Hosting (Free Tier):
 * 1. Render.com (Web Service)
 * 2. Railway.app
 * 3. Heroku
 * 
 * Setup Instructions:
 * 1. Create a new Node.js project.
 * 2. Copy this file content to 'index.js'.
 * 3. Create a 'package.json' with dependencies:
 *    {
 *      "name": "ena-coach-bot",
 *      "main": "index.js",
 *      "dependencies": {
 *        "express": "^4.18.2",
 *        "body-parser": "^1.20.2",
 *        "@google/genai": "^1.33.0",
 *        "dotenv": "^16.3.1"
 *      }
 *    }
 * 4. Set the following Environment Variables on your server:
 *    - GEMINI_API_KEY: (Your Google Gemini Key)
 *    - EVOLUTION_API_URL: (e.g. https://api.evolution-api.com)
 *    - EVOLUTION_API_TOKEN: (Your Global API Token)
 *    - INSTANCE_NAME: (e.g. EnaCoach)
 * 
 * 5. Deploy.
 * 6. Copy your public URL (e.g., https://my-app.onrender.com) + /webhook
 * 7. Paste that URL into Evolution API Manager.
 * =========================================================
 */

import express from 'express';
import bodyParser from 'body-parser';
import { GoogleGenAI, Type } from '@google/genai';

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
// Clean URL by removing trailing slash if present
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
const EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN;
const INSTANCE_NAME = process.env.INSTANCE_NAME;

// Log config status on startup
console.log("Starting Ena Coach AI Server...");
if (!API_KEY) console.warn("WARNING: GEMINI_API_KEY is missing.");
if (!EVOLUTION_API_URL) console.warn("WARNING: EVOLUTION_API_URL is missing.");
if (!EVOLUTION_API_TOKEN) console.warn("WARNING: EVOLUTION_API_TOKEN is missing.");

// --- Initialize Services ---
const app = express();
app.use(bodyParser.json());

const ai = new GoogleGenAI({ apiKey: API_KEY || 'dummy_key_if_missing' });

// --- Tool Definitions ---
// These match the frontend tools. 
// In a real production app, implement actual DB calls inside the webhook handler.
const tools = [
  {
    name: 'searchRoutes',
    description: 'Search for available bus routes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        origin: { type: Type.STRING },
        destination: { type: Type.STRING },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'bookTicket',
    description: 'Book a ticket for a passenger.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        passengerName: { type: Type.STRING },
        routeId: { type: Type.STRING },
        phoneNumber: { type: Type.STRING },
      },
      required: ['passengerName', 'routeId', 'phoneNumber'],
    },
  },
  {
    name: 'trackBus',
    description: 'Track bus location.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Ticket ID or Route ID" },
      },
      required: ['query'],
    },
  },
];

// --- Root Endpoint (Health Check) ---
app.get('/', (req, res) => {
  res.send('Ena Coach AI Agent is running. Point Evolution API Webhook to /webhook');
});

// --- Webhook Endpoint ---
app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    
    // Log minimal info
    if (payload.type) console.log(`Received Event: ${payload.type}`);

    // Filter for Message Upsert
    if (payload.type === 'messages.upsert') {
      const { key, message, pushName } = payload.data;
      
      // Ignore messages sent by me or invalid messages
      if (key.fromMe || !message) {
        return res.status(200).send('Ignored');
      }

      const remoteJid = key.remoteJid;
      // Extract text from various message types (conversation, extendedTextMessage, etc.)
      const text = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption;

      if (!text) {
        return res.status(200).send('No text');
      }

      console.log(`[User: ${pushName}] says: ${text}`);

      // Optional: Send typing indicator
      // await sendPresence(remoteJid, 'composing');

      // Process with Gemini
      if (!API_KEY) {
        console.error("Cannot reply: API Key missing");
        return res.status(500).send("Server Config Error");
      }

      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: `You are the Ena Coach AI Agent on WhatsApp. 
          Your goal is to assist customers with booking, tracking, and complaints.
          Keep responses short, friendly, and formatted for WhatsApp (use *bold* for emphasis).
          Do not ask for payment details directly in chat, use the processPayment tool.
          Current Time: ${new Date().toLocaleString()}`,
          tools: [{ functionDeclarations: tools }]
        }
      });

      const result = await chat.sendMessage({ message: text });
      
      // --- Handle Tool Calls (Mock Implementation) ---
      // In production, execute SQL queries against Supabase here based on function calls.
      let replyText = result.text;
      
      if (!replyText && result.functionCalls && result.functionCalls.length > 0) {
          const fn = result.functionCalls[0];
          console.log(`[AI Tool Call] ${fn.name} args:`, fn.args);

          // Simulated Logic for the demo
          if (fn.name === 'searchRoutes') {
            replyText = `We have found *2 buses* from ${fn.args.origin} to ${fn.args.destination}:\n1. Luxury (08:00 AM) - KES 1500\n2. Standard (09:00 PM) - KES 1200`;
          } 
          else if (fn.name === 'trackBus') {
            replyText = `📍 *Bus Tracking*\nRoute: ${fn.args.query}\nLocation: Approaching Nakuru\nEst. Arrival: 2:00 PM`;
          }
          else if (fn.name === 'bookTicket') {
             replyText = `✅ Ticket Reserved for *${fn.args.passengerName}*.\nPlease complete payment sent to ${fn.args.phoneNumber} to confirm seat.`;
          }
          else {
             replyText = "I am processing your request with the Ena Coach head office.";
          }
      }

      if (!replyText) replyText = "Sorry, I didn't catch that. Could you rephrase?";

      // Send Reply via Evolution API
      await sendWhatsAppMessage(remoteJid, replyText);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// --- Helper: Send Message ---
async function sendWhatsAppMessage(remoteJid, text) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) {
    console.error("Cannot send WhatsApp message: Missing Evolution API Config");
    return;
  }

  const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_TOKEN
      },
      body: JSON.stringify({
        number: remoteJid,
        text: text
      })
    });

    const data = await response.json();
    console.log('Reply Sent Status:', response.status);
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
