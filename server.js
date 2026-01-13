
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
    darajaCallbackUrl: 'https://ena-coach-bot.onrender.com/callback/mpesa',
};

const systemLogs = []; 
const userHistory = new Map(); 

// Mock DB for routes (Init with some data)
let INTERNAL_ROUTES = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, type: 'Luxury' },
  { id: 'R002', origin: 'Kisumu', destination: 'Nairobi', departureTime: '08:00 AM', price: 1500, type: 'Luxury' },
  { id: 'R003', origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, type: 'Standard' },
  { id: 'R005', origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, type: 'Luxury' },
];

function addSystemLog(msg, type = 'info') {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

const app = express();
app.use(bodyParser.json());

// --- Evolution API (WhatsApp) Logic ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    try {
        const response = await fetch(`${cleanUrl}/message/sendText/${runtimeConfig.instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: jid, text: text })
        });
        return { success: response.ok };
    } catch(e) { return { success: false, error: e.message }; }
}

// --- Route Management Endpoints (The "Database") ---
app.get('/api/routes', (req, res) => res.json(INTERNAL_ROUTES));

app.post('/api/routes', (req, res) => {
    const newRoute = { 
        id: `R${Math.floor(Math.random()*900) + 100}`, 
        ...req.body 
    };
    INTERNAL_ROUTES.push(newRoute);
    addSystemLog(`New Route Added: ${newRoute.origin} to ${newRoute.destination}`, 'success');
    res.json(newRoute);
});

app.put('/api/routes/:id', (req, res) => {
    const idx = INTERNAL_ROUTES.findIndex(r => r.id === req.params.id);
    if (idx !== -1) {
        INTERNAL_ROUTES[idx] = { ...INTERNAL_ROUTES[idx], ...req.body };
        addSystemLog(`Route Updated: ${req.params.id}`, 'info');
        return res.json(INTERNAL_ROUTES[idx]);
    }
    res.status(404).json({ error: 'Route not found' });
});

app.delete('/api/routes/:id', (req, res) => {
    const count = INTERNAL_ROUTES.length;
    INTERNAL_ROUTES = INTERNAL_ROUTES.filter(r => r.id !== req.params.id);
    if (INTERNAL_ROUTES.length < count) {
        addSystemLog(`Route Deleted: ${req.params.id}`, 'error');
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Route not found' });
});

// --- Diagnostics, Config & Static Serving ---
app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Ping" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`Ena Coach Engine Operational on port ${PORT}`, 'info'));
