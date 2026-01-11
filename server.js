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
// UPDATED: Hardcoded your provided credentials for full production setup
const runtimeConfig = {
    // AI
    apiKey: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
    // WhatsApp
    evolutionUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '').trim(),
    evolutionToken: (process.env.EVOLUTION_API_TOKEN || '').trim(),
    instanceName: (process.env.INSTANCE_NAME || 'EnaCoach').trim(),
    
    // M-Pesa (Daraja) - YOUR PRODUCTION CREDENTIALS
    darajaEnv: 'production', 
    darajaType: 'Till', 
    darajaKey: 'vz2udWubzGyYSTzkEWGo7wM6MTP2aK8uc6GnoPHAMuxgTB6J',
    darajaSecret: 'bW5AKfCRXIqQ1DyAMriKVAKkUULaQl8FLdPA8SadMqiylrwQPZR8tJAAS0mVG1rm',
    darajaPasskey: '22d216ef018698320b41daf10b735852007d872e539b1bddd061528b922b8c4f',
    darajaShortcode: '5512238', // This is your Till Number
    darajaAccountRef: 'ENA_COACH',
    // Storing the Security Credential for advanced API calls (Account Balance/Status etc)
    darajaSecurityCredential: 'JhYtB62wiNMf/XrJ0mWOBVMgaVLCIiCQsuAGJ2P38wCrfn9CFtk/ZUAF/0h8ILI5fCy/CjJg4aixLigtOF0cR7bFmSspQclARTu6eEkAm3wQixPr/f8LRq4T6ql7cSEZX7A8097LUdrOGGFCDWeGmAJTxngp26AXl6quKqQYP35QvznzVqpuz0WYMdZgo0Kb++yr5znv6AFjigrCr0MT/SzsEXti0Gy2VSYYJduDrp9vMZ6SwoFLoxXA+WciE3cuSsuYpUUJoXU9MBYW0PB5H0JQzyyGeWwngGd+YTQf0iTa7LrsTB0aCaedoBOfFT43pjC/Y2L55LaedlqsKeix4A=='
};

// Dynamic URL helper
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

const paymentStore = new Map(); 
const webhookLogs = []; 
const userSessions = new Map();

// --- Daraja M-Pesa Core Logic ---

function getDarajaTimestamp() {
  const date = new Date();
  return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
}

