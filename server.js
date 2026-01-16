
/**
 * Ena Coach AI Agent - Master Unified Server
 * Features: Persistence, AI Tooling, and Media Integration
 */

import 'dotenv/config'; 
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.FLY_APP_NAME ? 3000 : (process.env.PORT || 3000);

// --- 1. PERSISTENT DATA STORE (Simulated) ---
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

function addSystemLog(msg, type = 'info', raw = null) {
    if (msg.includes('/api/debug')) return;
    const log = { msg, type, timestamp: new Date().toISOString() };
    DATA_STORE.logs.unshift(log);
    if (raw) DATA_STORE.raw.unshift({ timestamp: log.timestamp, ...raw });
    if (DATA_STORE.logs.length > 50) DATA_STORE.logs.pop();
    if (DATA_STORE.raw.length > 20) DATA_STORE.raw.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

// --- 2. AI TOOLS DEFINITION ---
const tools = [
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

const app = express();
app.use(express.json({ limit: '50mb' }));

// --- 3. WHATSAPP SENDER (Text & Media) ---
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
        if (res.ok) addSystemLog(`MEDIA TICKET SENT to ${jid}`, 'success');
    } catch (e) { addSystemLog(`MEDIA SEND ERROR: ${e.message}`, 'error'); }
}

// --- 4. AI AGENT LOGIC ---
async function handleAIProcess(jid, msg) {
    if (!runtimeConfig.apiKey) return;
    const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `[SYSTEM: Time ${new Date().toLocaleTimeString()}] User: "${msg}"`,
            config: {
                systemInstruction: "You are Martha from Ena Coach. Use tools to find routes and book. Keep WhatsApp replies very short.",
                tools: [{ functionDeclarations: tools }]
            }
        });

        let textReply = response.text || "";
        
        if (response.functionCalls) {
            for (const call of response.functionCalls) {
                if (call.name === 'searchRoutes') {
                    const found = DATA_STORE.routes.filter(r => 
                        r.origin.toLowerCase().includes(call.args.origin.toLowerCase()) && 
                        r.destination.toLowerCase().includes(call.args.destination.toLowerCase())
                    );
                    const resultText = found.length > 0 ? JSON.stringify(found) : "No routes found.";
                    // Direct reply for simplicity in this bridge
                    textReply = found.length > 0 
                        ? `I found these routes for you: ${found.map(r => `${r.id}: ${r.origin}->${r.destination} @ KES ${r.price}`).join('. ')}` 
                        : "Sorry, no routes found.";
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
                    textReply = `✅ Confirmed! Ticket ${ticketId} generated for ${call.args.passengerName}. Sending your QR ticket now...`;
                    
                    // 1. Send text confirmation
                    await sendWhatsApp(jid, textReply);
                    // 2. Send Media Ticket
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${ticketId}`;
                    await sendWhatsAppMedia(jid, `Your Ena Coach Ticket: ${ticketId}`, qrUrl);
                    return; // Stop here as we've handled the turn
                }
            }
        }

        if (textReply) await sendWhatsApp(jid, textReply);
    } catch (e) { addSystemLog(`AI ERROR: ${e.message}`, 'error'); }
}

// --- 5. ROUTES ---
app.post('/webhook', (req, res) => {
    res.status(200).send('OK');
    const payload = req.body;
    if (payload.event === 'messages.upsert') {
        const jid = payload.data.key.remoteJid;
        const text = payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text;
        if (text && !payload.data.key.fromMe) {
            addSystemLog(`WEBHOOK MSG: ${text}`, 'success', { headers: req.headers, body: payload });
            handleAIProcess(jid, text);
        }
    }
});

// Admin Dashboard Sync API
app.get('/api/routes', (req, res) => res.json(DATA_STORE.routes));
app.get('/api/tickets', (req, res) => res.json(DATA_STORE.tickets));
app.get('/api/debug/system-logs', (req, res) => res.json(DATA_STORE.logs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(DATA_STORE.raw));
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    res.json({ success: true });
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`ENA COACH MASTER SERVER ONLINE | PORT: ${PORT}`);
});
