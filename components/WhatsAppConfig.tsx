import React, { useState, useEffect } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

const WhatsAppConfig: React.FC = () => {
  const { whatsappConfig, saveWhatsAppConfig } = useMockBackend();

  // Config State
  const [apiUrl, setApiUrl] = useState(whatsappConfig.apiUrl);
  const [apiToken, setApiToken] = useState(whatsappConfig.apiToken);
  const [instanceName, setInstanceName] = useState(whatsappConfig.instanceName);
  const [geminiKey, setGeminiKey] = useState('');
  
  // Deployment State
  const [serverDomain, setServerDomain] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  // Simulator State
  const [simPhone, setSimPhone] = useState('254712345678');
  const [simMessage, setSimMessage] = useState('Hi, do you have a bus to Kisumu?');
  const [simLoading, setSimLoading] = useState(false);
  const [debugMessages, setDebugMessages] = useState<any[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  useEffect(() => {
      if (typeof window !== 'undefined') setServerDomain(window.location.origin);
      
      // Load current server config
      fetch('/api/config')
          .then(res => res.json())
          .then(data => {
              if (data.apiKey) setGeminiKey(data.apiKey);
              if (data.evolutionUrl) setApiUrl(data.evolutionUrl);
              if (data.evolutionToken) setApiToken(data.evolutionToken);
              if (data.instanceName) setInstanceName(data.instanceName);
          });

      const interval = setInterval(() => {
          fetch('/api/debug/messages').then(res => res.json()).then(setDebugMessages).catch(() => {});
          fetch('/api/debug/webhook-logs').then(res => res.json()).then(setWebhookLogs).catch(() => {});
      }, 2000);
      return () => clearInterval(interval);
  }, []);

  const handleSaveAndSync = async () => {
    try {
        const res = await fetch('/api/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiUrl, apiToken, instanceName, apiKey: geminiKey })
        });
        if (res.ok) {
            saveWhatsAppConfig({ apiUrl, apiToken, instanceName });
            addLog('✅ Server configuration updated successfully.');
        } else {
            addLog('❌ Server update failed.');
        }
    } catch (e) { addLog(`Error: ${e}`); }
  };

  const handleSimulateWebhook = async () => {
      if (!simMessage) return;
      setSimLoading(true);

      // Auto-Sync credentials before simulation to ensure success
      await handleSaveAndSync();
      addLog(`[Simulator] Syncing Token (Len: ${apiToken.length})...`);

      const payload = {
          type: "messages.upsert",
          data: {
              key: { remoteJid: `${simPhone}@s.whatsapp.net`, fromMe: false, id: "SIM-" + Date.now() },
              pushName: "Test User",
              message: { conversation: simMessage }
          }
      };

      try {
          const res = await fetch('/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (res.ok) {
              addLog(`Sent simulated message: "${simMessage}"`);
              setSimMessage('');
          }
      } catch (e) { addLog(`Simulator Error: ${e}`); }
      finally { setSimLoading(false); }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('unknown');
    addLog(`Testing instance: ${instanceName}...`);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/instance/connectionState/${instanceName}`, {
        headers: { 'apikey': apiToken }
      });
      if (response.ok) {
          const data = await response.json();
          if (data?.instance?.state === 'open' || data?.state === 'open') setConnectionStatus('connected');
          else setConnectionStatus('error');
      } else setConnectionStatus('error');
    } catch (error) { setConnectionStatus('error'); }
    finally { setIsTestingConnection(false); }
  };

  return (
    <div className="space-y-8">
      {/* 1. Traffic Monitor */}
      <div className="bg-gray-900 text-green-400 p-6 rounded-lg shadow-sm border border-gray-700">
         <h2 className="text-xl font-bold mb-4 flex items-center">
             <i className="fas fa-terminal mr-2"></i> Live Webhook Monitor
         </h2>
         <div className="h-48 overflow-y-auto font-mono text-xs space-y-1">
             {webhookLogs.length === 0 ? <p className="text-gray-600">Waiting for data...</p> : webhookLogs.map((log, i) => (
                 <div key={i} className="border-b border-gray-800 pb-1">
                     <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.sender}: {log.content}
                 </div>
             ))}
         </div>
      </div>

      {/* 2. Webhook Simulator */}
      <div className="bg-purple-50 p-6 rounded-lg border border-purple-200 shadow-sm">
         <h2 className="text-xl font-bold text-purple-800 mb-4 flex items-center">
             <i className="fas fa-robot mr-2"></i> Local Webhook Simulator
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-3">
                 <input type="text" value={simPhone} onChange={e => setSimPhone(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="Phone Number" />
                 <textarea value={simMessage} onChange={e => setSimMessage(e.target.value)} className="w-full border p-2 rounded text-sm h-24" placeholder="Type a test message..."></textarea>
                 <button onClick={handleSimulateWebhook} disabled={simLoading} className="w-full py-2 bg-purple-600 text-white font-bold rounded hover:bg-purple-700">
                    {simLoading ? 'Processing...' : 'Send to Webhook'}
                 </button>
             </div>
             <div className="bg-black rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
                 <p className="text-gray-500 mb-2">// Agent Response History</p>
                 {debugMessages.map((msg, i) => (
                     <div key={i} className={`mb-3 p-2 rounded ${msg.status?.includes('FAILED') ? 'bg-red-900/30' : 'bg-green-900/30'}`}>
                         <p className="text-gray-400">To: {msg.to}</p>
                         <p className="text-white mt-1">{msg.text}</p>
                         <p className={`text-[10px] mt-1 font-bold ${msg.status === 'sent' ? 'text-green-400' : 'text-red-400'}`}>STATUS: {msg.status.toUpperCase()}</p>
                     </div>
                 ))}
             </div>
         </div>
      </div>

      {/* 3. Global Config */}
      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center justify-between">
          <span><i className="fas fa-cog mr-2"></i> System Configuration</span>
          <span className={`text-xs px-2 py-1 rounded ${connectionStatus === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {connectionStatus === 'connected' ? 'API ONLINE' : 'API OFFLINE'}
          </span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Google Gemini API Key</label>
            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full border p-2 rounded" placeholder="sk-..." />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Evolution API Base URL</label>
            <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Instance Name</label>
            <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Evolution API Token</label>
            <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full border p-2 rounded" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSaveAndSync} className="px-6 py-2 bg-gray-800 text-white font-bold rounded hover:bg-gray-900">Save & Sync to Server</button>
          <button onClick={handleTestConnection} className="px-6 py-2 border font-bold rounded hover:bg-gray-50">Test WhatsApp Connection</button>
        </div>
      </div>

      {/* Console Logs */}
      <div className="bg-gray-800 p-4 rounded-lg font-mono text-xs text-blue-300">
        <p className="text-gray-500 mb-2">// System Logs</p>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </div>
  );
};

export default WhatsAppConfig;