
/**
 * Ena Coach AI Agent - Master Unified Server
 * Environment-Aware Binding for Fly.io & Render
 */

import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FLY.IO vs RENDER PORT LOGIC
// Fly usually expects 3000. Render usually expects 10000.
// We detect FLY_APP_NAME (set by Fly) to force 3000 if there's any doubt.
const PORT = process.env.FLY_APP_NAME ? 3000 : (process.env.PORT || 3000);

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
app.use((req, res, next) => {
    // This logs every single incoming hit. If you see this in the dashboard, the server is "alive" to the world.
    const logMsg = `[INBOUND] ${req.method} ${req.url} (Host: ${req.headers.host})`;
    addSystemLog(logMsg, 'info');
    next();
});

// Robust JSON parsing with raw body capture for debugging
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 2. DIAGNOSTIC ROUTES ---
app.get('/health', (req, res) => res.json({ status: 'UP', port: PORT, host: req.headers.host }));

// GET /webhook (For manual browser checks)
app.get('/webhook', (req, res) => {
    addSystemLog("WEBHOOK: Browser ping (GET) detected", "success");
    res.send(`<h1>Webhook Active</h1><p>Listening for Evolution API on Port ${PORT}</p>`);
});

// --- 3. THE WEBHOOK HANDLER ---
app.post('/webhook', (req, res) => {
    // Acknowledge immediately
    res.status(200).send('OK');

    const payload = req.body;
    
    // Log exactly what arrived
    const eventType = payload.event || payload.type || "unknown";
    addSystemLog(`WEBHOOK SIGNAL: ${eventType}`, 'info', payload);

    if (!payload || Object.keys(payload).length === 0) {
        addSystemLog("WEBHOOK ERROR: Payload is empty. Check Evolution API body headers.", "error");
        return;
    }

    // Extraction for Evolution API v1 and v2
    let jid = null;
    let text = null;
    let fromMe = false;

    if (payload.event === 'messages.upsert' && payload.data) {
        jid = payload.data.key?.remoteJid;
        fromMe = payload.data.key?.fromMe || false;
        text = payload.data.message?.conversation || 
               payload.data.message?.extendedTextMessage?.text;
    } else {
        // Fallback for direct message events
        jid = payload.sender || payload.remoteJid;
        text = payload.text || payload.body || payload.message?.conversation;
        fromMe = payload.fromMe || false;
    }

    if (jid && text && !fromMe) {
        addSystemLog(`VALID MSG: "${text}" from ${jid}`, 'success');
        handleAIProcess(jid, text);
    } else if (fromMe) {
        addSystemLog(`IGNORED: Message is from the bot itself`, 'info');
    } else {
        addSystemLog(`PARSING FAILED: Could not map JID/Text. Check "Show Payload" in dashboard.`, 'warning');
    }
});

// --- 4. AI ENGINE ---
async function handleAIProcess(jid, msg) {
    if (!runtimeConfig.apiKey) return addSystemLog("AI HALT: No Gemini API Key", "error");

    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `User: "${msg}". You are Martha from Ena Coach. Be helpful and short.`,
        });

        if (result.text) {
            addSystemLog(`AI RESPONSE GENERATED for ${jid}`, 'success');
            await sendWhatsApp(jid, result.text);
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
        if (res.ok) addSystemLog(`WA SENT to ${cleanJid}`, 'success');
        else addSystemLog(`WA SEND FAILED: Status ${res.status}`, 'error');
    } catch(e) { addSystemLog(`WA NETWORK ERROR: ${e.message}`, 'error'); }
}

// --- 5. SYSTEM ADMIN API ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Config updated", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

// Static Files
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// --- 6. START SERVER ---
// We bind to 0.0.0.0 specifically to allow external routing
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`MARTHA ENGINE ONLINE | PORT: ${PORT}`);
    console.log(`BINDING: 0.0.0.0 (Global Access)`);
    console.log(`FLY_APP_NAME: ${process.env.FLY_APP_NAME || 'Not Detected'}`);
    console.log(`==================================================\n`);
    addSystemLog(`SERVER BOOTED: Bound to 0.0.0.0:${PORT}`, 'success');
});
