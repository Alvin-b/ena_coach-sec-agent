
/**
 * Ena Coach AI Agent - Master Unified Server
 * Optimized for Evolution API Webhooks & Robust Stream Handling
 */

import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// --- 1. PERSISTENT DATA STORE ---
const DATA_STORE = {
    routes: [
        { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', availableSeats: 40, capacity: 45 },
        { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', availableSeats: 42, capacity: 45 },
        { id: 'R003', origin: 'Nairobi', destination: 'Mombasa', departureTime: '09:00 PM', price: 1600, busType: 'Standard', availableSeats: 30, capacity: 45 },
        { id: 'R004', origin: 'Mombasa', destination: 'Nairobi', departureTime: '09:00 PM', price: 1600, busType: 'Standard', availableSeats: 35, capacity: 45 },
    ],
    tickets: [],
    logs: [],
    raw: [] 
};

const runtimeConfig = {
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
};

function addSystemLog(msg, type = 'info', meta = null) {
    if (msg.includes('/api/debug')) return; 
    const log = { msg, type, timestamp: new Date().toISOString() };
    DATA_STORE.logs.unshift(log);
    
    if (meta) {
        DATA_STORE.raw.unshift({ 
            timestamp: log.timestamp, 
            headers: meta.headers || {}, 
            body: meta.body || 'No Body detected'
        });
        if (DATA_STORE.raw.length > 50) DATA_STORE.raw.pop();
    }
    
    if (DATA_STORE.logs.length > 100) DATA_STORE.logs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

/**
 * 2. GREEDY WEBHOOK CAPTURE (Must be FIRST)
 * This handles /webhook regardless of Content-Type or standard middleware.
 */
app.post(['/webhook', '/webhook/'], (req, res, next) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
        req.rawBody = data;
        let parsed = null;
        try {
            parsed = JSON.parse(data);
        } catch (e) {
            // Not JSON, but we still want to log it
        }
        
        // Log the arrival to internal dashboard
        addSystemLog(`WEBHOOK RECEIVED: ${req.method} ${req.url}`, 'success', {
            headers: req.headers,
            body: parsed || data
        });

        // Pass to the logic handler
        handleWebhookLogic(parsed, req, res);
    });
});

// Standard parsers for all other routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 3. AI AGENT TOOLS ---
const aiTools = [
    {
        name: 'searchRoutes',
        description: 'Find bus routes between two cities.',
        parameters: {
            type: Type.OBJECT,
            properties: { origin: { type: Type.STRING }, destination: { type: Type.STRING } },
            required: ['origin', 'destination']
        }
    },
    {
        name: 'bookTicket',
        description: 'Finalize a booking and generate a ticket ID.',
        parameters: {
            type: Type.OBJECT,
            properties: { 
                passengerName: { type: Type.STRING }, 
                routeId: { type: Type.STRING },
                phoneNumber: { type: Type.STRING }
            },
            required: ['passengerName', 'routeId', 'phoneNumber']
        }
    }
];

// --- 4. EVOLUTION API SENDER ---
async function sendWhatsApp(jid, text, instance) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const url = `${runtimeConfig.evolutionUrl.replace(/\/$/, '')}/message/sendText/${instance || runtimeConfig.instanceName}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: jid.split('@')[0], text })
        });
    } catch (e) { console.error("Send Error", e); }
}

// --- 5. WEBHOOK LOGIC HANDLER ---
async function handleWebhookLogic(payload, req, res) {
    // Reply 200 immediately to the source
    res.status(200).send("OK");

    if (!payload) return;

    const eventType = payload.event || payload.type;
    const instance = payload.instance || runtimeConfig.instanceName;

    if (eventType === 'messages.upsert') {
        const jid = payload.data?.key?.remoteJid;
        const fromMe = payload.data?.key?.fromMe;
        const text = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;

        if (jid && text && !fromMe) {
            handleAIProcess(jid, text, instance);
        }
    }
}

// --- 6. AI ENGINE ---
async function handleAIProcess(jid, msg, instance) {
    if (!runtimeConfig.apiKey) return;
    const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `User: "${msg}"`,
            config: {
                systemInstruction: "You are Martha, Ena Coach Assistant. Help book tickets.",
                tools: [{ functionDeclarations: aiTools }]
            }
        });

        if (result.functionCalls) {
            // Tool execution logic...
        } else if (result.text) {
            await sendWhatsApp(jid, result.text, instance);
        }
    } catch (e) { addSystemLog(`AI ERROR: ${e.message}`, 'error'); }
}

// --- 7. ADMIN SYNC API ---
app.get('/api/routes', (req, res) => res.json(DATA_STORE.routes));
app.get('/api/tickets', (req, res) => res.json(DATA_STORE.tickets));
app.get('/api/debug/system-logs', (req, res) => res.json(DATA_STORE.logs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(DATA_STORE.raw));
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("CONFIG: Updated via Admin", "success");
    res.json({ success: true });
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`ENA COACH ENGINE ONLINE | PORT: ${PORT}`);
});
