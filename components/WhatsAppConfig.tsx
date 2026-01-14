
import React, { useState, useEffect } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

const WhatsAppConfig: React.FC = () => {
  const { whatsappConfig } = useMockBackend();

  // Settings
  const [apiUrl, setApiUrl] = useState(whatsappConfig.apiUrl);
  const [apiToken, setApiToken] = useState(whatsappConfig.apiToken);
  const [instanceName, setInstanceName] = useState(whatsappConfig.instanceName);
  const [geminiKey, setGeminiKey] = useState('');
  
  // Daraja
  const [darajaEnv, setDarajaEnv] = useState<'sandbox' | 'production'>('production');
  const [darajaKey, setDarajaKey] = useState('');
  const [darajaSecret, setDarajaSecret] = useState('');
  const [darajaPasskey, setDarajaPasskey] = useState('');
  const [darajaShortcode, setDarajaShortcode] = useState('5512238');

  // Logs
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);
  const [rawPayloads, setRawPayloads] = useState<any[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const fetchData = async () => {
      try {
          const [l, r] = await Promise.all([fetch('/api/debug/system-logs'), fetch('/api/debug/raw-payloads')]);
          if (l.ok) setTerminalLogs(await l.json());
          if (r.ok) setRawPayloads(await r.json());
      } catch (e) {}
  };

  useEffect(() => {
      const origin = `${window.location.protocol}//${window.location.host}`;
      setWebhookUrl(`${origin}/webhook`);
      
      fetch('/api/config').then(res => res.json()).then(data => {
          if (!data) return;
          setGeminiKey(data.apiKey || '');
          setApiUrl(data.evolutionUrl || '');
          setApiToken(data.evolutionToken || '');
          setInstanceName(data.instanceName || '');
          setDarajaKey(data.darajaKey || '');
          setDarajaSecret(data.darajaSecret || '');
          setDarajaPasskey(data.darajaPasskey || '');
          setDarajaShortcode(data.darajaShortcode || '5512238');
      });
      
      const poll = setInterval(fetchData, 2000); 
      return () => clearInterval(poll);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
        await fetch('/api/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                evolutionUrl: apiUrl, evolutionToken: apiToken, instanceName, 
                apiKey: geminiKey, darajaKey, darajaSecret, darajaPasskey, darajaShortcode
            })
        });
        alert("Config Synced!");
    } catch (e) { alert("Failed."); }
    setIsSaving(false);
  };

  const generateCurl = () => {
      return `curl -X POST ${webhookUrl} \\
-H "Content-Type: application/json" \\
-d '{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "254700000000@s.whatsapp.net", "fromMe": false },
    "message": { "conversation": "Hello Martha" }
  }
}'`;
  };

  const copy = (t: string) => {
      navigator.clipboard.writeText(t);
      alert("Copied!");
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      
      {/* Target URLs */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8 grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-red-600">Webhook Destination</h2>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center gap-4">
                  <code className="text-xs font-mono flex-1 break-all">{webhookUrl}</code>
                  <button onClick={() => copy(webhookUrl)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase">Copy</button>
              </div>
              <p className="text-[10px] text-gray-400 italic">Configure this URL in your Evolution API Dashboard.</p>
          </div>
          <div className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-800">Connection Diagnostic</h2>
              <div className="bg-gray-900 p-4 rounded-xl text-green-400 font-mono text-[10px] relative">
                  <pre className="overflow-x-auto">{generateCurl()}</pre>
                  <button onClick={() => copy(generateCurl())} className="absolute top-2 right-2 text-white/50 hover:text-white"><i className="fas fa-copy"></i></button>
              </div>
          </div>
      </div>

      {/* Real-time Logs */}
      <div className="bg-[#0b0b0e] rounded-[2rem] p-8 h-[450px] flex flex-col border border-gray-800 shadow-2xl overflow-hidden font-mono">
          <div className="flex justify-between items-center mb-6">
            <p className="text-gray-500 text-[10px] uppercase tracking-widest font-black">Signals & Activity</p>
            <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-red-500 hover:underline">{showRaw ? 'Hide Raw' : 'View Raw Signals'}</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
              {showRaw ? (
                  rawPayloads.map((p, i) => (
                      <pre key={i} className="bg-gray-900 p-3 rounded-lg text-green-500 text-[9px] border border-gray-800">
                          {JSON.stringify(p.data, null, 2)}
                      </pre>
                  ))
              ) : (
                  terminalLogs.map((log, i) => (
                      <div key={i} className={`p-2 rounded-lg border text-[11px] ${log.type === 'error' ? 'bg-red-950/20 border-red-900 text-red-400' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
                          <span className="opacity-40 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          {log.msg}
                      </div>
                  ))
              )}
          </div>
      </div>

      {/* Settings Grid */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-950 p-8 text-white flex justify-between items-center">
              <h2 className="font-black uppercase tracking-widest">Core Integrations</h2>
              <button onClick={handleSave} disabled={isSaving} className="bg-red-600 px-6 py-3 rounded-xl font-black text-xs uppercase shadow-xl active:scale-95 transition">
                  {isSaving ? 'Saving...' : 'Sync & Restart'}
              </button>
          </div>
          <div className="p-8 grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b pb-2">WhatsApp (Evolution)</h3>
                  <input placeholder="API URL" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none focus:border-red-600" />
                  <input placeholder="Instance Name" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none focus:border-red-600" />
                  <input type="password" placeholder="API Token" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
              </div>
              <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b pb-2">Payments (Daraja)</h3>
                  <input placeholder="Consumer Key" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                  <input type="password" placeholder="Consumer Secret" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                  <div className="grid grid-cols-2 gap-4">
                    <input placeholder="Shortcode" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                    <input placeholder="Passkey" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                  </div>
              </div>
              <div className="md:col-span-2">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b pb-2 mb-4">AI Engine</h3>
                  <input type="password" placeholder="Gemini API Key" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none focus:border-red-600" />
              </div>
          </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
