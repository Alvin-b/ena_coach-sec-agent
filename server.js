
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

function addSystemLog(msg, type = 'info') {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

/** 
 * DEEP PACKET SNIFFER (Aggressive)
 * Logs details about EVERY POST request to help find lost webhooks.
 */
app.use((req, res, next) => {
    const isWebhookRelated = req.url.includes('webhook') || req.url.includes('callback') || req.method === 'POST';
    const isAsset = req.url.match(/\.(js|css|png|jpg|svg|ico|map)$/) || req.url.startsWith('/@');
    
    if (isWebhookRelated && !isAsset && !req.url.startsWith('/api')) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        addSystemLog(`TRAFFIC: ${req.method} ${req.url} | Content-Type: ${req.headers['content-type']} | IP: ${ip}`, 'info');
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
            addSystemLog(`GATEWAY ERROR: Evolution API returned ${response.status}`, 'error');
            return { success: false, message: `Status ${response.status}` };
        }
    } catch(e) { 
        addSystemLog(`NETWORK ERROR: Evolution API unreachable: ${e.message}`, 'error');
        return { success: false, message: e.message }; 
    }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) {
            addSystemLog("AI HALTED: Missing API Key.", "error");
            return;
        }
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". You are Martha, the Ena Coach AI agent.`,
            config: { 
                systemInstruction: "You are Martha, the Ena Coach AI. You help users book buses. Be concise." 
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
        }
    } catch (e) { 
        addSystemLog(`AI ERROR: ${e.message}`, 'error'); 
    }
}

// --- Multi-Method Webhook Handler ---
const webhookHandler = async (req, res) => {
    if (req.method === 'GET') {
        addSystemLog("WEBHOOK PROBE: GET /webhook (Ping successful).", "success");
        return res.status(200).json({ status: "online", service: "martha-ai" });
    }

    addSystemLog(`WEBHOOK PULSE: Incoming ${req.method} payload.`, 'info');
    
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {
            addSystemLog("WEBHOOK WARNING: Payload is not JSON. Use Evolution v2 settings.", "error");
        }
    }

    const eventType = payload.event || payload.type;
    const data = payload.data;
    
    if (eventType) {
        addSystemLog(`EVENT DETECTED: ${eventType}`, 'success');
    } else {
        addSystemLog(`UNKNOWN FORMAT: Keys found: [${Object.keys(payload || {}).join(', ')}]`, 'error');
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
                addSystemLog(`MESSAGE: [${remoteJid}] "${text}"`, 'success');
                handleAIProcess(remoteJid, text);
            }
        }
    }
    res.status(200).send('OK');
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
        addSystemLog("M-PESA ERROR: Key or Secret is missing.", "error");
        return null;
    }

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        const data = await response.json();
        if (data.access_token) return data.access_token;
        addSystemLog(`M-PESA AUTH REJECTED: ${data.errorMessage || 'Invalid Credentials'}`, 'error');
        return null;
    } catch (error) { 
        addSystemLog(`M-PESA NETWORK: Safaricom unreachable`, 'error');
        return null; 
    }
}

async function triggerSTKPush(phoneNumber, amount) {
    addSystemLog(`M-PESA: Starting STK push for ${phoneNumber}`, 'info');
    
    const token = await getDarajaToken();
    if (!token) return { success: false, message: "Auth failed. Check Consumer Key/Secret." };
    
    const timestamp = getDarajaTimestamp();
    const shortcode = runtimeConfig.darajaShortcode.trim();
    const passkey = runtimeConfig.darajaPasskey.trim();
    
    if (!shortcode || !passkey) {
        addSystemLog("M-PESA ERROR: Shortcode or Passkey missing.", "error");
        return { success: false, message: "Check Shortcode/Passkey." };
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
        "TransactionDesc": "Bus Ticket"
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
            addSystemLog(`M-PESA: STK triggered successfully.`, 'success');
            return { success: true, checkoutRequestId: data.CheckoutRequestID };
        }
        addSystemLog(`M-PESA REJECTED: ${data.ResponseDescription}`, 'error');
        return { success: false, message: data.ResponseDescription || "Rejected by Gateway" };
    } catch (e) {
        addSystemLog(`M-PESA ERROR: API failed to respond.`, 'error');
        return { success: false, message: "Gateway Offline" };
    }
}

// Health check and root route
app.get('/health', (req, res) => res.send('Martha Engine Online'));

app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA CALLBACK RECEIVED.`, 'success');
    res.status(200).send('OK');
});

// --- Endpoints for Dashboard ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Configuration updated via Dashboard.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Hello" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const result = await sendWhatsApp(req.body.phoneNumber, "Martha Connectivity Test: OK.");
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, 1);
    res.json(result);
});

/**
 * WEBHOOK SIMULATOR
 * Use this to trigger the AI logic manually from the dashboard.
 */
app.post('/api/test/trigger-webhook', async (req, res) => {
    const { phoneNumber, text } = req.body;
    addSystemLog(`SIMULATION: Manual trigger for ${phoneNumber}`, 'info');
    
    const mockPayload = {
        event: "messages.upsert",
        data: [{
            key: { remoteJid: `${phoneNumber}@s.whatsapp.net`, fromMe: false },
            message: { conversation: text }
        }]
    };
    
    // Pass it to the actual handler
    req.body = mockPayload;
    return webhookHandler(req, res);
});

// --- Static Serving ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`ENGINE LIVE: Port ${PORT}`, 'success'));
