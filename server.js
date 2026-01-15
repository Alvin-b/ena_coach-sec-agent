
/**
 * Ena Coach AI Agent - Master Unified Server
 * Binding: 0.0.0.0 (All Interfaces)
 */

import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// --- Runtime State ---
const runtimeConfig = {
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
    darajaKey: (process.env.DARAJA_KEY || '').trim(),
    darajaSecret: (process.env.DARAJA_SECRET || '').trim(),
    darajaPasskey: (process.env.DARAJA_PASSKEY || '').trim(),
    darajaShortcode: (process.env.DARAJA_SHORTCODE || '5512238').trim(),
    darajaCallbackUrl: 'https://ena-coach-sec-agent.onrender.com/callback/mpesa',
};

const systemLogs = []; 
const rawPayloads = []; 

function addSystemLog(msg, type = 'info', raw = null) {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (raw) {
        rawPayloads.unshift({ timestamp: log.timestamp, data: raw });
        if (rawPayloads.length > 50) rawPayloads.pop();
    }
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

// --- 1. GLOBAL TRAFFIC INTERCEPTOR ---
// This logs EVERY request to ANY path. If Evolution API is hitting / , /messages, or /webhook, we will see it here.
app.use((req, res, next) => {
    const logMsg = `HIT: ${req.method} ${req.url} from ${req.ip || req.headers['x-forwarded-for']}`;
    addSystemLog(logMsg, 'info');
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 2. HEALTH & DIAGNOSTIC ROUTES ---
app.get('/health', (req, res) => res.status(200).send("OK - Server is healthy and listening on 0.0.0.0"));

// Enable GET testing for /webhook
app.get('/webhook', (req, res) => {
    addSystemLog("GET /webhook: Health check from browser", "success");
    res.send("<h1>Webhook Endpoint Active</h1><p>Send a POST request to process data.</p>");
});

// --- 3. THE WEBHOOK HANDLER ---
app.post('/webhook', (req, res) => {
    // Respond 200 immediately to prevent Evolution API from retrying/timing out
    res.status(200).send('OK');

    const payload = req.body;
    if (!payload || Object.keys(payload).length === 0) {
        addSystemLog("WEBHOOK: Received empty body", "warning");
        return;
    }

    // Log the event name
    const eventName = payload.event || "unknown_event";
    addSystemLog(`WEBHOOK EVENT: ${eventName}`, 'info', payload);

    // Extraction logic based on your specific Evolution API payload
    let jid = null;
    let text = null;
    let fromMe = false;

    if (payload.event === 'messages.upsert' && payload.data) {
        jid = payload.data.key?.remoteJid;
        fromMe = payload.data.key?.fromMe || false;
        text = payload.data.message?.conversation || 
               payload.data.message?.extendedTextMessage?.text || 
               payload.data.message?.imageMessage?.caption;
    } else {
        // Fallback for different payload versions
        jid = payload.sender || payload.remoteJid;
        text = payload.text || payload.body || payload.message?.conversation;
        fromMe = payload.fromMe || false;
    }

    if (jid && text && !fromMe) {
        addSystemLog(`VALID MSG: "${text}" from ${jid}`, 'success');
        handleAIProcess(jid, text);
    } else if (fromMe) {
        addSystemLog(`IGNORED: Message sent by the bot itself`, 'info');
    } else {
        addSystemLog(`IGNORED: Could not find JID or Text in payload structure`, 'warning');
    }
});

// --- 4. AI & M-PESA LOGIC ---
async function handleAIProcess(phoneNumber, incomingText) {
    if (!runtimeConfig.apiKey) {
        addSystemLog("AI ERROR: Gemini API Key is missing in settings", "error");
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha, the Ena Coach assistant. Keep it short.`,
            config: { systemInstruction: "You are Martha, Ena Coach assistant. Help with bookings. If payment is needed, mention M-Pesa." }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
            // Trigger payment if needed (dummy logic for test)
            if (response.text.toLowerCase().includes('m-pesa')) {
                addSystemLog(`TRIGGERING PAYMENT PROMPT for ${phoneNumber}`, 'info');
                // triggerSTKPush logic here...
            }
        }
    } catch (e) {
        addSystemLog(`AI ENGINE ERROR: ${e.message}`, 'error');
    }
}

async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    const cleanJid = jid.split('@')[0].replace(/[^0-9]/g, '');
    const url = `${cleanUrl}/message/sendText/${runtimeConfig.instanceName}`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: cleanJid, text: text })
        });
        if (res.ok) addSystemLog(`REPLY SENT to ${cleanJid}`, 'success');
        else addSystemLog(`WA SEND FAILED: Status ${res.status}`, 'error');
    } catch(e) { addSystemLog(`WA NETWORK ERROR: ${e.message}`, 'error'); }
}

// --- 5. ADMIN & SYSTEM ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Config updated", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// --- 6. START SERVER BINDING TO 0.0.0.0 ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`MARTHA AI ENGINE ONLINE`);
    console.log(`LISTENING ON: http://0.0.0.0:${PORT}`);
    console.log(`WEBHOOK URL: /webhook`);
    console.log(`==================================================\n`);
    addSystemLog(`SERVER STARTED: Listening on all interfaces (0.0.0.0:${PORT})`, 'success');
});
