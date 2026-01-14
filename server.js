
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

// --- Runtime Configuration (Persistent in memory during process) ---
const runtimeConfig = {
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
    
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

function addSystemLog(msg, type = 'info') {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

/** 
 * GLOBAL TRAFFIC SNIFFER (Aggressive)
 * This logs EVERY request hitting the server to diagnose delivery issues.
 */
app.use((req, res, next) => {
    // Log static file requests only once to keep terminal clean
    const isAsset = req.url.match(/\.(js|css|png|jpg|svg|ico|map)$/) || req.url.startsWith('/@');
    if (!isAsset) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const method = req.method;
        const path = req.url;
        addSystemLog(`TRAFFIC: ${method} ${path} | IP: ${ip}`, 'info');
    }
    next();
});

// Robust Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' })); 

// --- WhatsApp Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        addSystemLog("CONFIG ERROR: Evolution API URL/Token is empty.", "error");
        return { success: false, message: "Missing Evolution Config." };
    }
    
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    let cleanNumber = jid.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = '254' + cleanNumber.substring(1);
    else if (cleanNumber.startsWith('7')) cleanNumber = '254' + cleanNumber;
    
    const instance = encodeURIComponent(runtimeConfig.instanceName.trim());
    const targetUrl = `${cleanUrl}/message/sendText/${instance}`;

    addSystemLog(`ATTEMPT: Sending WhatsApp to ${cleanNumber}...`, 'info');

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': runtimeConfig.evolutionToken.trim()
            },
            body: JSON.stringify({ 
                number: cleanNumber, 
                text: text,
                options: { delay: 1000, presence: "composing" }
            })
        });
        
        if (response.ok) {
            addSystemLog(`SUCCESS: WhatsApp delivered to ${cleanNumber}`, 'success');
            return { success: true };
        } else {
            const errBody = await response.text();
            addSystemLog(`GATEWAY ERROR: Evolution API ${response.status} | Body: ${errBody.substring(0, 100)}`, 'error');
            return { success: false, message: `Status ${response.status}` };
        }
    } catch(e) { 
        addSystemLog(`NETWORK ERROR: Failed to reach Evolution API: ${e.message}`, 'error');
        return { success: false, message: e.message }; 
    }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) {
            addSystemLog("AI HALTED: Gemini API Key is missing. Check Integration Tab.", "error");
            return;
        }
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". You are Martha from Ena Coach. Reply briefly.`,
            config: { 
                systemInstruction: "You are Martha, the Ena Coach AI. Keep replies under 50 words. Focus on booking buses in Kenya." 
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
        }
    } catch (e) { 
        addSystemLog(`AI ERROR: Gemini processing failed: ${e.message}`, 'error'); 
    }
}

// --- High-Resilience Webhook ---
// Support for GET validation (some services ping the URL to check if it exists)
app.get('/webhook', (req, res) => {
    addSystemLog("WEBHOOK PROBE: GET /webhook received (Validation check).", "success");
    res.status(200).send('Martha Webhook Active');
});

app.post('/webhook', async (req, res) => {
    addSystemLog(`WEBHOOK PULSE: POST /webhook hit.`, 'success');
    
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {
            addSystemLog("WEBHOOK WARNING: Raw payload is not JSON. Attempting string parsing...", "error");
        }
    }

    const eventType = payload.event || payload.type;
    const data = payload.data;
    
    if (eventType) {
        addSystemLog(`WEBHOOK EVENT: ${eventType} detected.`, 'success');
    } else {
        const bodyKeys = Object.keys(payload || {});
        addSystemLog(`WEBHOOK UNKNOWN: Received payload with keys [${bodyKeys.join(', ')}].`, 'error');
    }

    if ((eventType === 'messages.upsert' || eventType === 'MESSAGES_UPSERT') && data) {
        const messageObj = Array.isArray(data) ? data[0] : data;
        if (messageObj?.key) {
            const remoteJid = messageObj.key.remoteJid;
            const fromMe = messageObj.key.fromMe;
            const text = messageObj.message?.conversation || 
                         messageObj.message?.extendedTextMessage?.text ||
                         messageObj.message?.imageMessage?.caption;

            if (text && !fromMe) {
                addSystemLog(`MESSAGE RECEIVED: "${text}" from ${remoteJid}`, 'success');
                handleAIProcess(remoteJid, text);
            }
        }
    }
    res.status(200).send('OK');
});

