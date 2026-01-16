
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
            body: meta.body || 'No Body Detected'
        });
        if (DATA_STORE.raw.length > 50) DATA_STORE.raw.pop();
    }
    
    if (DATA_STORE.logs.length > 100) DATA_STORE.logs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();

/**
 * CRITICAL FIX: Robust Body Parsing
 * We use 'verify' to capture the raw body without consuming the stream manually.
 * This prevents the "req.body is empty" issue common when Evolution sends JSON.
 */
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
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

// --- 4. EVOLUTION API INTEGRATION ---
async function sendWhatsApp(jid, text, detectedInstance = null) {
    const instance = detectedInstance || runtimeConfig.instanceName;
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) {
        addSystemLog("WA ERROR: Missing Evolution URL or Token", "error");
        return;
    }
    
    const url = `${runtimeConfig.evolutionUrl.replace(/\/$/, '')}/message/sendText/${instance}`;
    const phoneNumber = jid.split('@')[0];
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: phoneNumber, text })
        });
        
        if (!response.ok) {
            const errData = await response.text();
            addSystemLog(`WA SEND FAILED (${response.status}): ${errData}`, "error");
        } else {
            addSystemLog(`REPLY SENT to ${phoneNumber} via instance [${instance}]`, 'success');
        }
    } catch (e) { addSystemLog(`WA ERROR: ${e.message}`, 'error'); }
}

async function sendWhatsAppMedia(jid, caption, mediaUrl, detectedInstance = null) {
    const instance = detectedInstance || runtimeConfig.instanceName;
    if (!runtimeConfig.evolutionUrl) return;
    const url = `${runtimeConfig.evolutionUrl.replace(/\/$/, '')}/message/sendMedia/${instance}`;
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
        if (res.ok) addSystemLog(`QR TICKET SENT via instance [${instance}]`, 'success');
    } catch (e) { addSystemLog(`MEDIA ERROR: ${e.message}`, 'error'); }
}

// --- 5. AI ENGINE ---
async function handleAIProcess(jid, msg, instance) {
    if (!runtimeConfig.apiKey) {
        addSystemLog("AI HALT: No Gemini API Key provided in dashboard or env", "error");
        return;
    }
    
    const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `User (on WhatsApp): "${msg}"`,
            config: {
                systemInstruction: "You are Martha, the Ena Coach AI Agent. Help users book tickets. Keep responses concise for WhatsApp. If they confirm a route, use bookTicket.",
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
                        ? `I found these routes: ${matches.map(r => `${r.id}: ${r.origin}->${r.destination} @ KES ${r.price}`).join('. ')}`
                        : "Sorry, I couldn't find any direct routes for that search.";
                    await sendWhatsApp(jid, reply, instance);
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
                    
                    await sendWhatsApp(jid, `✅ Booking Successful! Ticket ${ticketId} generated for ${call.args.passengerName}. Sending your QR ticket now...`, instance);
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${ticketId}`;
                    await sendWhatsAppMedia(jid, `Ena Coach Digital Ticket`, qrUrl, instance);
                }
            }
        } else if (result.text) {
            await sendWhatsApp(jid, result.text, instance);
        }
    } catch (e) { addSystemLog(`AI ERROR: ${e.message}`, 'error'); }
}

// --- 6. UNIFIED WEBHOOK HANDLER ---
app.post('/webhook', (req, res) => {
    // 1. Respond 200 OK immediately (required by Evolution API to prevent retries)
    res.status(200).send("OK");

    // 2. Parse Payload
    const payload = req.body;
    
    // Diagnostic logging for the sniffer
    addSystemLog(`INCOMING WEBHOOK: ${req.method} /webhook`, 'info', { 
        headers: req.headers, 
        body: payload || req.rawBody 
    });

    if (!payload || Object.keys(payload).length === 0) {
        addSystemLog("WEBHOOK IGNORED: Empty body. Check Content-Type.", "warning");
        return;
    }

    // 3. Logic Mapping
    const eventType = payload.event || payload.type || "unknown";
    const instance = payload.instance || payload.instanceId || null;
    
    if (eventType === 'messages.upsert') {
        const jid = payload.data?.key?.remoteJid;
        const fromMe = payload.data?.key?.fromMe;
        const text = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;

        if (fromMe) {
            addSystemLog("MESSAGE IGNORED: Sent from bot itself", "info");
            return;
        }

        if (jid && text) {
            addSystemLog(`MESSAGE RECEIVED: "${text.substring(0, 30)}..." from ${jid}`, 'success');
            handleAIProcess(jid, text, instance);
        } else {
            addSystemLog("MESSAGE IGNORED: No text content or invalid JID", "info");
        }
    } else {
        addSystemLog(`EVENT RECEIVED: ${eventType}`, 'info');
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
    addSystemLog("ADMIN: Config Updated", "success");
    res.json({ success: true });
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`ENA COACH MASTER ENGINE ONLINE | PORT: ${PORT}`);
    console.log(`WEBHOOK: https://[YOUR-RENDER-URL]/webhook`);
    console.log(`==========================================\n`);
    addSystemLog(`ENGINE REBOOTED`, 'success');
});
