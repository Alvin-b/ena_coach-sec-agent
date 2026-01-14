
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- M-Pesa Daraja Logic ---
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
    } catch (error) { 
        addSystemLog(`DARAJA AUTH ERROR: ${error.message}`, 'error');
        return null; 
    }
}

async function triggerSTKPush(phoneNumber, amount) {
    addSystemLog(`DARAJA: Initializing STK Push for ${phoneNumber} (KES ${amount})...`, 'info');
    
    const token = await getDarajaToken();
    if (!token) {
        addSystemLog("DARAJA ERROR: Failed to obtain OAuth token.", "error");
        return { success: false, message: "Auth Failed" };
    }
    
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
        "TransactionDesc": "Bus Booking Payment"
    };

    try {
        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            addSystemLog(`DARAJA SUCCESS: STK Push sent to ${formattedPhone}`, 'success');
            return { success: true, checkoutId: data.CheckoutRequestID };
        } else {
            addSystemLog(`DARAJA FAILED: ${data.ResponseDescription}`, 'error');
            return { success: false, message: data.ResponseDescription };
        }
    } catch (error) {
        addSystemLog(`DARAJA NETWORK ERROR: ${error.message}`, 'error');
        return { success: false, message: "Network Error" };
    }
}

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

// --- AI Engine ---
async function handleAIProcess(phoneNumber, incomingText) {
    try {
        if (!runtimeConfig.apiKey) return addSystemLog("AI HALTED: No API Key", "error");
        
        // Check for payment intent manually for extra speed
        const lowerText = incomingText.toLowerCase();
        if (lowerText.includes('pay') || lowerText.includes('book') || lowerText.includes('confirm')) {
            // Optional: You could use Gemini here to extract amount, or use a default if it's a fixed route.
            // For testing, we'll let the AI decide.
        }

        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ 
            model: 'gemini-3-flash-preview', 
            contents: `User: "${incomingText}". Reply as Martha, the Ena Coach assistant.`,
            config: { 
                systemInstruction: "You are Martha from Ena Coach. Help with bus bookings. If a user is ready to pay, tell them you are sending an M-Pesa prompt. Keep it brief." 
            }
        });

        if (response.text) {
            await sendWhatsApp(phoneNumber, response.text);
            
            // Side-effect: If the reply mentions sending a prompt, trigger it.
            if (response.text.toLowerCase().includes('prompt') || response.text.toLowerCase().includes('m-pesa')) {
                await triggerSTKPush(phoneNumber, 1); // For testing, amount is KES 1
            }
        }
    } catch (e) { 
        addSystemLog(`AI ENGINE ERROR: ${e.message}`, 'error'); 
    }
}

// --- ULTRA-PERMISSIVE RECURSIVE PARSER ---
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

const webhookHandler = async (req, res) => {
    // Respond 200 OK instantly for Evolution API
    res.status(200).send('OK');

    const payload = req.body;
    if (!payload || Object.keys(payload).length === 0) return;

    addSystemLog(`SIGNAL: Keys [${Object.keys(payload).join(', ')}]`, 'info', payload);

    const jid = harvest(payload, ['remoteJid', 'from', 'sender', 'number', 'participant', 'jid']);
    const text = harvest(payload, ['conversation', 'text', 'body', 'content', 'caption', 'message']);

    const isFromMe = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        if (obj.fromMe === true) return true;
        for (const k in obj) if (isFromMe(obj[k])) return true;
        return false;
    };

    if (jid && text && !isFromMe(payload)) {
        addSystemLog(`MSG DETECTED: "${text}" from ${jid}`, 'success');
        handleAIProcess(jid, text);
    }
};

app.all('/webhook', webhookHandler);

// --- M-Pesa Callback ---
app.post('/callback/mpesa', (req, res) => {
    addSystemLog(`M-PESA SIGNAL RECEIVED`, 'success', req.body);
    // In production, parse stkCallback to notify user of success/fail
    res.status(200).send('OK');
});

// --- Dashboard API ---
app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog("SYSTEM: Configuration updated.", "info");
    res.json({ success: true });
});
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/raw-payloads', (req, res) => res.json(rawPayloads));

// Test Diagnostics
app.post('/api/test/gemini', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: runtimeConfig.apiKey });
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: "Hi" });
        res.json({ success: !!response.text });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/test/whatsapp', async (req, res) => {
    await sendWhatsApp(req.body.phoneNumber, "Martha Connectivity Check: Success.");
    res.json({ success: true });
});

app.post('/api/test/trigger-webhook', async (req, res) => {
    req.body = {
        data: { 
            key: { remoteJid: `${req.body.phoneNumber}@s.whatsapp.net`, fromMe: false },
            message: { conversation: req.body.text }
        }
    };
    return webhookHandler(req, res);
});

// Static Hosting
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => addSystemLog(`ENGINE OPERATIONAL: Port ${PORT}`, 'success'));