// --- M-Pesa Logic ---
const getDarajaBaseUrl = () => runtimeConfig.darajaEnv === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

function getDarajaTimestamp() {
    const now = new Date();
    return now.getFullYear() +
        ('0' + (now.getMonth() + 1)).slice(-2) +
        ('0' + now.getDate()).slice(-2) +
        ('0' + now.getHours()).slice(-2) +
        ('0' + now.getMinutes()).slice(-2) +
        ('0' + now.getSeconds()).slice(-2);
}

async function getDarajaToken() {
    const key = runtimeConfig.darajaKey.trim();
    const secret = runtimeConfig.darajaSecret.trim();
    if (!key || !secret) {
        addSystemLog("M-PESA ERROR: Consumer Key or Secret is missing.", "error");
        return null;
    }

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        const data = await response.json();
        if (data.access_token) return data.access_token;
        addSystemLog(`M-PESA AUTH FAILED: ${JSON.stringify(data)}`, 'error');
        return null;
    } catch (error) { 
        addSystemLog(`M-PESA NETWORK ERROR: ${error.message}`, 'error');
        return null; 
    }
}

async function triggerSTKPush(phoneNumber, amount) {
    addSystemLog(`M-PESA START: Initiating STK Push for KES ${amount} to ${phoneNumber}...`, 'info');
    
    const token = await getDarajaToken();
    if (!token) return { success: false, message: "Authentication Failed with Safaricom." };
    
    const timestamp = getDarajaTimestamp();
    const shortcode = runtimeConfig.darajaShortcode.trim();
    const passkey = runtimeConfig.darajaPasskey.trim();
    
    if (!shortcode || !passkey) {
        addSystemLog("M-PESA ERROR: Shortcode or Passkey is missing.", "error");
        return { success: false, message: "Missing Shortcode/Passkey." };
    }

    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    
    let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('7')) formattedPhone = '254' + formattedPhone;

    const payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": runtimeConfig.darajaType === 'Till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone,
        "PartyB": runtimeConfig.darajaType === 'Till' ? runtimeConfig.darajaStoreNumber.trim() : shortcode,
        "PhoneNumber": formattedPhone,
        "CallBackURL": runtimeConfig.darajaCallbackUrl.trim(),
        "AccountReference": runtimeConfig.darajaAccountRef.trim() || 'EnaCoach',
        "TransactionDesc": "Bus Ticket Booking"
    };

    try {
        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST', 
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            addSystemLog(`M-PESA SUCCESS: STK Push triggered. ReqID: ${data.CheckoutRequestID}`, 'success');
            return { success: true, checkoutRequestId: data.CheckoutRequestID };
        }
        addSystemLog(`M-PESA REJECTED: ${data.CustomerMessage || data.ResponseDescription}`, 'error');
        return { success: false, message: data.CustomerMessage || data.ResponseDescription || "Gateway Rejected" };
    } catch (e) {
        addSystemLog(`M-PESA API ERROR: ${e.message}`, 'error');
        return { success: false, message: "M-Pesa API is unreachable." };
    }
}

// Health check and root route
app.get('/health', (req, res) => res.send('Martha Engine Online'));

app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA CALLBACK: Status received.`, 'success');
    addSystemLog(`DATA: ${JSON.stringify(req.body).substring(0, 200)}`, 'info');
    res.status(200).send('OK');
});

// --- Endpoints for Dashboard ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Configuration has been synchronized from Dashboard.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Test Pulse" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const result = await sendWhatsApp(req.body.phoneNumber, "Martha AI Agent: Connectivity test successful. Engine is online.");
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, 1);
    res.json(result);
});

// --- Static Serving ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`ENGINE: Operational on port ${PORT}`, 'success'));
