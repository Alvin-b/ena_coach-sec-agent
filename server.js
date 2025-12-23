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
    // AI
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
    // WhatsApp
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    evolutionToken: process.env.EVOLUTION_API_TOKEN || '',
    instanceName: process.env.INSTANCE_NAME || 'EnaCoach',
    // M-Pesa (Daraja)
    darajaEnv: process.env.DARAJA_ENV || 'sandbox', // 'sandbox' or 'production'
    darajaType: process.env.DARAJA_TYPE || 'Paybill', // 'Paybill' or 'Till'
    darajaKey: process.env.DARAJA_CONSUMER_KEY || '',
    darajaSecret: process.env.DARAJA_CONSUMER_SECRET || '',
    darajaPasskey: process.env.DARAJA_PASSKEY || '',
    darajaShortcode: process.env.DARAJA_SHORTCODE || '',
    darajaAccountRef: process.env.DARAJA_ACCOUNT_REF || 'ENA_COACH',
};

// Dynamic URL helper to ensure environment changes apply immediately
const getDarajaBaseUrl = () => runtimeConfig.darajaEnv === 'production' 
    ? 'https://api.safaricom.co.ke' 
    : 'https://sandbox.safaricom.co.ke';

const TICKET_SECRET = process.env.TICKET_SECRET || 'ENA_SUPER_SECRET_KEY_2025';
const SERVER_URL = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});
app.use(bodyParser.json());

// In-Memory Stores
const debugOutbox = []; 
const webhookLogs = []; 
const paymentStore = new Map(); // CheckoutRequestID -> Details
const userSessions = new Map();

// --- Daraja M-Pesa Core Logic ---

function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  const auth = Buffer.from(`${runtimeConfig.darajaKey}:${runtimeConfig.darajaSecret}`).toString('base64');
  try {
    const response = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Auth Failed: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("[Daraja Auth] Error:", error.message);
    return { error: error.message };
  }
}

async function triggerSTKPush(phoneNumber, amount) {
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  const callbackUrl = `${SERVER_URL.replace(/\/$/, '')}/callback/mpesa`;

  try {
      const tokenResult = await getDarajaToken();
      if (typeof tokenResult === 'object' && tokenResult.error) {
          return { success: false, error: "AUTH_ERROR", message: tokenResult.error };
      }
      
      const token = tokenResult;
      const timestamp = getDarajaTimestamp();
      const password = Buffer.from(`${runtimeConfig.darajaShortcode}${runtimeConfig.darajaPasskey}${timestamp}`).toString('base64');
      
      // Explicit Transaction Type from config
      const transactionType = runtimeConfig.darajaType === 'Till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';

      const payload = {
        "BusinessShortCode": runtimeConfig.darajaShortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": transactionType,
        "Amount": Math.ceil(amount),
        "PartyA": formattedPhone,
        "PartyB": runtimeConfig.darajaShortcode,
        "PhoneNumber": formattedPhone,
        "CallBackURL": callbackUrl,
        "AccountReference": runtimeConfig.darajaAccountRef,
        "TransactionDesc": "Bus Booking Payment"
      };

      const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.ResponseCode === "0") {
          paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount, timestamp: Date.now() });
          return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Prompt sent successfully.", raw: data };
      }
      return { success: false, error: "Safaricom_Rejected", message: data.CustomerMessage || data.errorMessage || "Unknown Error", raw: data };
  } catch (error) {
      return { success: false, error: "Network_Error", message: error.message };
  }
}

async function queryDarajaStatus(checkoutRequestId) {
    const local = paymentStore.get(checkoutRequestId);
    if (local && local.status === 'COMPLETED') return { status: 'COMPLETED', message: 'Payment Confirmed.', source: 'local_cache' };

    const tokenResult = await getDarajaToken();
    if (typeof tokenResult === 'object' && tokenResult.error) {
        return { status: 'UNKNOWN', error: "AUTH_ERROR", message: tokenResult.error };
    }
    
    const token = tokenResult;
    const timestamp = getDarajaTimestamp();
    const password = Buffer.from(`${runtimeConfig.darajaShortcode}${runtimeConfig.darajaPasskey}${timestamp}`).toString('base64');
    
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "BusinessShortCode": runtimeConfig.darajaShortcode,
                "Password": password,
                "Timestamp": timestamp,
                "CheckoutRequestID": checkoutRequestId
            })
        });
        const data = await response.json();
        
        if (data.ResponseCode === "0") {
            const resultCode = Number(data.ResultCode);
            if (resultCode === 0) {
                 paymentStore.set(checkoutRequestId, { ...local, status: 'COMPLETED' });
                 return { status: 'COMPLETED', message: data.ResultDesc, raw: data };
            }
            if ([1032, 1037, 1, 2001].includes(resultCode)) {
                paymentStore.set(checkoutRequestId, { ...local, status: 'FAILED' });
                return { status: 'FAILED', message: data.ResultDesc, raw: data };
            }
            return { status: 'PENDING', message: data.ResultDesc || "Waiting for PIN entry.", raw: data };
        }
        return { status: 'UNKNOWN', message: data.errorMessage || "Query failed.", raw: data };
    } catch (e) {
        return { status: 'UNKNOWN', error: 'FETCH_ERROR', message: e.message };
    }
}

