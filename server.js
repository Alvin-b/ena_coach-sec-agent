
/**
 * Ena Coach AI Agent - Master Unified Server
 * Optimized for Evolution API Webhooks, Persistence, and Media
 */

import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.FLY_APP_NAME ? 3000 : (process.env.PORT || 3000);

// --- 1. PERSISTENT DATA STORE (Server-Side Memory) ---
const DATA_STORE = {
    routes: [
        { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', availableSeats: 40, capacity: 45 },
        { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', availableSeats: 42, capacity: 45 },
        { id: 'R003', origin: 'Nairobi', destination: 'Mombasa', departureTime: '09:00 PM', price: 1600, busType: 'Standard', availableSeats: 30, capacity: 45 },
        { id: 'R004', origin: 'Mombasa', destination: 'Nairobi', departureTime: '09:00 PM', price: 1600, busType: 'Standard', availableSeats: 35, capacity: 45 },
    ],
    tickets: [],
    logs: [],
    raw: [] // Buffer for the Raw Signals sniffer
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
            body: meta.body || 'No Body Detected'
        });
        if (DATA_STORE.raw.length > 50) DATA_STORE.raw.pop();
    }
    
    if (DATA_STORE.logs.length > 100) DATA_STORE.logs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

// --- 2. ROBUST BODY PARSING (Captures Raw Data for Sniffer) ---
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString(); // Essential for the Sniffer
    }
}));
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

// --- 4. EVOLUTION API INTEGRATION (Media Support) ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const url = `${runtimeConfig.evolutionUrl.replace(/\/$/, '')}/message/sendText/${runtimeConfig.instanceName}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: jid.split('@')[0], text })
        });
        addSystemLog(`WA MESSAGE SENT: ${jid}`, 'success');
    } catch (e) { addSystemLog(`WA ERROR: ${e.message}`, 'error'); }
}

async function sendWhatsAppMedia(jid, caption, mediaUrl) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const url = `${runtimeConfig.evolutionUrl.replace(/\/$/, '')}/message/sendMedia/${runtimeConfig.instanceName}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({
                number: jid.split('@')[0],
                media: mediaUrl,
                mediatype: "image",
                caption: caption
            })
        });
        if (res.ok) addSystemLog(`QR TICKET SENT: ${jid}`, 'success');
    } catch (e) { addSystemLog(`MEDIA ERROR: ${e.message}`, 'error'); }
}

// --- 5. AI LOGIC ---
async function handleAIProcess(jid, msg) {
    if (!runtimeConfig.apiKey) return;
    
    const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `User: "${msg}"`,
            config: {
                systemInstruction: "You are Martha from Ena Coach. Help users book tickets. When finalized, use bookTicket tool. Keep WhatsApp replies short.",
                tools: [{ functionDeclarations: aiTools }]
            }
        });

        if (result.functionCalls) {
            for (const call of result.functionCalls) {
                if (call.name === 'searchRoutes') {
                    const matches = DATA_STORE.routes.filter(r => 
                        r.origin.toLowerCase().includes(call.args.origin.toLowerCase()) && 
                        r.destination.toLowerCase().includes(call.args.destination.toLowerCase())
                    );
                    const reply = matches.length > 0 
                        ? `Found: ${matches.map(r => `${r.id}: ${r.origin}->${r.destination} @ KES ${r.price}`).join('. ')}`
                        : "No routes found.";
                    await sendWhatsApp(jid, reply);
                }
                if (call.name === 'bookTicket') {
                    const ticketId = `TKT-${Math.floor(Math.random() * 8999) + 1000}`;
                    const route = DATA_STORE.routes.find(r => r.id === call.args.routeId);
                    const newTicket = {
                        id: ticketId,
                        passengerName: call.args.passengerName,
                        routeId: call.args.routeId,
                        phoneNumber: call.args.phoneNumber,
                        bookingTime: new Date().toISOString(),
                        routeDetails: route
                    };
                    DATA_STORE.tickets.unshift(newTicket);
                    
                    await sendWhatsApp(jid, `✅ Confirmed! Ticket ${ticketId} generated for ${call.args.passengerName}. Sending your QR code...`);
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${ticketId}`;
                    await sendWhatsAppMedia(jid, `Your Ena Coach Ticket: ${ticketId}`, qrUrl);
                }
            }
        } else if (result.text) {
            await sendWhatsApp(jid, result.text);
        }
    } catch (e) { addSystemLog(`AI ENGINE ERROR: ${e.message}`, 'error'); }
}

// --- 6. UNIVERSAL WEBHOOK HANDLER ---
app.post('/webhook', (req, res) => {
    // 1. Respond instantly to Evolution API
    res.status(200).send("OK");

    // 2. Greedy Data Collection
    let payload = req.body;
    
    // If express.json() failed to parse due to Content-Type, try manual parse of rawBody
    if ((!payload || Object.keys(payload).length === 0) && req.rawBody) {
        try { payload = JSON.parse(req.rawBody); } catch (e) { /* ignore malformed */ }
    }

    // Log EVERY POST request for debugging
    addSystemLog(`TRAFFIC DETECTED: ${req.method} /webhook`, 'info', { 
        headers: req.headers, 
        body: payload || req.rawBody 
    });

    if (!payload) return;

    // 3. Logic based on Evolution API Payload Structure
    const eventType = payload.event || payload.type || "unknown";
    
    if (eventType === 'messages.upsert') {
        const jid = payload.data?.key?.remoteJid;
        const fromMe = payload.data?.key?.fromMe;
        // Text can be in conversation OR extendedTextMessage
        const text = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;

        if (jid && text && !fromMe) {
            addSystemLog(`AGENT INPUT: ${text.substring(0, 20)}...`, 'success');
            handleAIProcess(jid, text);
        }
    }
});

// --- 7. ADMIN SYNC API ---
app.get('/api/routes', (req, res) => res.json(DATA_STORE.routes));
app.get('/api/tickets', (req, res) => res.json(DATA_STORE.tickets));
app.get('/api/debug/system-logs', (req, res) => res.json(DATA_STORE.logs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(DATA_STORE.raw));
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("ADMIN: Configuration Synced", "success");
    res.json({ success: true });
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`ENA COACH MASTER SERVER | PORT: ${PORT}`);
    console.log(`WEBHOOK URL: https://[YOUR-RENDER-URL]/webhook`);
    console.log(`==========================================\n`);
    addSystemLog(`ENGINE REBOOTED`, 'success');
});
