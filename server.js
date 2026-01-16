
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

/**
 * Silent Logger: Filters out noisy polling traffic.
 */
function addSystemLog(msg, type = 'info', raw = null) {
    const log = { msg, type, timestamp: new Date().toISOString() };
    
    // Internal dashboard noise reduction: don't push these to the log array
    if (msg.includes('[INBOUND]')) return; 

    systemLogs.unshift(log);
    if (raw) {
        rawPayloads.unshift({ timestamp: log.timestamp, data: raw });
        if (rawPayloads.length > 50) rawPayloads.pop();
    }
    if (systemLogs.length > 100) systemLogs.pop();
    
    // Only console.log meaningful events to keep Fly/Render logs clean
    if (type !== 'info' || msg.includes('SIGNAL') || msg.includes('SERVER')) {
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }
}

const app = express();

// --- 1. QUIET BODY PARSING ---
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ type: 'text/*' }));

// --- 2. DIAGNOSTIC ROUTES ---
app.get('/health', (req, res) => res.json({ status: 'UP' }));

app.get('/webhook', (req, res) => {
    res.send(`<div style="font-family:sans-serif;text-align:center;padding:50px;"><h1>Webhook Endpoint Active</h1><p>Send POST requests to this URL.</p></div>`);
});

// --- 3. THE WEBHOOK HANDLER ---
app.post('/webhook', (req, res) => {
    // Acknowledge immediately
    res.status(200).send('OK');

    let payload = req.body;
    if (typeof payload === 'string' && payload.startsWith('{')) {
        try { payload = JSON.parse(payload); } catch (e) {}
    }

    if (!payload || Object.keys(payload).length === 0) {
        // Only log if there's actually a problem
        if (req.rawBody) addSystemLog("WEBHOOK ALERT: Hit received but JSON parsing failed.", "warning", { raw: req.rawBody });
        return;
    }

    const eventType = payload.event || payload.type || "unknown_event";
    
    // Log meaningful webhook hits
    addSystemLog(`WEBHOOK SIGNAL: ${eventType}`, 'success', payload);

    // Extraction Logic
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
        jid = payload.sender || payload.remoteJid || payload.from;
        text = payload.text || payload.body || payload.message?.conversation;
        fromMe = payload.fromMe || false;
    }

    if (jid && text && !fromMe) {
        addSystemLog(`PROCESSING MSG: "${text}" from ${jid}`, 'info');
        handleAIProcess(jid, text);
    }
});

// --- 4. AI ENGINE ---
async function handleAIProcess(jid, msg) {
    if (!runtimeConfig.apiKey) return addSystemLog("AI HALT: No Gemini API Key", "error");

    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `User: "${msg}". You are Martha from Ena Coach. Reply concisely.`,
        });

        if (result.text) {
            addSystemLog(`AI REPLY: ${result.text.substring(0, 40)}...`, 'success');
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
        if (res.ok) addSystemLog(`WA SENT: ${cleanJid}`, 'success');
    } catch(e) { addSystemLog(`WA NETWORK ERROR: ${e.message}`, 'error'); }
}

// --- 5. SYSTEM ADMIN API ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Config updated manually via dashboard", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

// Static Files
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// --- 6. START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`MARTHA ENGINE ONLINE | PORT: ${PORT}`);
    console.log(`WEBHOOK: /webhook (Binding: 0.0.0.0)`);
    console.log(`==================================================\n`);
    addSystemLog(`SERVER ONLINE: Initialized on Port ${PORT}`, 'success');
});
