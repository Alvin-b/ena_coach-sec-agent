
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
// Logs EVERY request to ANY path to verify connectivity.
app.use((req, res, next) => {
    const logMsg = `HIT: ${req.method} ${req.url} from ${req.ip || req.headers['x-forwarded-for']}`;
    addSystemLog(logMsg, 'info');
    next();
});

// Use a custom raw body parser to capture signals even if headers are missing
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 2. HEALTH & DIAGNOSTIC ROUTES ---
app.get('/health', (req, res) => res.status(200).send("OK - Server is healthy and listening on 0.0.0.0"));

// Enable GET testing for /webhook
app.get('/webhook', (req, res) => {
    addSystemLog("GET /webhook: Health check successful", "success");
    res.send(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center; background: #f4f4f4; height: 100vh;">
            <h1 style="color: #d32f2f;">Ena Coach Webhook is ONLINE</h1>
            <p>Your server is listening on <b>0.0.0.0:${PORT}</b></p>
            <p>Ready to receive POST signals from Evolution API.</p>
            <hr style="max-width: 400px; margin: 20px auto; border: 1px solid #ddd;">
            <p style="font-size: 12px; color: #888;">Render Discovery URL: ${req.headers.host}</p>
        </div>
    `);
});

// --- 3. THE WEBHOOK HANDLER ---
app.post('/webhook', (req, res) => {
    // Respond 200 immediately to prevent Evolution API from retrying/timing out
    res.status(200).send('OK');

    const payload = req.body;
    
    // If JSON parsing failed but we have a raw body, log it as an error
    if ((!payload || Object.keys(payload).length === 0) && req.rawBody) {
        addSystemLog("WEBHOOK: Received data but JSON parsing failed", "error", { raw: req.rawBody });
        return;
    }

    if (!payload || Object.keys(payload).length === 0) {
        addSystemLog("WEBHOOK: Received empty body", "warning");
        return;
    }

    const eventName = payload.event || payload.type || "unknown_event";
    addSystemLog(`SIGNAL ARRIVED: ${eventName}`, 'info', payload);

    // Extraction logic
    let jid = null;
    let text = null;
    let fromMe = false;

    // Check Evolution API Structure
    if (payload.event === 'messages.upsert' && payload.data) {
        jid = payload.data.key?.remoteJid;
        fromMe = payload.data.key?.fromMe || false;
        text = payload.data.message?.conversation || 
               payload.data.message?.extendedTextMessage?.text || 
               payload.data.message?.imageMessage?.caption;
    } else {
        // Broad Fallback
        jid = payload.sender || payload.remoteJid || payload.from;
        text = payload.text || payload.body || payload.message?.conversation || payload.data?.message?.conversation;
        fromMe = payload.fromMe || payload.data?.key?.fromMe || false;
    }

    if (jid && text && !fromMe) {
        addSystemLog(`PROCESSING MSG: "${text}" from ${jid}`, 'success');
        handleAIProcess(jid, text);
    } else if (fromMe) {
        addSystemLog(`IGNORED: Signal from bot itself`, 'info');
    } else {
        addSystemLog(`IGNORED: Missing JID or Text in structure`, 'warning');
    }
});

// --- 4. AI & M-PESA LOGIC ---
async function handleAIProcess(phoneNumber, incomingText) {
    if (!runtimeConfig.apiKey) {
        addSystemLog("AI ERROR: Gemini API Key is missing", "error");
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha, the Ena Coach assistant.`,
            config: { systemInstruction: "You are Martha, Ena Coach assistant. Keep it concise. If payment is needed, mention M-Pesa." }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
            if (response.text.toLowerCase().includes('m-pesa')) {
                addSystemLog(`TRIGGERING STK PUSH for ${phoneNumber}`, 'info');
                // triggerSTKPush logic integration
            }
        }
    } catch (e) {
        addSystemLog(`AI ERROR: ${e.message}`, 'error');
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
        if (res.ok) addSystemLog(`REPLY SENT: ${cleanJid}`, 'success');
        else addSystemLog(`WA FAILED: ${res.status}`, 'error');
    } catch(e) { addSystemLog(`WA ERROR: ${e.message}`, 'error'); }
}

// --- 5. ADMIN & SYSTEM ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Configuration updated", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// --- 6. START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`MARTHA AI ENGINE: ONLINE & BOUND TO 0.0.0.0`);
    console.log(`PORT: ${PORT}`);
    console.log(`WEBHOOK PATH: /webhook`);
    console.log(`==================================================\n`);
    addSystemLog(`SERVER ONLINE: Listening on 0.0.0.0:${PORT}`, 'success');
});
