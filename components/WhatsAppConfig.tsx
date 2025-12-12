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

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const handleSave = () => {
    saveWhatsAppConfig({ apiUrl, apiToken: apiKey, instanceName });
    addLog('Configuration saved.');
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
    : 'https://[YOUR_SERVER_DOMAIN]/webhook';

  return (
    <div className="space-y-8">
      
      {/* 1. Webhook Setup (Priority 1) */}
      <div className="bg-yellow-50 p-6 rounded-lg shadow-sm border border-yellow-200">
        <h2 className="text-xl font-bold text-yellow-800 mb-4 flex items-center">
            <i className="fas fa-satellite-dish text-yellow-600 mr-2"></i> 1. Server Deployment & Webhook
        </h2>
        
        <p className="text-sm text-yellow-900 mb-4">
            Evolution API needs to know where to send incoming WhatsApp messages.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                 <h3 className="font-bold text-sm text-yellow-800 mb-2">Step A: Deploy Server</h3>
                 <div className="bg-white p-3 rounded border border-yellow-300">
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Enter Deployed Server Domain</label>
                     <input 
                        type="text" 
                        value={serverDomain} 
                        onChange={(e) => setServerDomain(e.target.value)}
                        className="w-full border p-2 rounded text-sm focus:border-yellow-500 outline-none font-mono"
                        placeholder="e.g. https://ena-bot.onrender.com"
                     />
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
            <i className="fas fa-save mr-2"></i> Save Config
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

      {/* 3. Real Test Console */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i className="fas fa-paper-plane text-blue-500 mr-2"></i> 3. Send Test Message
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
