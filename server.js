
/**
 * Ena Coach AI Agent - Unified Production Server
 * Integrated: Gemini 3 AI, Evolution API (WhatsApp), & Daraja (M-Pesa)
 */

import 'dotenv/config'; 
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// --- Runtime Configuration (Synced with Admin Dashboard) ---
const runtimeConfig = {
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
    
    // M-Pesa (Daraja) Production Credentials
    darajaEnv: 'production', 
    darajaType: 'Till', 
    darajaKey: 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J',
    darajaSecret: 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm',
    darajaPasskey: '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f', 
    darajaShortcode: '5512238', 
    darajaStoreNumber: '4159923', 
    darajaAccountRef: 'ENA_COACH',
    darajaCallbackUrl: 'https://ena-coach-sec-agent.onrender.com/callback/mpesa',
};

const systemLogs = []; 
const userHistory = new Map(); 

// Mock DB for routes
let INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, type: 'Luxury' },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, type: 'Luxury' },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, type: 'Standard' },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, type: 'Luxury' },
];

function addSystemLog(msg, type = 'info') {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const getDarajaBaseUrl = () => runtimeConfig.darajaEnv === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

const app = express();
app.use(bodyParser.json());

// --- WhatsApp Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        return { success: false, message: "Check Hub: Missing URL or Token." };
    }

    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    
    // SMART SANITIZER: Convert 07... to 2547...
    let cleanJid = jid.replace(/[^0-9]/g, '');
    if (cleanJid.startsWith('0')) {
        cleanJid = '254' + cleanJid.substring(1);
    } else if (cleanJid.startsWith('7')) {
        cleanJid = '254' + cleanJid;
    }
    
    const instance = encodeURIComponent(runtimeConfig.instanceName.trim());
    const targetUrl = `${cleanUrl}/message/sendText/${instance}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': runtimeConfig.evolutionToken.trim(),
                'api-key': runtimeConfig.evolutionToken.trim() 
            },
            body: JSON.stringify({ 
                number: cleanJid, 
                text: text,
                options: { delay: 0, presence: "composing" }
            })
        });
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            if (response.ok) return { success: true };
            return { success: false, message: data.message || `Status ${response.status}` };
        } else {
            return { success: false, message: `Server Error: ${response.status}` };
        }
    } catch(e) { 
        return { success: false, message: `Network Error: ${e.message}` }; 
    }
}

// --- AI Response Logic ---
async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) return;
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        
        // Simpler context-free response for the direct webhook test
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User said: "${incomingText}". You are Martha from Ena Coach. Reply concisely.`,
            config: {
                systemInstruction: "You are Martha, the Ena Coach AI. Be helpful, professional, and concise. You assist with bus bookings in Kenya."
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
            addSystemLog(`Replied to ${phoneNumber} via AI`, 'success');
        }
    } catch (e) {
        addSystemLog(`AI Processing Failed: ${e.message}`, 'error');
    }
}

// --- WhatsApp Webhook Endpoint ---
app.post('/webhook', async (req, res) => {
    const { type, data } = req.body;
    
    // Log all incoming webhooks for debugging
    console.log(`[WEBHOOK] Received type: ${type}`);

    if (type === 'messages.upsert' && data?.message) {
        const remoteJid = data.key.remoteJid;
        const fromMe = data.key.fromMe;
        const pushName = data.pushName || 'Customer';
        
        // Extract text from standard conversation or extended text messages
        const text = data.message.conversation || data.message.extendedTextMessage?.text;

        if (text && !fromMe) {
            addSystemLog(`WhatsApp Msg from ${pushName} (${remoteJid}): "${text}"`, 'success');
            
            // Trigger AI response in background
            handleAIProcess(remoteJid, text);
        }
    } else {
        // Log other event types (status updates, etc)
        addSystemLog(`Webhook Event: ${type}`, 'info');
    }
    
    res.status(200).send('OK');
});

// --- M-Pesa Logic ---
function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  const auth = Buffer.from(`${runtimeConfig.darajaKey.trim()}:${runtimeConfig.darajaSecret.trim()}`).toString('base64');
  try {
    const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await response.json();
    return data.access_token;
  } catch (error) { 
      return null; 
  }
}

async function triggerSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  if (!token) return { success: false, message: "M-Pesa Auth Failed." };
  
  const timestamp = getDarajaTimestamp();
  const password = Buffer.from(`${runtimeConfig.darajaShortcode}${runtimeConfig.darajaPasskey}${timestamp}`).toString('base64');
  
  let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
  if (formattedPhone.startsWith('7')) formattedPhone = '254' + formattedPhone;

  const payload = {
    "BusinessShortCode": runtimeConfig.darajaShortcode,
    "Password": password,
    "Timestamp": timestamp,
    "TransactionType": runtimeConfig.darajaType === 'Till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
    "Amount": Math.ceil(amount),
    "PartyA": formattedPhone,
    "PartyB": runtimeConfig.darajaType === 'Till' ? runtimeConfig.darajaStoreNumber : runtimeConfig.darajaShortcode,
    "PhoneNumber": formattedPhone,
    "CallBackURL": runtimeConfig.darajaCallbackUrl,
    "AccountReference": runtimeConfig.darajaAccountRef,
    "TransactionDesc": "BusTicket"
  };

  try {
    const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.ResponseCode === "0") {
          return { success: true, checkoutRequestId: data.CheckoutRequestID };
      }
      return { success: false, message: data.CustomerMessage || data.ResponseDescription || "Gateway Rejected" };
  } catch (e) {
      return { success: false, message: "M-Pesa API Network Error" };
  }
}

// --- Diagnostic Endpoints ---
app.post('/api/test/gemini', async (req, res) => {
    try {
        if (!runtimeConfig.apiKey) throw new Error("API Key missing");
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Operational Ping" });
        res.json({ success: !!response.text });
    } catch (e) { res.status(200).json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, message: "Target phone required." });
    const result = await sendWhatsApp(phoneNumber, "🚀 Martha Engine Connection Test: SUCCESS. WhatsApp Integration is online.");
    addSystemLog(`WhatsApp Test to ${phoneNumber}: ${result.success ? 'PASSED' : 'FAILED - ' + result.message}`, result.success ? 'success' : 'error');
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, message: "Target phone required." });
    const result = await triggerSTKPush(phoneNumber, 1);
    addSystemLog(`M-Pesa Test to ${phoneNumber}: ${result.success ? 'PASSED' : 'FAILED - ' + result.message}`, result.success ? 'success' : 'error');
    res.json(result);
});

// --- Config & DB Endpoints ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("Integration settings updated.", "info");
    res.json({ success: true });
});

app.get('/api/routes', (req, res) => res.json(INTERNAL_ROUTES));
app.post('/api/routes', (req, res) => {
    const newRoute = { id: `R${Math.floor(Math.random()*900) + 100}`, ...req.body };
    INTERNAL_ROUTES.push(newRoute);
    res.json(newRoute);
});
app.put('/api/routes/:id', (req, res) => {
    const idx = INTERNAL_ROUTES.findIndex(r => r.id === req.params.id);
    if (idx !== -1) {
        INTERNAL_ROUTES[idx] = { ...INTERNAL_ROUTES[idx], ...req.body };
        return res.json(INTERNAL_ROUTES[idx]);
    }
    res.status(404).json({ error: 'Route not found' });
});
app.delete('/api/routes/:id', (req, res) => {
    INTERNAL_ROUTES = INTERNAL_ROUTES.filter(r => r.id !== req.params.id);
    res.json({ success: true });
});

app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

// --- Static Serving ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`Ena Coach Engine Operational on port ${PORT}`, 'info'));
