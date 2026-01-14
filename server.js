
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
// Use standard JSON and URLencoded parsing with generous limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Request Sniffer
app.use((req, res, next) => {
    const isAsset = req.url.match(/\.(js|css|png|jpg|svg|ico|map)$/) || req.url.startsWith('/@');
    if (!isAsset && !req.url.startsWith('/api/debug')) {
        addSystemLog(`TRAFFIC: ${req.method} ${req.url}`, 'info');
    }
    next();
});

// --- WhatsApp Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        addSystemLog("OUTBOUND ERROR: Missing Credentials", "error");
        return;
    }
    
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    let cleanNumber = jid.toString().replace(/[^0-9]/g, '');
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
            body: JSON.stringify({ number: cleanNumber, text: text })
        });
        if (response.ok) addSystemLog(`REPLY SENT: To ${cleanNumber}`, 'success');
        else addSystemLog(`REPLY FAILED: Status ${response.status}`, 'error');
    } catch(e) { 
        addSystemLog(`REPLY NETWORK ERROR: ${e.message}`, 'error'); 
    }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) return addSystemLog("AI HALTED: No API Key", "error");
        
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha, the Ena Coach assistant.`,
            config: { 
                systemInstruction: "You are Martha from Ena Coach. Help with bus bookings. Be extremely brief and helpful." 
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
        }
    } catch (e) { 
        addSystemLog(`AI ENGINE ERROR: ${e.message}`, 'error'); 
    }
}

/**
 * RECURSIVE VALUE HARVESTER
 * Crawls any object looking for specific keys and returns the first meaningful string found.
 */
function harvest(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of keys) {
        if (obj[key] && typeof obj[key] === 'string' && obj[key].length > 1) return obj[key];
    }
    for (const key in obj) {
        const found = harvest(obj[key], keys);
        if (found) return found;
    }
    return null;
}

// --- TEST-READY ULTRA WEBHOOK ---
const webhookHandler = async (req, res) => {
    // RULE 1: Respond 200 OK instantly. Never wait for AI.
    res.status(200).send('OK');

    const payload = req.body;
    if (!payload || Object.keys(payload).length === 0) return;

    addSystemLog(`SIGNAL RECEIVED: Keys: [${Object.keys(payload).join(', ')}]`, 'info', payload);

    if (req.method === 'GET') return;

    // RULE 2: Deep Harvest
    // Look for anything that resembles a JID or Number
    const jid = harvest(payload, ['remoteJid', 'from', 'sender', 'number', 'participant', 'jid']);
    
    // Look for anything that resembles a Message Body
    const text = harvest(payload, ['conversation', 'text', 'body', 'content', 'caption', 'message']);

    // Check if message is from the bot itself (to avoid infinite loops)
    const isFromMe = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        if (obj.fromMe === true) return true;
        for (const k in obj) if (isFromMe(obj[k])) return true;
        return false;
    };

    if (jid && text) {
        if (isFromMe(payload)) {
            addSystemLog(`SIGNAL IGNORED: Outbound message detected.`, 'info');
            return;
        }

        addSystemLog(`MESSAGE EXTRACTED: "${text}" from ${jid}`, 'success');
        
        // Background AI processing
        handleAIProcess(jid, text);
    } else {
        addSystemLog("SIGNAL INCOMPLETE: No recognizable JID or Text found in the packet.", "error");
    }
};

app.all('/webhook', webhookHandler);

// --- M-Pesa Callback ---
app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA SIGNAL: Callback reached server.`, 'success', req.body);
    res.status(200).send('OK');
});

// --- Dashboard API ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Config synchronized.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Hi" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    await sendWhatsApp(req.body.phoneNumber, "Martha System Check: Outbound engine is online.");
    res.json({ success: true });
});

app.post('/api/test/trigger-webhook', async (req, res) => {
    const { phoneNumber, text } = req.body;
    req.body = {
        event: "messages.upsert",
        data: { key: { remoteJid: `${phoneNumber}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } }
    };
    return webhookHandler(req, res);
});

// Static Serving
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`MARTHA ENGINE: Operational on port ${PORT}`, 'success'));
