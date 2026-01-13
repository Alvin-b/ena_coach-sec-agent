
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
    darajaCallbackUrl: 'https://ena-coach-bot.onrender.com/callback/mpesa',
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
        return { success: false, message: "WhatsApp Provider not configured." };
    }
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    try {
        const response = await fetch(`${cleanUrl}/message/sendText/${runtimeConfig.instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: jid, text: text })
        });
        const data = await response.json();
        if (response.ok) return { success: true };
        return { success: false, message: data.message || "Failed to send message." };
    } catch(e) { 
        return { success: false, message: e.message }; 
    }
}

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
  } catch (error) { return null; }
}

async function triggerSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  if (!token) return { success: false, message: "M-Pesa Token Error (Check Credentials)" };
  
  const timestamp = getDarajaTimestamp();
  const password = Buffer.from(`${runtimeConfig.darajaShortcode}${runtimeConfig.darajaPasskey}${timestamp}`).toString('base64');
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');

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
      return { success: false, message: data.CustomerMessage || data.ResponseDescription };
  } catch (e) {
      return { success: false, message: "M-Pesa Network Timeout" };
  }
}

// --- Diagnostic Endpoints ---
app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Operational Ping" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const { phoneNumber } = req.body;
    const result = await sendWhatsApp(phoneNumber, "🚀 Martha System Test: WhatsApp Integration Connected.");
    addSystemLog(`WhatsApp Test to ${phoneNumber}: ${result.success ? 'PASSED' : 'FAILED'}`, result.success ? 'success' : 'error');
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const { phoneNumber } = req.body;
    const result = await triggerSTKPush(phoneNumber, 1);
    addSystemLog(`M-Pesa Test to ${phoneNumber}: ${result.success ? 'PASSED' : 'FAILED'}`, result.success ? 'success' : 'error');
    res.json(result);
});

// --- Config & DB Endpoints ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("System configuration updated by Admin.", "info");
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

app.listen(PORT, '0.0.0.0', () => addSystemLog(`Martha Engine Live on port ${PORT}`, 'info'));
