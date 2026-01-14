
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
 * DEEP TRAFFIC SNIFFER 
 * Logs details about EVERY request to help diagnose delivery failures.
 */
app.use((req, res, next) => {
    const isApiRequest = req.url.startsWith('/api') || req.url === '/webhook' || req.url.includes('callback');
    if (isApiRequest) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        addSystemLog(`Traffic Detected: ${req.method} ${req.url} from IP: ${ip}`, 'info');
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
        addSystemLog("WhatsApp Error: Missing Evolution URL or Token.", "error");
        return { success: false, message: "Missing Evolution Config." };
    }
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    
    // Format JID correctly: 254... or 254...
    let cleanNumber = jid.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = '254' + cleanNumber.substring(1);
    else if (cleanNumber.startsWith('7')) cleanNumber = '254' + cleanNumber;
    
    // If it's not a full JID, make it one
    const targetJid = jid.includes('@') ? jid : `${cleanNumber}@s.whatsapp.net`;
    const targetNumber = cleanNumber;

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
                number: targetNumber, 
                text: text,
                options: { delay: 1000, presence: "composing" }
            })
        });
        
        if (response.ok) {
            addSystemLog(`WhatsApp Sent to ${targetNumber}`, 'success');
            return { success: true };
        } else {
            const errBody = await response.text();
            addSystemLog(`Evolution API Rejected: ${response.status} - ${errBody}`, 'error');
            return { success: false, message: `Evolution Error: ${response.status}` };
        }
    } catch(e) { 
        addSystemLog(`WhatsApp Network Error: ${e.message}`, 'error');
        return { success: false, message: e.message }; 
    }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) {
            addSystemLog("AI Agent Halted: Missing Gemini API Key.", "error");
            return;
        }
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha from Ena Coach.`,
            config: { 
                systemInstruction: "You are Martha, the Ena Coach AI. You help users book buses in Kenya. Be professional, concise, and helpful." 
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
        }
    } catch (e) { 
        addSystemLog(`AI Processing Error: ${e.message}`, 'error'); 
    }
}

// --- High-Resilience Webhook ---
app.post('/webhook', async (req, res) => {
    addSystemLog(`Webhook Pulse: Processing Body...`, 'info');
    
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {
            addSystemLog("Webhook Error: Could not parse body as JSON.", "error");
        }
    }

    const eventType = payload.event || payload.type;
    const data = payload.data;
    
    if (eventType) {
        addSystemLog(`Webhook Event Captured: ${eventType}`, 'success');
    } else {
        addSystemLog(`Webhook Alert: Invalid Payload Structure. Body keys: ${Object.keys(payload).join(', ')}`, 'error');
    }

    // Capture standard message upsert
    if ((eventType === 'messages.upsert' || eventType === 'MESSAGES_UPSERT') && data) {
        const messageObj = Array.isArray(data) ? data[0] : data;
        if (messageObj?.key) {
            const remoteJid = messageObj.key.remoteJid;
            const fromMe = messageObj.key.fromMe;
            
            // Text can be in conversation, extendedTextMessage, or image captions
            const msgContent = messageObj.message;
            const text = msgContent?.conversation || 
                         msgContent?.extendedTextMessage?.text ||
                         msgContent?.imageMessage?.caption;

            if (text && !fromMe) {
                addSystemLog(`WhatsApp Message: [${remoteJid}] "${text}"`, 'success');
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
    const auth = Buffer.from(`${runtimeConfig.darajaKey.trim()}:${runtimeConfig.darajaSecret.trim()}`).toString('base64');
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        const data = await response.json();
        return data.access_token;
    } catch (error) { 
        addSystemLog(`M-Pesa Token Error: ${error.message}`, 'error');
        return null; 
    }
}

async function triggerSTKPush(phoneNumber, amount) {
    const token = await getDarajaToken();
    if (!token) return { success: false, message: "M-Pesa Auth Failed." };
    
    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${runtimeConfig.darajaShortcode.trim()}${runtimeConfig.darajaPasskey.trim()}${timestamp}`).toString('base64');
    
    let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('7')) formattedPhone = '254' + formattedPhone;

    const payload = {
        "BusinessShortCode": runtimeConfig.darajaShortcode.trim(),
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": runtimeConfig.darajaType === 'Till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone,
        "PartyB": runtimeConfig.darajaType === 'Till' ? runtimeConfig.darajaStoreNumber.trim() : runtimeConfig.darajaShortcode.trim(),
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
            addSystemLog(`STK Push Sent to ${formattedPhone}`, 'success');
            return { success: true, checkoutRequestId: data.CheckoutRequestID };
        }
        addSystemLog(`STK Push Failed: ${data.CustomerMessage || data.ResponseDescription}`, 'error');
        return { success: false, message: data.CustomerMessage || data.ResponseDescription || "Gateway Rejected" };
    } catch (e) {
        addSystemLog(`M-Pesa API Network Error: ${e.message}`, 'error');
        return { success: false, message: "Network Error" };
    }
}

// Health check for Render/Uptime monitoring
app.get('/health', (req, res) => res.send('Martha Engine Online and Ready'));

// M-Pesa Callback (For logging only in this setup)
app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-Pesa Callback Received: ${JSON.stringify(req.body).substring(0, 100)}...`, 'info');
    res.status(200).send('OK');
});

// --- Endpoints for Dashboard ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("System Configuration Updated.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Test System" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const result = await sendWhatsApp(req.body.phoneNumber, "Martha AI Agent: Connectivity Test Successful.");
    res.json(result);
});

app.post('/api/test/mpesa', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, 1);
    res.json(result);
});

// --- Static Serving ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`Martha Engine Live on port ${PORT}`, 'info'));
