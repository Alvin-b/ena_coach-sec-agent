
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
const userHistory = new Map(); // Session management for WhatsApp JIDs

function addSystemLog(msg, type = 'info') {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, type: 'Luxury' },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, type: 'Luxury' },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, type: 'Standard' },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, type: 'Luxury' },
];

const getDarajaBaseUrl = () => runtimeConfig.darajaEnv === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

const app = express();
app.use(bodyParser.json());

// --- Evolution API (WhatsApp) Logic ---

async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    try {
        const response = await fetch(`${cleanUrl}/message/sendText/${runtimeConfig.instanceName}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': runtimeConfig.evolutionToken 
            },
            body: JSON.stringify({ number: jid, text: text })
        });
        if (!response.ok) {
            const err = await response.text();
            addSystemLog(`Evolution API Error: ${err}`, 'error');
            return { success: false, error: err };
        }
        return { success: true };
    } catch(e) { 
        addSystemLog(`WhatsApp Service Error: ${e.message}`, 'error'); 
        return { success: false, error: e.message };
    }
}

// --- Daraja M-Pesa Logic ---

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
      addSystemLog("M-Pesa Token Auth Failed", 'error');
      return null; 
  }
}

async function triggerSTKPush(phoneNumber, amount) {
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  const token = await getDarajaToken();
  if (!token) return { success: false, message: "M-Pesa Authentication Error" };
  
  const timestamp = getDarajaTimestamp();
  const password = Buffer.from(`${runtimeConfig.darajaShortcode}${runtimeConfig.darajaPasskey}${timestamp}`).toString('base64');
  
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
          addSystemLog(`STK Push dispatched to ${formattedPhone}`, 'success');
          return { success: true, checkoutRequestId: data.CheckoutRequestID };
      }
      return { success: false, message: data.CustomerMessage || data.ResponseDescription };
  } catch (e) {
      return { success: false, message: "M-Pesa Timeout" };
  }
}

async function queryMpesaStatus(id) {
    const token = await getDarajaToken();
    if (!token) return 'ERROR';
    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${runtimeConfig.darajaShortcode}${runtimeConfig.darajaPasskey}${timestamp}`).toString('base64');
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "BusinessShortCode": runtimeConfig.darajaShortcode,
                "Password": password,
                "Timestamp": timestamp,
                "CheckoutRequestID": id
            })
        });
        const data = await response.json();
        if (data.ResultCode === "0") return 'COMPLETED';
        if (['1032', '1037', '1'].includes(data.ResultCode)) return 'FAILED';
        return 'PENDING';
    } catch (e) { return 'ERROR'; }
}

function monitorPaymentAndNotify(jid, checkoutId) {
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const status = await queryMpesaStatus(checkoutId);
        if (status === 'COMPLETED') {
            clearInterval(interval);
            addSystemLog(`Confirmed Payment: ${checkoutId} for ${jid}`, 'success');
            // Re-trigger the message processor with the success signal
            processWhatsAppMessage(jid, `[PAYMENT_SUCCESS] Checkout: ${checkoutId}`);
        } else if (status === 'FAILED' || attempts > 24) {
            clearInterval(interval);
            if (status === 'FAILED') sendWhatsApp(jid, "❌ Payment failed. Please try again when prompted.");
        }
    }, 5000);
}

// --- WhatsApp Message Processing Engine ---

