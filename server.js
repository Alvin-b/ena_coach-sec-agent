
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

// --- Runtime Configuration ---
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
const rawPayloads = []; // Store last 10 raw bodies for UI inspection

function addSystemLog(msg, type = 'info', raw = null) {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (raw) {
        rawPayloads.unshift({ timestamp: log.timestamp, data: raw });
        if (rawPayloads.length > 10) rawPayloads.pop();
    }
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

// --- Middleware Order Fix ---
// Order matters: JSON first, then urlencoded, then raw/text as a fallback.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Traffic Logger
app.use((req, res, next) => {
    const isAsset = req.url.match(/\.(js|css|png|jpg|svg|ico|map)$/) || req.url.startsWith('/@');
    if (!isAsset && !req.url.startsWith('/api/debug')) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        addSystemLog(`TRAFFIC: ${req.method} ${req.url} | Content-Type: ${req.headers['content-type']}`, 'info');
    }
    next();
});

// --- WhatsApp Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        addSystemLog("CONFIG ERROR: Evolution API configuration incomplete.", "error");
        return { success: false, message: "Missing Evolution Config." };
    }
    
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    let cleanNumber = jid.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = '254' + cleanNumber.substring(1);
    else if (cleanNumber.startsWith('7')) cleanNumber = '254' + cleanNumber;
    
    const instance = encodeURIComponent(runtimeConfig.instanceName.trim());
    const targetUrl = `${cleanUrl}/message/sendText/${instance}`;

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
            addSystemLog(`EVOLUTION REJECTED: ${response.status} - ${errBody.substring(0, 50)}`, 'error');
            return { success: false, message: `Status ${response.status}` };
        }
    } catch(e) { 
        addSystemLog(`EVOLUTION NETWORK ERROR: ${e.message}`, 'error');
        return { success: false, message: e.message }; 
    }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) {
            addSystemLog("AI HALTED: Missing Gemini API Key.", "error");
            return;
        }
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha from Ena Coach.`,
            config: { 
                systemInstruction: "You are Martha, the Ena Coach AI. Keep replies short and helpful." 
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
        }
    } catch (e) { 
        addSystemLog(`AI ENGINE ERROR: ${e.message}`, 'error'); 
    }
}

// --- High-Resilience Webhook Handler ---
const webhookHandler = async (req, res) => {
    if (req.method === 'GET') {
        addSystemLog("WEBHOOK PROBE: GET /webhook (Verification pulse detected).", "success");
        return res.status(200).send('Martha Webhook Active');
    }

    addSystemLog(`WEBHOOK PULSE: Incoming POST body check...`, 'info');
    
    let payload = req.body;
    
    // Fallback: If payload is empty but there's a raw body, try to parse it
    if (!payload || Object.keys(payload).length === 0) {
        addSystemLog("WEBHOOK WARNING: Empty req.body. Checking for raw buffer...", "error");
        // This usually happens if the content-type header is wrong
    }

    // Diagnostic logging of the keys received
    const bodyKeys = Object.keys(payload || {});
    addSystemLog(`WEBHOOK DATA: Received keys: [${bodyKeys.join(', ')}]`, 'info', payload);

    const eventType = payload.event || payload.type;
    const data = payload.data || payload; // Fallback to root if 'data' is missing (Evolution v1 vs v2)
    
    if (eventType) {
        addSystemLog(`EVENT DETECTED: ${eventType}`, 'success');
    }

    // Try to extract message even if eventType is missing (Robustness)
    const messageObj = Array.isArray(data) ? data[0] : (data.messages ? data.messages[0] : data);
    
    if (messageObj && (messageObj.key || messageObj.from)) {
        const remoteJid = messageObj.key?.remoteJid || messageObj.from;
        const fromMe = messageObj.key?.fromMe || messageObj.fromMe || false;
        
        // Support multiple text locations
        const text = messageObj.message?.conversation || 
                     messageObj.message?.extendedTextMessage?.text ||
                     messageObj.message?.imageMessage?.caption ||
                     messageObj.text ||
                     (typeof messageObj === 'string' ? messageObj : null);

        if (text && !fromMe && remoteJid) {
            addSystemLog(`MESSAGE PROCESSED: [${remoteJid}] "${text}"`, 'success');
            handleAIProcess(remoteJid, text);
            return res.status(200).send('OK');
        }
    }

    // If we reached here, we didn't find a valid message structure
    addSystemLog("WEBHOOK SKIPPED: Payload did not contain a valid user message structure.", "error");
    res.status(200).send('OK'); // Still return 200 to prevent Evolution from retrying
};

app.all('/webhook', webhookHandler);

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
        addSystemLog("DARAJA ERROR: Missing Key or Secret in Integration tab.", "error");
        return null;
    }

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    addSystemLog(`DARAJA: Fetching OAuth token from ${getDarajaBaseUrl()}...`, 'info');
    
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        const data = await response.json();
        if (data.access_token) {
            addSystemLog("DARAJA: OAuth token successfully retrieved.", "success");
            return data.access_token;
        }
        addSystemLog(`DARAJA AUTH FAILED: ${data.errorMessage || JSON.stringify(data)}`, "error");
        return null;
    } catch (error) { 
        addSystemLog(`DARAJA NETWORK ERROR: ${error.message}`, 'error');
        return null; 
    }
}

async function triggerSTKPush(phoneNumber, amount) {
    addSystemLog(`DARAJA: Preparing STK Push for ${phoneNumber} (KES ${amount})...`, 'info');
    
    const token = await getDarajaToken();
    if (!token) return { success: false, message: "Safaricom Authentication Failed. Check credentials." };
    
    const timestamp = getDarajaTimestamp();
    const shortcode = runtimeConfig.darajaShortcode.trim();
    const passkey = runtimeConfig.darajaPasskey.trim();
    
    if (!shortcode || !passkey) {
        addSystemLog("DARAJA ERROR: Shortcode or Passkey missing.", "error");
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
        addSystemLog("DARAJA: Sending STK Push request to Safaricom...", "info");
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
            addSystemLog(`DARAJA SUCCESS: STK Push triggered. RequestID: ${data.CheckoutRequestID}`, 'success');
            return { success: true, checkoutRequestId: data.CheckoutRequestID };
        }
        addSystemLog(`DARAJA REJECTED: ${data.ResponseDescription}`, 'error');
        return { success: false, message: data.ResponseDescription || "Gateway Rejected" };
    } catch (e) {
        addSystemLog(`DARAJA API ERROR: ${e.message}`, 'error');
        return { success: false, message: "Safaricom API is unreachable." };
    }
}

// Routes
app.get('/health', (req, res) => res.send('Martha Engine Online and Listening.'));

app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA CALLBACK: Signal received from Safaricom.`, 'success', req.body);
    res.status(200).send('OK');
});

app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Configuration updated via Integration tab.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Test Pulse" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const result = await sendWhatsApp(req.body.phoneNumber, "Martha Connectivity Test: OK. Your server is reachable.");
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, 1);
    res.json(result);
});

app.post('/api/test/trigger-webhook', async (req, res) => {
    const { phoneNumber, text } = req.body;
    addSystemLog(`SIMULATION: Running manual webhook trigger...`, 'info');
    req.body = {
        event: "messages.upsert",
        data: [{
            key: { remoteJid: `${phoneNumber}@s.whatsapp.net`, fromMe: false },
            message: { conversation: text }
        }]
    };
    return webhookHandler(req, res);
});

// Static
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`ENGINE LIVE: Listening on port ${PORT}`, 'success'));
