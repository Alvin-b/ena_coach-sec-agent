
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
 * This middleware logs EVERY request hitting the server.
 * Use this to verify if Evolution API is even reaching us.
 */
app.use((req, res, next) => {
    const isApiRequest = req.url.startsWith('/api') || req.url === '/webhook';
    if (isApiRequest) {
        addSystemLog(`Incoming Request: ${req.method} ${req.url}`, 'info');
    }
    next();
});

// Robust Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' })); // Fallback for weird Content-Types

// --- WhatsApp Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        return { success: false, message: "Missing Evolution Config." };
    }
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    let cleanJid = jid.replace(/[^0-9]/g, '');
    if (cleanJid.startsWith('0')) cleanJid = '254' + cleanJid.substring(1);
    else if (cleanJid.startsWith('7')) cleanJid = '254' + cleanJid;
    
    const instance = encodeURIComponent(runtimeConfig.instanceName.trim());
    const targetUrl = `${cleanUrl}/message/sendText/${instance}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': runtimeConfig.evolutionToken.trim()
            },
            body: JSON.stringify({ number: cleanJid, text: text })
        });
        return { success: response.ok };
    } catch(e) { return { success: false, message: e.message }; }
}

async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) return;
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha from Ena Coach.`,
            config: { systemInstruction: "You are Martha, the Ena Coach AI. Be helpful and concise." }
        });
        if (response.text) await sendWhatsApp(phoneNumber, response.text);
    } catch (e) { addSystemLog(`AI Error: ${e.message}`, 'error'); }
}

// --- High-Resilience Webhook ---
app.post('/webhook', async (req, res) => {
    // If express.json() failed, req.body might be a string from express.text()
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {}
    }

    const eventType = payload.event || payload.type;
    const data = payload.data;
    
    if (eventType) {
        addSystemLog(`Webhook Validated: ${eventType}`, 'success');
    } else {
        // Log the raw payload for inspection if structure is unknown
        const snippet = typeof payload === 'string' ? payload.substring(0, 100) : JSON.stringify(payload).substring(0, 100);
        addSystemLog(`Unknown Webhook Format Received: ${snippet}...`, 'error');
    }

    if ((eventType === 'messages.upsert' || eventType === 'MESSAGES_UPSERT') && data) {
        const messageObj = Array.isArray(data) ? data[0] : data;
        if (messageObj?.key) {
            const remoteJid = messageObj.key.remoteJid;
            const fromMe = messageObj.key.fromMe;
            const text = messageObj.message?.conversation || 
                         messageObj.message?.extendedTextMessage?.text;

            if (text && !fromMe) {
                addSystemLog(`WhatsApp Message Captured: "${text}"`, 'success');
                handleAIProcess(remoteJid, text);
            }
        }
    }
    res.status(200).send('OK');
});

// Health check for Render/Uptime monitoring
app.get('/health', (req, res) => res.send('Martha Engine Online'));

// --- Endpoints for Dashboard ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("Engine settings updated.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Ping" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    const result = await sendWhatsApp(req.body.phoneNumber, "Martha Connection Test: Online.");
    addSystemLog(`WhatsApp Test: ${result.success ? 'PASSED' : 'FAILED'}`, result.success ? 'success' : 'error');
    res.json(result);
});

// --- Static Serving ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`Martha Engine Operational on port ${PORT}`, 'info'));