async function getDarajaToken() {
  const key = runtimeConfig.darajaKey.trim();
  const secret = runtimeConfig.darajaSecret.trim();
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const tokenUrl = `${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;
  
  try {
    const response = await fetch(tokenUrl, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await response.json();
    if (!response.ok) {
        return { error: data.errorMessage || data.message || `HTTP ${response.status}`, status: response.status };
    }
    return data.access_token;
  } catch (error) {
    return { error: error.message };
  }
}

async function triggerSTKPush(phoneNumber, amount) {
  // Normalize phone number to 254 format
  let formattedPhone = phoneNumber.replace('+', '').replace(/^0/, '254');
  if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
    formattedPhone = '254' + formattedPhone;
  }
  
  // Render.com external URL fallback or localhost
  const serverBase = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const callbackUrl = `${serverBase.replace(/\/$/, '')}/callback/mpesa`;

  try {
      const tokenResult = await getDarajaToken();
      if (typeof tokenResult === 'object' && tokenResult.error) {
          return { success: false, error: "AUTH_ERROR", message: `Safaricom Rejected Credentials: ${tokenResult.error}` };
      }
      
      const token = tokenResult;
      const timestamp = getDarajaTimestamp();
      const shortcode = runtimeConfig.darajaShortcode.trim();
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
        "PartyB": shortcode,
        "PhoneNumber": formattedPhone,
        "CallBackURL": callbackUrl,
        "AccountReference": runtimeConfig.darajaAccountRef.trim(),
        "TransactionDesc": "Bus Ticket Payment"
      };

      const stkUrl = `${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`;
      const response = await fetch(stkUrl, {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.ResponseCode === "0") {
          paymentStore.set(data.CheckoutRequestID, { status: 'PENDING', phone: formattedPhone, amount, timestamp: Date.now() });
          return { success: true, checkoutRequestId: data.CheckoutRequestID, message: "STK Prompt sent to client phone.", raw: data };
      }
      return { success: false, error: "Safaricom_Error", message: data.CustomerMessage || data.errorMessage || "Unknown rejection by Safaricom API", raw: data };
  } catch (error) {
      return { success: false, error: "System_Error", message: `Internal server error: ${error.message}` };
  }
}

async function queryDarajaStatus(checkoutRequestId) {
    const tokenResult = await getDarajaToken();
    if (typeof tokenResult === 'object' && tokenResult.error) return { status: 'UNKNOWN', message: tokenResult.error };
    
    const token = tokenResult;
    const timestamp = getDarajaTimestamp();
    const shortcode = runtimeConfig.darajaShortcode.trim();
    const passkey = runtimeConfig.darajaPasskey.trim();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    
    try {
        const response = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "BusinessShortCode": shortcode,
                "Password": password,
                "Timestamp": timestamp,
                "CheckoutRequestID": checkoutRequestId
            })
        });
        const data = await response.json();
        if (data.ResponseCode === "0") {
            if (data.ResultCode === "0") return { status: 'COMPLETED', message: "Payment Verified Successfully" };
            return { status: 'FAILED', message: data.ResultDesc };
        }
        return { status: 'PENDING', message: data.errorMessage || "User has not entered PIN yet" };
    } catch (e) { return { status: 'UNKNOWN', message: e.message }; }
}

// --- Express API Endpoints ---

app.get('/api/config', (req, res) => res.json(runtimeConfig));

app.post('/api/config/update', (req, res) => {
    Object.assign(runtimeConfig, req.body);
    // Restart agent promise if keys changed
    if (req.body.apiKey) agentExecutorPromise = null;
    res.json({ success: true, config: runtimeConfig });
});

app.get('/api/daraja/test-auth', async (req, res) => {
    const result = await getDarajaToken();
    if (typeof result === 'string') {
        res.json({ success: true, message: "Production Auth Successful. Credentials are valid." });
    } else {
        res.status(400).json({ success: false, ...result });
    }
});

app.post('/api/payment/initiate', async (req, res) => {
    const result = await triggerSTKPush(req.body.phoneNumber, req.body.amount);
    res.json(result);
});

app.get('/api/payment/status/:id', async (req, res) => {
    res.json(await queryDarajaStatus(req.params.id));
});

// LangChain / WhatsApp Agent
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
                description: "Trigger M-Pesa STK push for the customer.",
                schema: z.object({ phoneNumber: z.string(), amount: z.number() }),
                func: async ({ phoneNumber, amount }) => JSON.stringify(await triggerSTKPush(phoneNumber, amount))
            }),
            new DynamicStructuredTool({
                name: "verifyPayment",
                description: "Check if the customer has paid.",
                schema: z.object({ checkoutRequestId: z.string() }),
                func: async ({ checkoutRequestId }) => JSON.stringify(await queryDarajaStatus(checkoutRequestId))
            })
        ];
        const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", apiKey: runtimeConfig.apiKey, temperature: 0.1 });
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `You are Martha from Ena Coach. Help users book tickets and pay via M-Pesa. Your system is fully configured with a live M-Pesa integration.`],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);
        const agent = await createToolCallingAgent({ llm: llm.bindTools(tools), tools, prompt });
        return new AgentExecutor({ agent, tools });
    })();
    return agentExecutorPromise;
}

app.post('/webhook', async (req, res) => {
    const { type, data, instance } = req.body;
    if (type !== 'messages.upsert' || !data?.message || data?.key?.fromMe) return res.sendStatus(200);
    const text = data.message.conversation || data.message.extendedTextMessage?.text;
    if (!text) return res.sendStatus(200);
    
    (async () => {
        try {
           const executor = await getAgentExecutor();
           const result = await executor.invoke({ input: text, chat_history: [], user_name: data.pushName || 'Customer' });
           // Logic to send text back through Evolution API would go here
           console.log(`[Agent Feedback] to ${data.key.remoteJid}: ${result.output}`);
        } catch(e) { console.error("Agent processing error:", e.message); }
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
            console.log(`[M-Pesa Callback] ${CheckoutRequestID} status: ${ResultCode === 0 ? 'SUCCESS' : 'FAILED'}`);
        }
    }
    res.sendStatus(200);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Ena Coach AI active on port ${PORT}. Production M-Pesa Till: ${runtimeConfig.darajaShortcode} (Live Mode)`));
