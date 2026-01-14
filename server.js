
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
    darajaKey: (process.env.DARAJA_KEY || 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J').trim(),
    darajaSecret: (process.env.DARAJA_SECRET || 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm').trim(),
    darajaPasskey: (process.env.DARAJA_PASSKEY || '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f').trim(), 
    darajaShortcode: (process.env.DARAJA_SHORTCODE || '5512238').trim(), 
    darajaStoreNumber: (process.env.DARAJA_STORE || '4159923').trim(), 
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
// Increased limits to handle large WhatsApp payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Daraja M-Pesa Core ---
const getDarajaBaseUrl = () => runtimeConfig.darajaEnv === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

function getDarajaTimestamp() {
    const now = new Date();
    return now.getFullYear() +
        ('0' + (now.getMonth() + 1)).slice(-2) +
        ('0' + now.getDate()).slice(-2) +
        ('0' + now.getHours()).slice(-2) +
        ('0' + now.getMinutes()).slice(-2) +
        ('0' + now.getSeconds()).slice(-2);
}

async function getDarajaToken() {
    const key = runtimeConfig.darajaKey.trim();
    const secret = runtimeConfig.darajaSecret.trim();
    if (!key || !secret) return null;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        const data = await response.json();
        return data.access_token || null;
    } catch (error) { return null; }
}

async function triggerSTKPush(phoneNumber, amount) {
    addSystemLog(`DARAJA: Initializing STK Push for ${phoneNumber}...`, 'info');
    const token = await getDarajaToken();
    if (!token) return { success: false, message: "M-Pesa Auth Failed" };
    
    const timestamp = getDarajaTimestamp();
    const shortcode = runtimeConfig.darajaShortcode.trim();
    const passkey = runtimeConfig.darajaPasskey.trim();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    
    let formattedPhone = phoneNumber.toString().replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('7')) formattedPhone = '254' + formattedPhone;

    const payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": runtimeConfig.darajaType === 'Till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone,
        "PartyB": runtimeConfig.darajaType === 'Till' ? runtimeConfig.darajaStoreNumber : shortcode,
        "PhoneNumber": formattedPhone,
        "CallBackURL": runtimeConfig.darajaCallbackUrl,
        "AccountReference": runtimeConfig.darajaAccountRef,
        "TransactionDesc": "Bus Booking"
    };

    try {
        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            addSystemLog(`DARAJA SUCCESS: Sent to ${formattedPhone}`, 'success');
            return { success: true };
        }
        addSystemLog(`DARAJA REJECTED: ${data.ResponseDescription}`, 'error');
        return { success: false };
    } catch (error) { return { success: false }; }
}

// --- WhatsApp Outbound ---
async function sendWhatsApp(jid, text) {
    if (!runtimeConfig.evolutionUrl || !runtimeConfig.evolutionToken) return;
    const cleanUrl = runtimeConfig.evolutionUrl.replace(/\/$/, '');
    const cleanJid = jid.split('@')[0].replace(/[^0-9]/g, '');
    const targetUrl = `${cleanUrl}/message/sendText/${runtimeConfig.instanceName}`;

    try {
        await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': runtimeConfig.evolutionToken },
            body: JSON.stringify({ number: cleanJid, text: text })
        });
        addSystemLog(`REPLY SENT to ${cleanJid}`, 'success');
    } catch(e) { addSystemLog(`REPLY ERROR: ${e.message}`, 'error'); }
}

// --- AI Engine ---
async function handleAIProcess(phoneNumber, incomingText) {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Martha: `,
            config: { systemInstruction: "You are Martha, Ena Coach Assistant. Help with bookings. If user is ready to pay, mention M-Pesa." }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
            const lower = response.text.toLowerCase();
            if (lower.includes('m-pesa') || lower.includes('prompt')) {
                await triggerSTKPush(phoneNumber, 1);
            }
        }
    } catch (e) { addSystemLog(`AI ERROR: ${e.message}`, 'error'); }
}

// --- Webhook Entry Point ---
app.all('/webhook', async (req, res) => {
    // 1. INSTANT ACKNOWLEDGEMENT (Prevents Evolution API from dropping connection)
    res.sendStatus(200);

    const payload = req.body;
    if (!payload || Object.keys(payload).length === 0) return;

    addSystemLog(`WEBHOOK SIGNAL RECEIVED`, 'info', payload);

    // 2. EXPLICIT EXTRACTION (Matches your confirmed payload)
    let jid = null;
    let text = null;
    let fromMe = false;

    if (payload.event === 'messages.upsert' && payload.data) {
        jid = payload.data.key?.remoteJid;
        fromMe = payload.data.key?.fromMe || false;
        text = payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text;
    }

    // 3. VALIDATION & PROCESSING
    if (jid && text && !fromMe) {
        addSystemLog(`MATCH FOUND: "${text}" from ${jid}`, 'success');
        handleAIProcess(jid, text);
    } else {
        const reason = fromMe ? "Loop (From Me)" : "Incomplete (JID/Text missing)";
        addSystemLog(`SIGNAL DISCARDED: ${reason}`, 'warning');
    }
});

// --- M-Pesa Callback ---
app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA CALLBACK`, 'success', req.body);
    res.sendStatus(200);
});

// --- Admin Endpoints ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Config Updated", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

// --- Static Site ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`ENGINE LIVE ON PORT ${PORT}`, 'success'));