async function processWhatsAppMessage(remoteJid, text) {
    if (!runtimeConfig.apiKey) return addSystemLog("No Gemini API Key found.", "error");
    
    const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
    const now = new Date();
    const fullTime = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });

    let history = userHistory.get(remoteJid) || [];
    const contents = [...history, { role: 'user', parts: [{ text: `[CURRENT TIME: ${fullTime}]\nMessage: ${text}` }] }];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents,
            config: {
                systemInstruction: "You are Martha, the Ena Coach AI. Wait for users to speak first. If you trigger M-Pesa, tell them you'll finalize automatically. If you see [PAYMENT_SUCCESS], call 'bookTicket' immediately. Short WhatsApp replies.",
                tools: [{ functionDeclarations: [searchRoutesTool, initiatePaymentTool, bookTicketTool] }]
            }
        });

        let currentResponse = response;
        
        if (response.functionCalls) {
            const toolResults = [];
            for (const call of response.functionCalls) {
                let toolResult;
                if (call.name === 'searchRoutes') {
                    const matches = INTERNAL_ROUTES.filter(r => 
                        r.origin.toLowerCase().includes(call.args.origin.toLowerCase()) && 
                        r.destination.toLowerCase().includes(call.args.destination.toLowerCase())
                    );
                    toolResult = matches.length > 0 ? matches : "No routes found.";
                } 
                else if (call.name === 'initiatePayment') {
                    const res = await triggerSTKPush(call.args.phoneNumber, call.args.amount);
                    if (res.success) monitorPaymentAndNotify(remoteJid, res.checkoutRequestId);
                    toolResult = res;
                } 
                else if (call.name === 'bookTicket') {
                    toolResult = { 
                        status: 'success', 
                        ticketId: `EC-${Math.floor(Math.random()*99999)}`, 
                        message: "Booking confirmed. Show this on your phone." 
                    };
                }
                toolResults.push({ functionResponse: { name: call.name, response: { result: toolResult }, id: call.id } });
            }

            currentResponse = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [...contents, { role: 'model', parts: response.candidates[0].content.parts }, { role: 'user', parts: toolResults }]
            });
        }

        const reply = currentResponse.text;
        history.push({ role: 'user', parts: [{ text }] }, { role: 'model', parts: [{ text: reply }] });
        if (history.length > 10) history = history.slice(-10);
        userHistory.set(remoteJid, history);

        await sendWhatsApp(remoteJid, reply);
    } catch (e) {
        addSystemLog(`Gemini Error: ${e.message}`, "error");
    }
}

// --- Gemini Tool Definitions (Duplicated for simple object structure) ---
const searchRoutesTool = {
  name: "searchRoutes",
  parameters: {
    type: Type.OBJECT,
    properties: { origin: { type: Type.STRING }, destination: { type: Type.STRING } },
    required: ["origin", "destination"]
  }
};

const initiatePaymentTool = {
  name: "initiatePayment",
  parameters: {
    type: Type.OBJECT,
    properties: { phoneNumber: { type: Type.STRING }, amount: { type: Type.NUMBER } },
    required: ["phoneNumber", "amount"]
  }
};

const bookTicketTool = {
  name: "bookTicket",
  parameters: {
    type: Type.OBJECT,
    properties: { passengerName: { type: Type.STRING }, routeId: { type: Type.STRING } },
    required: ["passengerName", "routeId"]
  }
};

// --- Endpoints ---

// Diagnostics API
app.post('/api/test/gemini', async (req, res) => {
    if (!runtimeConfig.apiKey) return res.json({ success: false, message: "No API Key configured." });
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: "Operational status check. Reply with 'MARTHA_ONLINE'."
        });
        const text = response.text;
        const success = text && text.includes('MARTHA_ONLINE');
        addSystemLog(`Gemini Test: ${success ? 'PASSED' : 'FAILED'}`, success ? 'success' : 'error');
        res.json({ success, response: text });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, message: "Target phone number required." });
    const result = await sendWhatsApp(phoneNumber, "🚀 Ena Coach System Test: Your WhatsApp Integration is working perfectly!");
    addSystemLog(`WhatsApp Test to ${phoneNumber}: ${result.success ? 'PASSED' : 'FAILED'}`, result.success ? 'success' : 'error');
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, message: "Target phone number required." });
    const result = await triggerSTKPush(phoneNumber, 1); // 1 KES test
    addSystemLog(`M-Pesa Test to ${phoneNumber}: ${result.success ? 'PASSED' : 'FAILED'}`, result.success ? 'success' : 'error');
    res.json(result);
});

app.post('/webhook', async (req, res) => {
  const event = req.body.event || req.body.type;
  const data = req.body.data;
  if (event === 'messages.upsert' && data?.message) {
      const text = data.message.conversation || data.message.extendedTextMessage?.text;
      const remoteJid = data.key.remoteJid;
      if (text && !data.key.fromMe) {
          addSystemLog(`Incoming WhatsApp from ${remoteJid}`, 'info');
          processWhatsAppMessage(remoteJid, text);
      }
  }
  res.status(200).send('OK');
});

app.post('/callback/mpesa', (req, res) => {
    addSystemLog("M-Pesa Callback Handled.", "success");
    res.sendStatus(200);
});

app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`Ena Coach Engine Live on port ${PORT}`, 'info'));
