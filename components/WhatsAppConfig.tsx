
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
  const [lastTraffic, setLastTraffic] = useState<Date | null>(null);

  const fetchData = async () => {
      try {
          const [l, r] = await Promise.all([
              fetch('/api/debug/system-logs'), 
              fetch('/api/debug/raw-payloads')
          ]);
          if (l.ok) {
              const logs = await l.json();
              setTerminalLogs(logs);
              // Update heartbeat if new logs appear
              if (logs.length > 0) {
                  const latest = new Date(logs[0].timestamp);
                  setLastTraffic(latest);
              }
          }
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
        alert("Configuration Synchronized!");
    } catch (e) { alert("Sync failed."); }
    setIsSaving(false);
  };

  const runInternalTest = async () => {
      try {
          const res = await fetch('/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  event: "messages.upsert",
                  data: {
                      key: { remoteJid: "254123456789@s.whatsapp.net", fromMe: false },
                      message: { conversation: "Diagnostic Test from UI" }
                  }
              })
          });
          if (res.ok) alert("Internal Diagnostic Sent! Monitor the logs below.");
          else alert("Diagnostic failed: " + res.status);
      } catch (e) { alert("Network Error during diagnostic."); }
  };

  const copy = (t: string) => {
      navigator.clipboard.writeText(t);
      alert("Copied!");
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      
      {/* Webhook Connection Panel */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                          <i className="fas fa-link"></i>
                      </div>
                      <h2 className="text-xl font-black text-gray-900">Webhook Connection</h2>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">
                      Copy the URL below and paste it into your <strong>Evolution API Dashboard</strong>.
                  </p>
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 flex items-center gap-4">
                      <code className="text-xs font-mono text-gray-600 flex-1 break-all select-all">{webhookUrl}</code>
                      <button onClick={() => copy(webhookUrl)} className="bg-red-600 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-red-700 transition">Copy</button>
                  </div>
                  <div className="flex gap-4">
                      <a href={webhookUrl} target="_blank" className="text-[10px] font-black uppercase text-gray-400 hover:text-red-600 flex items-center gap-2">
                          <i className="fas fa-external-link-alt"></i> Verify Public URL
                      </a>
                      <button onClick={runInternalTest} className="text-[10px] font-black uppercase text-red-600 hover:underline flex items-center gap-2">
                          <i className="fas fa-vial"></i> Test Internal POST
                      </button>
                  </div>
              </div>

              <div className="bg-gray-950 rounded-[2rem] p-8 text-white relative group overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 blur-3xl rounded-full"></div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-red-500 mb-6">Status Heartbeat</h3>
                  <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${lastTraffic ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-gray-700'}`}></div>
                      <div>
                          <p className="text-sm font-bold">{lastTraffic ? 'Traffic Detected' : 'No Traffic Seen'}</p>
                          <p className="text-[10px] text-gray-500 uppercase font-black">
                              {lastTraffic ? `Last Activity: ${lastTraffic.toLocaleTimeString()}` : 'Waiting for Evolution API signal...'}
                          </p>
                      </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-white/5">
                      <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest">Server Binding: 0.0.0.0 (Global)</p>
                  </div>
              </div>
          </div>
      </div>

      {/* Activity Monitor */}
      <div className="bg-[#0b0b0e] rounded-[2rem] border border-gray-800 shadow-2xl overflow-hidden flex flex-col h-[500px]">
          <div className="bg-gray-900/50 p-6 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Live Engine Logs</h3>
              </div>
              <button 
                  onClick={() => setShowRaw(!showRaw)} 
                  className={`text-[10px] font-black uppercase px-4 py-2 rounded-lg transition ${showRaw ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                  {showRaw ? 'Hide Payload' : 'Show Payload'}
              </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-3 font-mono scrollbar-hide">
              {showRaw ? (
                  rawPayloads.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-700 text-xs uppercase font-black">Waiting for raw signals...</div>
                  ) : (
                    rawPayloads.map((p, i) => (
                        <div key={i} className="bg-gray-900 p-4 rounded-xl border border-gray-800 mb-4 animate-fade-in">
                            <div className="text-[9px] text-gray-500 mb-2 border-b border-gray-800 pb-1">{new Date(p.timestamp).toLocaleString()}</div>
                            <pre className="text-green-500 text-[10px] overflow-x-auto">{JSON.stringify(p.data, null, 2)}</pre>
                        </div>
                    ))
                  )
              ) : (
                  terminalLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-700 text-xs uppercase tracking-widest font-black">No system activity logged</div>
                  ) : (
                    terminalLogs.map((log, i) => (
                        <div key={i} className={`p-4 rounded-xl border flex gap-4 items-start animate-fade-in ${log.type === 'error' ? 'bg-red-950/20 border-red-900/50' : log.type === 'success' ? 'bg-green-950/10 border-green-900/30' : 'bg-gray-900/50 border-gray-800'}`}>
                            <div className="text-[9px] text-gray-500 font-bold whitespace-nowrap pt-0.5">{new Date(log.timestamp).toLocaleTimeString()}</div>
                            <div className={`text-[11px] font-medium ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}`}>
                                {log.msg}
                            </div>
                        </div>
                    ))
                  )
              )}
          </div>
      </div>

      {/* Settings Grid */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-900 p-8 text-white flex justify-between items-center">
              <div>
                  <h2 className="font-black uppercase tracking-widest">Engine Config</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Managed AI & Payment Parameters</p>
              </div>
              <button onClick={handleSave} disabled={isSaving} className="bg-red-600 px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-red-700 active:scale-95 transition flex items-center gap-3">
                  {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync"></i>}
                  {isSaving ? 'Syncing...' : 'Update Config'}
              </button>
          </div>
          <div className="p-8 grid md:grid-cols-2 gap-10">
              <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest border-b border-red-50 pb-2">WhatsApp Connection</h3>
                  <div className="space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase">Evolution URL</label>
                      <input placeholder="https://..." value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none focus:border-red-600 transition" />
                  </div>
                  <div className="space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase">Instance Name</label>
                      <input value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none focus:border-red-600" />
                  </div>
                  <div className="space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase">API Token</label>
                      <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none focus:border-red-600" />
                  </div>
              </div>

              <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b pb-2">M-Pesa Parameters</h3>
                  <div className="space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase">Daraja Consumer Key</label>
                      <input value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                  </div>
                  <div className="space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase">Daraja Secret</label>
                      <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black text-gray-400 uppercase">Shortcode</label>
                        <input value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                    </div>
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black text-gray-400 uppercase">Passkey</label>
                        <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full bg-gray-50 border p-4 rounded-xl text-sm outline-none" />
                    </div>
                  </div>
              </div>

              <div className="md:col-span-2 pt-6">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b pb-2 mb-6">AI Brain</h3>
                  <div className="space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase">Gemini API Key</label>
                      <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-gray-50 border p-5 rounded-2xl text-sm outline-none focus:border-red-600 border-2 border-transparent transition shadow-sm" />
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
