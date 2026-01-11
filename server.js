/**
 * Ena Coach AI Agent - Unified Server
 * Optimized for M-Pesa (Daraja) & WhatsApp (Evolution API)
 */

import 'dotenv/config'; 
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto'; 

// LangChain Imports
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// --- Multi-Service Runtime Configuration ---
const runtimeConfig = {
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
    
    // M-Pesa (Daraja) - HARDCODED PRODUCTION CREDENTIALS
    darajaEnv: 'production', 
    darajaType: 'Till', 
    darajaKey: 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J',
    darajaSecret: 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm',
    darajaPasskey: '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f',
    darajaShortcode: '5512238', 
    darajaAccountRef: 'ENA_COACH',
    darajaSecurityCredential: 'JhYtB62wiNMf/XrJ0mWOBVMgaVLCIiCQsuAGJ2P38wCrfn9CFtk/ZUAF/0h8ILI5fCy/CjJg4aixLigtOF0cR7bFmSspQclARTu6eEkAm3wQixPr/f8LRq4T6ql7cSEZX7A8097LUdrOGGFCDWeGmAJTxngp26AXl6quKqQYP35QvznzVqpuz0WYMdZgo0Kb++yr5znv6AFjigrCr0MT/SzsEXti0Gy2VSYYJduDrp9vMZ6SwoFLoxXA+WciE3cuSsuYpUUJoXU9MBYW0PB5H0JQzyyGeWwngGd+YTQf0iTa7LrsTB0aCaedoBOfFT43pjC/Y2L55LaedlqsKeix4A==',
    darajaInitiatorPassword: 'menopasscode'
};

// Global Memory Stores
const paymentStore = new Map(); 
const systemLogs = []; 
let lastCriticalError = null; // Store for the frontend prompt

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
  
  addSystemLog(`Initiating STK Push to ${formattedPhone}...`, 'info');

  try {
      const tokenResult = await getDarajaToken();
      if (typeof tokenResult === 'object' && tokenResult.error) {
          const errMsg = `Authentication Error: ${tokenResult.error}. Please check your Consumer Key/Secret.`;
          addSystemLog(errMsg, 'error');
          return { success: false, error: "AUTH_ERROR", message: errMsg };
      }
      
      const token = tokenResult;
      const timestamp = getDarajaTimestamp();
      const shortcode = runtimeConfig.darajaShortcode.trim();
      const passkey = runtimeConfig.darajaPasskey.trim();
      const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
      
      // CRITICAL: For Buy Goods Tills, PartyB is usually the Store Number (Shortcode)
      const payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerBuyGoodsOnline",
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone,
        "PartyB": shortcode,
        "PhoneNumber": formattedPhone,
        "CallBackURL": "https://ena-coach-bot.onrender.com/callback/mpesa",
        "AccountReference": runtimeConfig.darajaAccountRef,
        "TransactionDesc": "Bus Ticket"
      };

      const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.ResponseCode === "0") {
          addSystemLog(`STK Push Request Sent Successfully! ID: ${data.CheckoutRequestID}`, 'success');
          paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount });
          return { success: true, checkoutRequestId: data.CheckoutRequestID };
      }
      
      const failMsg = `Safaricom Rejected Initiation: ${data.CustomerMessage || data.errorMessage || "API Error"}`;
      addSystemLog(failMsg, 'error');
      return { success: false, error: "SAFARICOM_REJECTION", message: failMsg };
  } catch (error) {
      const sysMsg = `System Error: Could not connect to Safaricom API. ${error.message}`;
      addSystemLog(sysMsg, 'error');
      return { success: false, error: "SYSTEM_ERROR", message: sysMsg };
  }
}

// --- API ---

app.get('/api/config', (req, res) => res.json(runtimeConfig));
app.get('/api/debug/system-logs', (req, res) => res.json(systemLogs));
app.get('/api/debug/latest-error', (req, res) => {
    const err = lastCriticalError;
    lastCriticalError = null; // Reset once polled
    res.json(err);
});

app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    addSystemLog(`Config updated via dashboard.`, 'info');
    res.json({ success: true });
});

app.post('/api/payment/initiate', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, req.body.amount);
    res.json(result);
});

// LangChain/Agent Logic (Placeholder for full agent)
app.post('/webhook', (req, res) => {
    // Logic for incoming WhatsApp messages handled here
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}. Production Till ${runtimeConfig.darajaShortcode} Active.`);
});
