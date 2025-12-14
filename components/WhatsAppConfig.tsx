import React, { useState, useEffect } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

const WhatsAppConfig: React.FC = () => {
  const { whatsappConfig, saveWhatsAppConfig } = useMockBackend();

  // Config State
  const [apiUrl, setApiUrl] = useState(whatsappConfig.apiUrl);
  const [apiKey, setApiKey] = useState(whatsappConfig.apiToken);
  const [instanceName, setInstanceName] = useState(whatsappConfig.instanceName);
  
  // Deployment State
  const [serverDomain, setServerDomain] = useState('');
  
  // Test State
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from Ena Coach Admin!');
  const [logs, setLogs] = useState<string[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  // Simulator State
  const [simPhone, setSimPhone] = useState('254712345678');
  const [simMessage, setSimMessage] = useState('Hi, do you have a bus to Kisumu?');
  const [simLoading, setSimLoading] = useState(false);
  const [debugMessages, setDebugMessages] = useState<any[]>([]);
  
  // Webhook Monitor State
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  useEffect(() => {
      // Auto-detect current domain for convenience
      if (typeof window !== 'undefined') {
          setServerDomain(window.location.origin);
      }

      // Poll for debug messages and webhook logs
      const interval = setInterval(() => {
          fetchDebugMessages();
          fetchWebhookLogs();
      }, 2000);
      return () => clearInterval(interval);
  }, []);

  const fetchDebugMessages = async () => {
      try {
          const res = await fetch('/api/debug/messages');
          if (res.ok) {
              const data = await res.json();
              setDebugMessages(data);
          }
      } catch (e) { /* Ignore errors in polling */ }
  };

  const fetchWebhookLogs = async () => {
      try {
          const res = await fetch('/api/debug/webhook-logs');
          if (res.ok) setWebhookLogs(await res.json());
      } catch (e) { }
  };

  const handleClearDebug = async () => {
      await fetch('/api/debug/clear', { method: 'POST' });
      setDebugMessages([]);
  };

  const handleClearWebhookLogs = async () => {
      await fetch('/api/debug/clear-webhook', { method: 'POST' });
      setWebhookLogs([]);
  };

  const handleSave = async () => {
    saveWhatsAppConfig({ apiUrl, apiToken: apiKey, instanceName });
    
    // Push to server runtime config
    try {
        const res = await fetch('/api/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiUrl, apiToken: apiKey, instanceName })
        });
        if (res.ok) {
            addLog('Configuration saved and pushed to server runtime!');
        } else {
            addLog('Configuration saved locally, but server update failed.');
        }
    } catch (e) {
        addLog(`Error pushing config to server: ${e}`);
    }
  };

  const handleSimulateWebhook = async () => {
      if (!simMessage) return;
      setSimLoading(true);
      
      // Construct exact Evolution API payload
      const payload = {
          type: "messages.upsert",
          data: {
              key: {
                  remoteJid: simPhone.includes('@s.whatsapp.net') ? simPhone : `${simPhone}@s.whatsapp.net`,
                  fromMe: false,
                  id: "SIM-" + Date.now()
              },
              pushName: "Simulated User",
              message: {
                  conversation: simMessage
              },
              messageType: "conversation"
          }
      };

      try {
          const res = await fetch('/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          
          if (res.ok) {
              addLog(`Webhook Simulator: Sent "${simMessage}"`);
              setSimMessage(''); // Clear input
              // Immediately fetch response to see if it was fast
              setTimeout(fetchDebugMessages, 1000); 
              setTimeout(fetchDebugMessages, 3000); 
          } else {
              addLog('Webhook Simulator: Failed to send payload.');
          }
      } catch (e) {
          addLog(`Webhook Simulator Error: ${e}`);
      } finally {
          setSimLoading(false);
      }
  };

  const handlePublicWebhookTest = async () => {
    if (!serverDomain) {
        addLog("Error: Server URL not detected or set.");
        return;
    }
    const target = `${serverDomain.replace(/\/$/, '')}/webhook`;
    addLog(`Self-Testing Webhook at: ${target}...`);
    addLog(`Sending a real HTTP POST request to check reachability...`);
    
    try {
        const res = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'messages.upsert',
                data: {
                    key: { remoteJid: 'SELF_TEST@s.whatsapp.net', fromMe: false, id: `TEST-${Date.now()}` },
                    pushName: 'Connectivity Test',
                    message: { conversation: 'This is a public connectivity test.' },
                    messageType: 'conversation'
                }
            })
        });
        
        if (res.ok) {
            addLog("SUCCESS: Webhook endpoint is reachable (HTTP 200).");
            addLog("ACTION: Check the 'Live Webhook Monitor' above. This request should appear there now.");
        } else {
            addLog(`FAILED: Webhook endpoint returned status ${res.status}.`);
        }
    } catch (e) {
        addLog(`FAILED: Network error reaching your own webhook. ${e}`);
        addLog("Note: If you are on localhost, this is normal cross-origin behavior. If deployed, check your server logs.");
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('unknown');
    addLog(`Checking connection for instance: ${instanceName}...`);

    try {
      // Clean URL
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const url = `${cleanUrl}/instance/connectionState/${instanceName}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        addLog(`Response: ${JSON.stringify(data)}`);
        // Adjust check based on actual Evolution API response structure
        if (data?.instance?.state === 'open' || data?.state === 'open') {
          setConnectionStatus('connected');
          addLog('SUCCESS: Instance is connected!');
        } else {
          setConnectionStatus('error');
          addLog('WARNING: Instance found but state is not "open".');
        }
      } else {
        setConnectionStatus('error');
        addLog(`ERROR: HTTP ${response.status} - ${response.statusText}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      addLog(`ERROR: Network request failed. Check CORS or URL. ${error}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testPhone || !testMessage) {
      addLog('Error: Phone number and message required.');
      return;
    }
    
    setIsSending(true);
    addLog(`Sending message to ${testPhone}...`);

    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const url = `${cleanUrl}/message/sendText/${instanceName}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: testPhone,
          text: testMessage
        })
      });

      if (response.ok) {
        const data = await response.json();
        addLog(`SENT: Message ID: ${data?.key?.id || 'Unknown'}`);
      } else {
        const errText = await response.text();
        addLog(`FAILED: ${response.status} - ${errText}`);
        
        if (errText.includes('exists":false')) {
            addLog("⚠️ ANALYSIS: The phone number provided is NOT registered on WhatsApp.");
            addLog("Please check the country code (e.g., 254...) and ensure the number has an active WhatsApp account.");
        }
      }
    } catch (error) {
      addLog(`ERROR: ${error}`);
    } finally {
      setIsSending(false);
    }
  };

  // Construct the webhook URL based on user input
  const webhookUrl = serverDomain 
    ? `${serverDomain.replace(/\/$/, '')}/webhook` 
    : 'Waiting for server domain...';

  return (
    <div className="space-y-8">
      
      {/* 4. Live Webhook Traffic (Moved to Top for Visibility) */}
      <div className="bg-blue-50 p-6 rounded-lg shadow-sm border border-blue-200">
         <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-bold text-blue-800 flex items-center">
                 <i className="fas fa-network-wired text-blue-600 mr-2"></i> Live Webhook Monitor
                 <span className="ml-3 flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></span>
                    <span className="text-xs font-normal text-blue-600">Listening...</span>
                 </span>
             </h2>
             <button onClick={handleClearWebhookLogs} className="text-xs text-blue-600 hover:text-blue-800 font-bold bg-white px-3 py-1 rounded shadow-sm">
                 Clear Traffic
             </button>
         </div>
         <p className="text-sm text-blue-900 mb-4">
             Real-time log of incoming requests to <code>/webhook</code>. Use this to verify Evolution API is successfully reaching your app.
         </p>
         
         <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-64 overflow-y-auto shadow-inner">
             {webhookLogs.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-gray-500">
                     <i className="fas fa-wifi text-2xl mb-2 opacity-20"></i>
                     <p>Waiting for incoming data...</p>
                 </div>
             ) : (
                 <div className="space-y-4">
                     {webhookLogs.map((log, idx) => (
                         <div key={idx} className="border-l-2 border-blue-500 pl-3">
                             <div className="flex justify-between text-gray-400 mb-1">
                                 <span className="font-bold text-blue-300">HTTP {log.method} <span className="text-gray-500 text-[10px] ml-1">({log.path || '/webhook'})</span></span>
                                 <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                             </div>
                             <div className="mb-1">
                                 <span className="text-gray-500 uppercase mr-2">Type:</span> 
                                 <span className="text-yellow-300">{log.type}</span>
                             </div>
                             <div className="mb-1">
                                 <span className="text-gray-500 uppercase mr-2">Sender:</span> 
                                 <span className="text-white">{log.sender}</span>
                             </div>
                             <details className="cursor-pointer">
                                 <summary className="text-gray-500 hover:text-white">View Payload</summary>
                                 <pre className="mt-2 text-[10px] text-gray-300 whitespace-pre-wrap bg-gray-800 p-2 rounded">
                                     {JSON.stringify(log.raw, null, 2)}
                                 </pre>
                             </details>
                         </div>
                     ))}
                 </div>
             )}
         </div>
      </div>

      {/* WEBHOOK SIMULATOR */}
      <div className="bg-purple-50 p-6 rounded-lg shadow-sm border border-purple-200">
         <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-purple-800 flex items-center">
                <i className="fas fa-robot text-purple-600 mr-2"></i> Local Webhook Simulator
            </h2>
            <button onClick={handleClearDebug} className="text-xs text-purple-600 hover:text-purple-800 font-bold">Clear Logs</button>
         </div>
         <p className="text-sm text-purple-900 mb-4">
            Test the agent's logic locally. Sending a message here mimics an incoming WhatsApp message to your server's <code>/webhook</code> endpoint.
         </p>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-3">
                 <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Simulated Customer Phone</label>
                     <input 
                        type="text" 
                        value={simPhone} 
                        onChange={(e) => setSimPhone(e.target.value)}
                        className="w-full border p-2 rounded text-sm outline-none focus:border-purple-500"
                     />
                 </div>
                 <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message Body</label>
                     <textarea 
                        value={simMessage} 
                        onChange={(e) => setSimMessage(e.target.value)}
                        className="w-full border p-2 rounded text-sm outline-none focus:border-purple-500 h-20 resize-none"
                     ></textarea>
                 </div>
                 <button 
                    onClick={handleSimulateWebhook}
                    disabled={simLoading || !simMessage}
                    className={`w-full py-2 rounded text-white font-bold transition ${
                        simLoading ? 'bg-purple-300' : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                 >
                    {simLoading ? 'Processing...' : 'Send Payload to /webhook'}
                 </button>
             </div>

             <div className="bg-gray-900 rounded-lg p-3 flex flex-col h-64">
                 <div className="text-xs text-gray-400 border-b border-gray-700 pb-2 mb-2">Agent Responses (Server Output)</div>
                 <div className="flex-1 overflow-y-auto space-y-2">
                     {debugMessages.length === 0 ? (
                         <div className="text-gray-600 text-xs italic text-center mt-10">No messages yet. Try sending one!</div>
                     ) : (
                         debugMessages.map((msg: any, idx) => (
                             <div key={idx} className={`bg-gray-800 p-2 rounded border-l-2 ${msg.status?.includes('failed') ? 'border-red-500' : 'border-green-500'}`}>
                                 <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                     <span>To: {msg.to}</span>
                                     <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                 </div>
                                 <div className="text-sm text-white whitespace-pre-wrap">{msg.text}</div>
                                 {msg.status && (
                                     <div className={`text-[10px] mt-1 font-bold ${msg.status === 'sent' ? 'text-green-500' : 'text-red-400'}`}>
                                         STATUS: {msg.status.toUpperCase()} 
                                         {msg.error && <span className="block font-normal text-gray-400">{msg.error}</span>}
                                     </div>
                                 )}
                             </div>
                         ))
                     )}
                 </div>
             </div>
         </div>
      </div>
      
      {/* 2. Configuration Card */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center justify-between">
          <span className="flex items-center"><i className="fab fa-whatsapp text-green-500 mr-2"></i> 2. Evolution API Connection</span>
          <span className={`text-xs px-2 py-1 rounded border uppercase ${
            connectionStatus === 'connected' ? 'bg-green-100 text-green-700 border-green-200' : 
            connectionStatus === 'error' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-500'
          }`}>
            {connectionStatus === 'connected' ? 'Online' : connectionStatus === 'error' ? 'Offline' : 'Unknown'}
          </span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">API Base URL</label>
            <input 
              type="text" 
              value={apiUrl} 
              onChange={(e) => setApiUrl(e.target.value)}
              className="w-full border p-2 rounded text-sm focus:border-green-500 outline-none"
              placeholder="https://api.evolution-api.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Instance Name</label>
            <input 
              type="text" 
              value={instanceName} 
              onChange={(e) => setInstanceName(e.target.value)}
              className="w-full border p-2 rounded text-sm focus:border-green-500 outline-none"
              placeholder="EnaCoach"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Global API Token</label>
            <input 
              type="password" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full border p-2 rounded text-sm focus:border-green-500 outline-none"
              placeholder="sk-..."
            />
          </div>
        </div>

        <div className="mt-6 flex space-x-3">
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-gray-800 text-white rounded text-sm font-medium hover:bg-gray-900 transition"
          >
            <i className="fas fa-save mr-2"></i> Save & Sync to Server
          </button>
          <button 
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className={`px-4 py-2 border rounded text-sm font-medium transition flex items-center ${
              isTestingConnection ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
            }`}
          >
            {isTestingConnection ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-plug mr-2"></i>}
            Test Connection
          </button>
        </div>
      </div>

      {/* 1. Webhook Setup (Priority 1) */}
      <div className="bg-yellow-50 p-6 rounded-lg shadow-sm border border-yellow-200">
        <h2 className="text-xl font-bold text-yellow-800 mb-4 flex items-center">
            <i className="fas fa-satellite-dish text-yellow-600 mr-2"></i> 1. Server Deployment & Webhook
        </h2>
        
        <p className="text-sm text-yellow-900 mb-4">
            Evolution API needs to know where to send incoming WhatsApp messages.
        </p>

        <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4 text-xs">
           <p className="font-bold">⚠️ Important Note for Development:</p>
           <p>If you are running this in a private development environment (like CodeSandbox, StackBlitz, or Localhost), external services like Evolution API <strong>cannot reach</strong> the URL below.</p>
           <p className="mt-1">Use the <strong>Simulator</strong> above to test logic. To use real WhatsApp, please deploy to a public server (Railway, Heroku, etc).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                 <h3 className="font-bold text-sm text-yellow-800 mb-2">Step A: Deployed Server URL</h3>
                 <div className="bg-white p-3 rounded border border-yellow-300">
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Environment URL</label>
                     <input 
                        type="text" 
                        value={serverDomain} 
                        readOnly
                        className="w-full border p-2 rounded text-sm bg-gray-100 text-gray-600 font-mono"
                     />
                 </div>
                 
                 <div className="mt-2">
                     <button 
                         onClick={handlePublicWebhookTest}
                         className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded shadow transition flex items-center justify-center"
                     >
                         <i className="fas fa-globe mr-2"></i> Verify Public Access
                     </button>
                     <p className="text-[10px] text-gray-500 mt-1 text-center">
                         Sends a test POST to {webhookUrl} from your browser.
                     </p>
                 </div>

                 <h3 className="font-bold text-sm text-yellow-800 mt-4 mb-2">Required Server Env Vars</h3>
                 <div className="bg-gray-800 p-3 rounded text-xs text-green-400 font-mono overflow-x-auto">
                    GEMINI_API_KEY=...<br/>
                    EVOLUTION_API_URL=...<br/>
                    EVOLUTION_API_TOKEN=...<br/>
                    INSTANCE_NAME=...<br/>
                    SUPABASE_URL=...<br/>
                    SUPABASE_KEY=...<br/>
                    <br/>
                    <span className="text-yellow-400"># Daraja (M-Pesa) Config</span><br/>
                    DARAJA_CONSUMER_KEY=...<br/>
                    DARAJA_CONSUMER_SECRET=...<br/>
                    DARAJA_PASSKEY=...<br/>
                    DARAJA_SHORTCODE=174379
                 </div>
            </div>

            <div>
                 <h3 className="font-bold text-sm text-yellow-800 mb-2">Step B: Copy to Evolution API</h3>
                 <p className="text-xs text-yellow-800 mb-2">
                     Paste this exact URL into your Evolution API Instance settings.
                 </p>
                 <div className="bg-white p-3 rounded border border-yellow-300">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Final Webhook URL</label>
                    <div className="flex">
                        <input 
                            type="text" 
                            readOnly 
                            value={webhookUrl}
                            className="w-full border p-2 rounded-l text-sm bg-gray-100 text-gray-800 font-bold font-mono"
                        />
                        <button 
                            onClick={() => navigator.clipboard.writeText(webhookUrl)}
                            className="bg-yellow-600 text-white px-4 py-2 rounded-r text-sm hover:bg-yellow-700 font-bold"
                            title="Copy to Clipboard"
                        >
                            COPY
                        </button>
                    </div>
                 </div>
                 <p className="text-[10px] text-yellow-800 mt-2">
                    <i className="fas fa-exclamation-triangle mr-1"></i> 
                    Ensure <strong>MESSAGES_UPSERT</strong> event is enabled in Evolution API.
                 </p>
            </div>
        </div>
      </div>

      {/* 3. Real Test Console */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i className="fas fa-paper-plane text-blue-500 mr-2"></i> 3. Send Test Message (Real)
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Destination Phone</label>
              <input 
                type="text" 
                value={testPhone} 
                onChange={(e) => setTestPhone(e.target.value)}
                className="w-full border p-2 rounded text-sm"
                placeholder="254712345678"
              />
              <p className="text-xs text-gray-400 mt-1">Include country code, no + symbol.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Message</label>
              <textarea 
                value={testMessage} 
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full border p-2 rounded text-sm h-24 resize-none"
              ></textarea>
            </div>
            <button 
              onClick={handleSendTestMessage}
              disabled={isSending || connectionStatus !== 'connected'}
              className={`w-full py-2 rounded text-white font-bold transition ${
                isSending || connectionStatus !== 'connected' ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isSending ? 'Sending...' : 'Send WhatsApp Message'}
            </button>
             {connectionStatus !== 'connected' && (
                <p className="text-xs text-red-500 mt-2 text-center">Connect to API first.</p>
             )}
          </div>
        </div>

        {/* Console Logs */}
        <div className="flex-1 flex flex-col bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 h-96 shadow-inner">
          <div className="uppercase text-gray-500 mb-2 border-b border-gray-700 pb-1 flex justify-between">
            <span>Connection Log</span>
            <span 
              className="text-gray-400 cursor-pointer hover:text-white" 
              onClick={() => setLogs([])}
            >
              Clear
            </span>
          </div>
          <div className="overflow-y-auto flex-1 space-y-1">
            {logs.length === 0 ? <span className="text-gray-600 italic">// Logs will appear here...</span> : logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;