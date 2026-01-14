
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
const rawPayloads = []; 

function addSystemLog(msg, type = 'info', raw = null) {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (raw) {
        rawPayloads.unshift({ timestamp: log.timestamp, data: raw });
        if (rawPayloads.length > 20) rawPayloads.pop();
    }
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

// --- RESILIENT MIDDLEWARE ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Request Sniffer (Shows precisely what hits the server)
app.use((req, res, next) => {
    const isAsset = req.url.match(/\.(js|css|png|jpg|svg|ico|map)$/) || req.url.startsWith('/@');
    if (!isAsset && !req.url.startsWith('/api/debug')) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        addSystemLog(`INCOMING: ${req.method} ${req.url} | Content-Type: ${req.headers['content-type']}`, 'info');
    }
    next();
});

// --- WhatsApp Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        addSystemLog("ERROR: Evolution API URL/Token missing.", "error");
        return;
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
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken.trim() },
            body: JSON.stringify({ number: cleanNumber, text: text })
        });
        if (response.ok) addSystemLog(`OUTBOUND: WhatsApp sent to ${cleanNumber}`, 'success');
        else addSystemLog(`OUTBOUND FAILED: Evolution status ${response.status}`, 'error');
    } catch(e) { addSystemLog(`OUTBOUND NETWORK ERROR: ${e.message}`, 'error'); }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) return addSystemLog("AI STOPPED: No Gemini Key", "error");
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha, the Ena Coach assistant.`,
            config: { systemInstruction: "You are Martha from Ena Coach. Help with bus bookings. Be brief." }
        });
        if (response.text) await sendWhatsApp(phoneNumber, response.text);
    } catch (e) { addSystemLog(`AI ERROR: ${e.message}`, 'error'); }
}

// --- ULTRA-PERMISSIVE WEBHOOK HANDLER ---
const webhookHandler = async (req, res) => {
    // 1. Respond with 200 OK immediately to satisfy gateway timeouts
    res.status(200).send('OK');

    // 2. Log full payload for debugging
    const payload = req.body;
    addSystemLog(`WEBHOOK PULSE: Received payload with keys [${Object.keys(payload || {}).join(', ')}]`, 'info', payload);

    if (req.method === 'GET') return;

    // 3. Deep search for message data (Handles v1, v2, v3, and custom formats)
    const findMessageData = (obj) => {
        let jid = null;
        let text = null;
        let fromMe = false;

        // Recursively look for jid and text
        const traverse = (item) => {
            if (!item || typeof item !== 'object') return;
            
            // Look for JID
            if (item.remoteJid && !jid) jid = item.remoteJid;
            if (item.from && !jid && typeof item.from === 'string' && item.from.includes('@')) jid = item.from;
            
            // Look for fromMe
            if (item.fromMe !== undefined) fromMe = item.fromMe;

            // Look for Text
            if (item.conversation && !text) text = item.conversation;
            if (item.text && !text && typeof item.text === 'string') text = item.text;
            if (item.extendedTextMessage?.text && !text) text = item.extendedTextMessage.text;

            Object.values(item).forEach(v => traverse(v));
        };

        traverse(obj);
        return { jid, text, fromMe };
    };

    const extracted = findMessageData(payload);

    if (extracted.text && extracted.jid && !extracted.fromMe) {
        addSystemLog(`VALID MESSAGE: "${extracted.text}" from ${extracted.jid}`, 'success');
        // Process in background
        handleAIProcess(extracted.jid, extracted.text);
    } else {
        addSystemLog("WEBHOOK IGNORED: No valid user message structure detected.", "error");
    }
};

app.all('/webhook', webhookHandler);

// --- M-Pesa Callback ---
app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA CALLBACK: Hit received.`, 'success', req.body);
    res.status(200).send('OK');
});

// --- API Endpoints ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Configuration updated.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

// Diagnostic Test Endpoints
app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Hi" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    await sendWhatsApp(req.body.phoneNumber, "Martha Connectivity Test: ONLINE.");
    res.json({ success: true });
});

app.post('/api/test/trigger-webhook', async (req, res) => {
    const { phoneNumber, text } = req.body;
    req.body = {
        event: "messages.upsert",
        data: [{ key: { remoteJid: `${phoneNumber}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }]
    };
    return webhookHandler(req, res);
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`ENGINE ONLINE: Port ${PORT}`, 'success'));
