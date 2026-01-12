/**
 * Ena Coach AI Agent - Unified Server
 * Optimized for M-Pesa (Daraja) & WhatsApp (Evolution API)
 */

import 'dotenv/config'; 
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// --- Multi-Service Runtime Configuration ---
const runtimeConfig = {
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
    
    // M-Pesa (Daraja) - PRODUCTION CREDENTIALS (Hardcoded Defaults for Persistence)
    darajaEnv: 'production', 
    darajaType: 'Till', 
    darajaKey: 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J',
    darajaSecret: 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm',
    darajaPasskey: '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f', 
    darajaShortcode: '5512238', // Store Number (BusinessShortCode)
    darajaStoreNumber: '4159923', // Actual Till Number (PartyB)
    darajaAccountRef: 'ENA_COACH',
    darajaCallbackUrl: 'https://ena-coach-bot.onrender.com/callback/mpesa',
    darajaSecurityCredential: '',
    darajaInitiatorPassword: ''
};

const systemLogs = []; 
let lastCriticalError = null;

function addSystemLog(msg, type = 'info') {
    const log = { msg, type, timestamp: new Date().toISOString() };
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
    console.log(`[${type.toUpperCase()}] ${msg}`);
    if (type === 'error') {
        lastCriticalError = { msg, timestamp: Date.now() };
    }
}

const getDarajaBaseUrl = () => runtimeConfig.darajaEnv === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});
app.use(bodyParser.json());

// --- Daraja Core ---

function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  const key = runtimeConfig.darajaKey.trim();
  const secret = runtimeConfig.darajaSecret.trim();
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  try {
    const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await response.json();
    if (!response.ok) return { error: data.errorMessage || data.message || `HTTP ${response.status}` };
    return data.access_token;
  } catch (error) { return { error: error.message }; }
}

async function triggerSTKPush(phoneNumber, amount) {
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
      formattedPhone = '254' + formattedPhone;
  }
  
  addSystemLog(`Initiating STK Push (Production). Target: ${formattedPhone}, Amount: ${amount}`, 'info');

  try {
      const tokenResult = await getDarajaToken();
      if (typeof tokenResult === 'object' && tokenResult.error) {
          addSystemLog(`Auth Failed: ${tokenResult.error}`, 'error');
          return { success: false, error: "AUTH_ERROR", message: tokenResult.error };
      }
      
      const timestamp = getDarajaTimestamp();
      const shortcode = runtimeConfig.darajaShortcode.trim(); // Store Number
      const tillNumber = runtimeConfig.darajaStoreNumber.trim(); // Actual Till Number
      const passkey = runtimeConfig.darajaPasskey.trim();
      const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
      
      const transactionType = runtimeConfig.darajaType === 'Till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';

      const payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": transactionType,
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone,
        "PartyB": runtimeConfig.darajaType === 'Till' ? tillNumber : shortcode,
        "PhoneNumber": formattedPhone,
        "CallBackURL": runtimeConfig.darajaCallbackUrl.trim(),
        "AccountReference": runtimeConfig.darajaAccountRef.trim().replace(/\s/g, '').substring(0, 12),
        "TransactionDesc": "BusTicket"
      };

      addSystemLog(`DARAJA PAYLOAD: ShortCode=${payload.BusinessShortCode}, PartyB=${payload.PartyB}, Phone=${payload.PhoneNumber}`, 'info');

      const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${tokenResult}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.ResponseCode === "0") {
          addSystemLog(`Safaricom Accepted: ${data.ResponseDescription}`, 'success');
          return { success: true, checkoutRequestId: data.CheckoutRequestID, description: data.ResponseDescription };
      }
      
      addSystemLog(`M-Pesa API Rejected: ${data.CustomerMessage || data.ResponseDescription}`, 'error');
      return { success: false, error: "REJECTION", message: data.CustomerMessage || data.ResponseDescription };
  } catch (error) {
      addSystemLog(`Connection Failure: ${error.message}`, 'error');
      return { success: false, error: "SYSTEM_ERROR", message: error.message };
  }
}

async function queryDarajaStatus(id) {
    const tokenResult = await getDarajaToken();
    if (typeof tokenResult === 'object') return { status: 'ERROR', message: tokenResult.error };
    
    try {
        const timestamp = getDarajaTimestamp();
        const shortcode = runtimeConfig.darajaShortcode.trim();
        const passkey = runtimeConfig.darajaPasskey.trim();
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenResult}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "BusinessShortCode": shortcode,
                "Password": password,
                "Timestamp": timestamp,
                "CheckoutRequestID": id
            })
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            if (data.ResultCode === "0") return { status: 'COMPLETED', message: "Verified" };
            return { status: 'FAILED', message: data.ResultDesc };
        }
        return { status: 'PENDING', message: data.ResponseDescription || "Awaiting PIN" };
    } catch (e) { return { status: 'ERROR', message: e.message }; }
}

// --- API ---

app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));

app.get('/api/debug/latest-error', (req, res) => {
    if (!lastCriticalError) return res.status(200).json({ msg: null });
    const err = { ...lastCriticalError };
    lastCriticalError = null; 
    res.status(200).json(err);
});

app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog(`Configuration manually updated via Dashboard.`, 'info');
    res.json({ success: true });
});

app.post('/api/payment/initiate', async (req, res) => {
    res.json(await triggerSTKPush(req.body.phoneNumber, req.body.amount));
});

app.get('/api/payment/status/:id', async (req, res) => {
    res.json(await queryDarajaStatus(req.params.id));
});

app.post('/callback/mpesa', (req, res) => {
    const { Body } = req.body;
    if (Body?.stkCallback) {
        const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
        if(ResultCode === 0) addSystemLog(`Payment ${CheckoutRequestID} confirmed by Safaricom.`, 'success');
        else addSystemLog(`Payment ${CheckoutRequestID} rejected by user.`, 'error');
    }
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Ena Coach Engine Live on port ${PORT}`));
