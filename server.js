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
    
    // M-Pesa (Daraja) - PRODUCTION CREDENTIALS
    darajaEnv: 'production', 
    darajaType: 'Till', 
    darajaKey: 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J',
    darajaSecret: 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm',
    darajaPasskey: '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f', 
    darajaShortcode: '5512238', // Store Number
    darajaStoreNumber: '5512238', // Till Number
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
  if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) formattedPhone = '254' + formattedPhone;
  
  addSystemLog(`Contacting Safaricom for ${formattedPhone}...`, 'info');

  try {
      const tokenResult = await getDarajaToken();
      if (typeof tokenResult === 'object' && tokenResult.error) {
          addSystemLog(`Auth Failed: ${tokenResult.error}`, 'error');
          return { success: false, error: "AUTH_ERROR", message: `Authentication Failed: ${tokenResult.error}. Check Consumer Key/Secret.` };
      }
      
      const timestamp = getDarajaTimestamp();
      const shortcode = runtimeConfig.darajaShortcode.trim();
      const storeNumber = runtimeConfig.darajaStoreNumber.trim() || shortcode;
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
        "PartyB": storeNumber,
        "PhoneNumber": formattedPhone,
        "CallBackURL": runtimeConfig.darajaCallbackUrl.trim(),
        "AccountReference": runtimeConfig.darajaAccountRef.trim().replace(/\s/g, '').substring(0, 12),
        "TransactionDesc": "BusBooking"
      };

      const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${tokenResult}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.ResponseCode === "0") {
          addSystemLog(`STK Sent Successfully: ${data.ResponseDescription}`, 'success');
          return { success: true, checkoutRequestId: data.CheckoutRequestID, description: data.ResponseDescription };
      }
      
      const errorMessage = data.CustomerMessage || data.errorMessage || data.ResponseDescription || "Safaricom rejected the request.";
      const failMsg = `M-Pesa Rejected [${data.ResponseCode}]: ${errorMessage}`;
      addSystemLog(failMsg, 'error');
      return { success: false, error: "REJECTION", message: errorMessage, code: data.ResponseCode };
  } catch (error) {
      addSystemLog(`API Connection Error: ${error.message}`, 'error');
      return { success: false, error: "SYSTEM_ERROR", message: `Connection Error: ${error.message}` };
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
            if (data.ResultCode === "0") return { status: 'COMPLETED', message: "Payment Verified" };
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
    addSystemLog(`Production configuration updated.`, 'info');
    res.status(200).json({ success: true });
});

app.post('/api/payment/initiate', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, req.body.amount);
    res.status(200).json(result);
});

app.get('/api/payment/status/:id', async (req, res) => {
    const result = await queryDarajaStatus(req.params.id);
    res.status(200).json(result);
});

app.post('/callback/mpesa', (req, res) => {
    const { Body } = req.body;
    if (Body?.stkCallback) {
        const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
        if(ResultCode === 0) addSystemLog(`SUCCESS: Payment Confirmed for ${CheckoutRequestID}`, 'success');
        else addSystemLog(`CANCELLED: Payment Failed for ${CheckoutRequestID} (${ResultDesc})`, 'error');
    }
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Ena Coach AI server running on port ${PORT}`));