// --- WhatsApp & Agent Helpers ---

async function sendWhatsAppMessage(remoteJid, text, instanceOverride = null) {
    const activeInstance = instanceOverride || runtimeConfig.instanceName;
    const apiUrl = runtimeConfig.evolutionUrl;
    const apiToken = runtimeConfig.evolutionToken;
    const cleanNumber = remoteJid ? remoteJid.replace(/@s\.whatsapp\.net|@lid/g, '') : '';

    if (!apiUrl || !apiToken) return;

    try {
        await fetch(`${apiUrl}/message/sendText/${activeInstance}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiToken },
            body: JSON.stringify({ number: cleanNumber, text: text })
        });
    } catch(e) { console.error("WhatsApp Send Error:", e.message); }
}

let agentExecutorPromise = null;
async function getAgentExecutor() {
    if (agentExecutorPromise) return agentExecutorPromise;
    agentExecutorPromise = (async () => {
        const tools = [
            new DynamicStructuredTool({
                name: "searchRoutes",
                description: "Find bus routes.",
                schema: z.object({ origin: z.string(), destination: z.string() }),
                func: async () => "Available Routes: Nairobi to Kisumu (KES 1500), Nairobi to Mombasa (KES 1500)."
            }),
            new DynamicStructuredTool({
                name: "initiatePayment",
                description: "Initiate M-Pesa STK push. Returns checkoutRequestId.",
                schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
                func: async ({ phoneNumber, amount }) => JSON.stringify(await triggerSTKPush(phoneNumber, amount))
            }),
            new DynamicStructuredTool({
                name: "verifyPayment",
                description: "Verify payment status.",
                schema: z.object({ checkoutRequestId: z.string() }),
                func: async ({ checkoutRequestId }) => JSON.stringify(await queryDarajaStatus(checkoutRequestId))
            }),
            new DynamicStructuredTool({
                name: "bookTicket",
                description: "Finalizes booking.",
                schema: z.object({ passengerName: z.string(), checkoutRequestId: z.string() }),
                func: async ({ passengerName, checkoutRequestId }) => {
                    const statusCheck = await queryDarajaStatus(checkoutRequestId);
                    if (statusCheck.status !== 'COMPLETED') return JSON.stringify({ error: "Unpaid" });
                    return JSON.stringify({ status: 'success', ticketId: `TKT-${Math.floor(Math.random()*100000)}` });
                }
            })
        ];

        const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", apiKey: runtimeConfig.apiKey, temperature: 0.1 });
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `You are Martha from Ena Coach. 1. Find route. 2. initiatePayment. 3. verifyPayment. 4. bookTicket. Ask one question at a time.`],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);
        const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
        return new AgentExecutor({ agent, tools });
    })();
    return agentExecutorPromise;
}

// --- API Endpoints ---

app.get('/api/config', (req, res) => res.json(runtimeConfig));

app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    if (req.body.apiKey || req.body.darajaKey) agentExecutorPromise = null;
    res.json({ success: true, config: runtimeConfig });
});

app.post('/api/payment/initiate', async (req, res) => {
    res.json(await triggerSTKPush(req.body.phoneNumber, req.body.amount));
});

app.get('/api/payment/status/:id', async (req, res) => {
    res.json(await queryDarajaStatus(req.params.id));
});

app.post('/webhook', async (req, res) => {
    const { type, data, instance } = req.body || {};
    if (type !== 'messages.upsert' || !data?.message || data?.key?.fromMe) return res.sendStatus(200);
    const text = data.message.conversation || data.message.extendedTextMessage?.text;
    if (!text) return res.sendStatus(200);
    webhookLogs.unshift({ sender: data.key.remoteJid, content: text, timestamp: new Date().toISOString() });
    
    (async () => {
        try {
           const executor = await getAgentExecutor();
           const jid = data.key.remoteJid;
           let history = userSessions.get(jid) || [];
           const result = await executor.invoke({ input: text, current_time: new Date().toLocaleString(), chat_history: history, user_name: data.pushName || 'Customer' });
           history.push(new HumanMessage(text), new AIMessage(result.output));
           if (history.length > 10) history = history.slice(-10);
           userSessions.set(jid, history);
           await sendWhatsAppMessage(jid, result.output, instance);
        } catch(e) { console.error("Agent Error:", e.message); }
    })();
    res.sendStatus(200);
});

app.post('/callback/mpesa', (req, res) => {
    const { Body } = req.body;
    if (Body?.stkCallback) {
        const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
        const current = paymentStore.get(CheckoutRequestID);
        if(current) {
            paymentStore.set(CheckoutRequestID, { ...current, status: ResultCode === 0 ? 'COMPLETED' : 'FAILED', resultDesc: ResultDesc });
        }
    }
    res.sendStatus(200);
});

app.get('/api/debug/webhook-logs', (req, res) => res.json(webhookLogs));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Ena Coach Server active on port ${PORT} [Env: ${runtimeConfig.darajaEnv}]`));
