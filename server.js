
/**
 * Ena Coach AI Agent - Master Unified Server
 * Optimized for Evolution API Webhooks & Persistence
 */

import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.FLY_APP_NAME ? 3000 : (process.env.PORT || 3000);

// --- 1. PERSISTENT DATA STORE (In-Memory for Demo, can be linked to DB) ---
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
    if (msg.includes('/api/debug')) return; // Silence polling noise
    
    const log = { msg, type, timestamp: new Date().toISOString() };
    DATA_STORE.logs.unshift(log);
    
    if (meta) {
        DATA_STORE.raw.unshift({ timestamp: log.timestamp, ...meta });
        if (DATA_STORE.raw.length > 50) DATA_STORE.raw.pop();
    }
    
    if (DATA_STORE.logs.length > 100) DATA_STORE.logs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

// --- 2. TRAFFIC SNIFFER MIDDLEWARE ---
app.use((req, res, next) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { 
        req.rawBody = data; 
        if (req.url === '/webhook' && req.method === 'POST') {
            // This ensures we see the traffic even if body-parser fails later
            addSystemLog(`TRAFFIC DETECTED: ${req.method} ${req.url}`, 'info', { 
                headers: req.headers, 
                body: data.substring(0, 500) + (data.length > 500 ? '...' : '') 
            });
        }
    });
    next();
});

app.use(express.json({ limit: '50mb' }));

// --- 3. AI AGENT TOOLS ---
const aiTools = [
    {
        name: 'searchRoutes',
        description: 'Find bus routes between two cities.',
        parameters: {
            type: Type.OBJECT,
            properties: { 
                origin: { type: Type.STRING }, 
                destination: { type: Type.STRING } 
            },
            required: ['origin', 'destination']
        }
    },
    {
        name: 'bookTicket',
        description: 'Finalize a booking. Use this AFTER searching or if user confirms route.',
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

// --- 4. SENDER LOGIC (Evolution API) ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl) return;
    const url = `${runtimeConfig.evolutionUrl.replace(/\/$/, '')}/message/sendText/${runtimeConfig.instanceName}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: jid.split('@')[0], text })
        });
    } catch (e) { addSystemLog(`WA SEND ERROR: ${e.message}`, 'error'); }
}

async function sendWhatsAppMedia(jid, caption, mediaUrl) {
    if (!runtimeConfig.evolutionUrl) return;
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
        if (res.ok) addSystemLog(`QR TICKET DELIVERED to ${jid}`, 'success');
    } catch (e) { addSystemLog(`MEDIA SEND ERROR: ${e.message}`, 'error'); }
}

// --- 5. AI ENGINE ---
async function handleAIProcess(jid, msg) {
    if (!runtimeConfig.apiKey) return addSystemLog("AI HALT: No API Key", "error");
    
    const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `User: "${msg}"`,
            config: {
                systemInstruction: "You are Martha from Ena Coach. Help book tickets. Keep replies short. Use bookTicket tool to finalize.",
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
                        : "No routes found for that search.";
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
                    
                    // Confirmation Flow
                    await sendWhatsApp(jid, `✅ Confirmed! Ticket ${ticketId} generated for ${call.args.passengerName}. Sending your QR ticket now...`);
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${ticketId}`;
                    await sendWhatsAppMedia(jid, `Ena Coach Digital Ticket: ${ticketId}`, qrUrl);
                }
            }
        } else if (result.text) {
            await sendWhatsApp(jid, result.text);
        }
    } catch (e) { addSystemLog(`AI ERROR: ${e.message}`, 'error'); }
}

// --- 6. WEBHOOK ROUTE ---
app.post('/webhook', (req, res) => {
    // 1. FAST RESPONSE
    res.status(200).send("OK");

    // 2. PARSE PAYLOAD
    let payload = req.body;
    if ((!payload || Object.keys(payload).length === 0) && req.rawBody) {
        try { payload = JSON.parse(req.rawBody); } catch (e) { return; }
    }

    if (!payload) return;

    // 3. EVENT ROUTING
    const eventType = payload.event || payload.type || "unknown";
    
    if (eventType === 'messages.upsert') {
        const jid = payload.data?.key?.remoteJid;
        const fromMe = payload.data?.key?.fromMe;
        const text = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;

        if (jid && text && !fromMe) {
            addSystemLog(`MSG IN: ${text.substring(0, 30)}...`, 'success', { headers: req.headers, body: payload });
            handleAIProcess(jid, text);
        }
    } else {
        addSystemLog(`WEBHOOK EVENT: ${eventType}`, 'info', { headers: req.headers, body: payload });
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
    addSystemLog("CONFIG: Updated", "success");
    res.json({ success: true });
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`ENA COACH ENGINE ACTIVE | PORT: ${PORT}`);
    console.log(`WEBHOOK URL: /webhook`);
    console.log(`==========================================\n`);
    addSystemLog(`ENGINE REBOOTED`, 'success');
});
