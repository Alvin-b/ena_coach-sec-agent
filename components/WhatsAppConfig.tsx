
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

  // Logs & Diagnostic
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
              if (logs.length > 0) setLastTraffic(new Date(logs[0].timestamp));
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

  const simulateIncomingMessage = async () => {
      // Sends a POST directly to the internal /webhook to verify it's processing signals
      try {
          const res = await fetch('/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  event: "messages.upsert", 
                  data: { 
                      key: { remoteJid: "254123456789@s.whatsapp.net", fromMe: false },
                      message: { conversation: "Diagnostic Ping" }
                  } 
              })
          });
          if (res.ok) alert("Internal Diagnostic Sent! If you don't see this in the logs below, the server has a routing issue.");
          else alert(`Error: ${res.status}`);
      } catch (e) { alert("Failed to connect to local webhook."); }
  };

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
        alert("Configuration Saved and Synced!");
    } catch (e) { alert("Save failed."); }
    setIsSaving(false);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      
      {/* Connectivity Status Header */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-10 grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg">
                          <i className="fas fa-network-wired text-xl"></i>
                      </div>
                      <div>
                          <h2 className="text-2xl font-black text-gray-900">Webhook Node</h2>
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mt-1">Status: Active & Sniffing</p>
                      </div>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Evolution Webhook Target</label>
                      <div className="flex items-center gap-3">
                          <code className="text-xs font-mono bg-white p-3 rounded-xl border border-gray-200 flex-1 break-all">{webhookUrl}</code>
                          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); alert("Copied!"); }} className="bg-gray-900 text-white p-3 rounded-xl hover:bg-black transition">
                              <i className="fas fa-copy"></i>
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <button onClick={simulateIncomingMessage} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-red-700 transition active:scale-95">
                          <i className="fas fa-flask mr-2"></i> Test Internal Signal
                      </button>
                      <a href={webhookUrl} target="_blank" className="px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs uppercase hover:bg-gray-200 flex items-center">
                          <i className="fas fa-external-link-alt"></i>
                      </a>
                  </div>
              </div>

              <div className="bg-gray-950 rounded-[2.5rem] p-10 text-white relative overflow-hidden flex flex-col justify-center">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 blur-[100px] rounded-full"></div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-8">Signal Heartbeat</h3>
                  
                  <div className="flex items-center gap-6">
                      <div className={`w-4 h-4 rounded-full ${lastTraffic ? 'bg-green-500 shadow-[0_0_20px_#22c55e]' : 'bg-gray-800 animate-pulse'}`}></div>
                      <div>
                          <p className="text-xl font-black">{lastTraffic ? 'Traffic Detected' : 'No Webhook Traffic'}</p>
                          <p className="text-xs text-gray-500 font-bold mt-1">
                              {lastTraffic ? `Last Event: ${lastTraffic.toLocaleTimeString()}` : 'Check Evolution API dashboard "Webhooks" tab'}
                          </p>
                      </div>
                  </div>

                  <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Troubleshooting Guide:</p>
                      <ul className="text-[9px] text-gray-500 space-y-1 font-medium">
                          <li className="flex items-center gap-2"><i className="fas fa-check text-green-500"></i> Ensure events <strong>MESSAGES_UPSERT</strong> is checked.</li>
                          <li className="flex items-center gap-2"><i className="fas fa-check text-green-500"></i> Webhook must be <strong>ENABLED</strong> for this instance.</li>
                          <li className="flex items-center gap-2"><i className="fas fa-check text-green-500"></i> Verify URL ends in <strong>/webhook</strong>.</li>
                      </ul>
                  </div>
              </div>
          </div>
      </div>

      {/* Traffic Terminal */}
      <div className="bg-[#0c0c0e] rounded-[2.5rem] border border-gray-800 shadow-2xl flex flex-col h-[600px] overflow-hidden">
          <div className="bg-gray-900/50 p-8 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Live Engine Console</h3>
              </div>
              <div className="flex gap-2">
                  <button onClick={() => setShowRaw(false)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${!showRaw ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>Filtered Logs</button>
                  <button onClick={() => setShowRaw(true)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${showRaw ? 'bg-red-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>Raw Signals</button>
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-4 font-mono scrollbar-hide">
              {showRaw ? (
                  rawPayloads.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-700 text-[10px] uppercase font-black tracking-widest">Awaiting raw data packets...</div>
                  ) : (
                    rawPayloads.map((p, i) => (
                        <div key={i} className="bg-gray-900 p-6 rounded-[1.5rem] border border-gray-800 animate-fade-in group">
                            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-4">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{new Date(p.timestamp).toLocaleString()}</span>
                                <span className="text-[10px] text-red-600 font-black uppercase tracking-widest">Inbound Signal</span>
                            </div>
                            <pre className="text-green-500 text-[11px] overflow-x-auto leading-relaxed">{JSON.stringify(p.data, null, 2)}</pre>
                        </div>
                    ))
                  )
              ) : (
                  terminalLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-700 text-[10px] uppercase font-black tracking-widest">Console Initializing...</div>
                  ) : (
                    terminalLogs.map((log, i) => (
                        <div key={i} className={`p-5 rounded-2xl border flex gap-6 items-start animate-fade-in transition-all hover:bg-white/5 ${log.type === 'error' ? 'bg-red-950/20 border-red-900/40' : log.type === 'success' ? 'bg-green-950/10 border-green-900/30' : 'bg-gray-900/50 border-gray-800'}`}>
                            <div className="text-[10px] text-gray-500 font-black pt-1">{new Date(log.timestamp).toLocaleTimeString()}</div>
                            <div className={`text-xs font-bold leading-relaxed ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}`}>
                                {log.msg}
                            </div>
                        </div>
                    ))
                  )
              )}
          </div>
      </div>

      {/* Core Configuration */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-900 p-10 text-white flex justify-between items-center">
              <div>
                  <h2 className="text-xl font-black uppercase tracking-widest">Engine Config</h2>
                  <p className="text-[10px] text-gray-500 font-black uppercase mt-2">API Connectivity & Core Settings</p>
              </div>
              <button onClick={handleSave} disabled={isSaving} className="bg-red-600 px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-red-700 active:scale-95 transition flex items-center gap-3">
                  {isSaving ? <i className="fas fa-sync fa-spin"></i> : <i className="fas fa-save"></i>}
                  {isSaving ? 'Saving...' : 'Sync Config'}
              </button>
          </div>
          
          <div className="p-10 grid md:grid-cols-2 gap-12">
              <div className="space-y-8">
                  <h3 className="text-xs font-black text-red-600 uppercase tracking-[0.3em] border-b border-red-50 pb-4">Evolution API</h3>
                  <div className="space-y-6">
                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Base URL</label>
                          <input placeholder="https://..." value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full bg-gray-50 border p-5 rounded-2xl text-sm font-bold outline-none focus:border-red-600 focus:bg-white transition shadow-inner" />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Instance Name</label>
                              <input value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full bg-gray-50 border p-5 rounded-2xl text-sm font-bold outline-none focus:border-red-600 transition shadow-inner" />
                          </div>
                          <div className="space-y-3">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Token</label>
                              <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full bg-gray-50 border p-5 rounded-2xl text-sm font-bold outline-none focus:border-red-600 transition shadow-inner" />
                          </div>
                      </div>
                  </div>
              </div>

              <div className="space-y-8">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] border-b pb-4">AI Brainpower</h3>
                  <div className="space-y-6">
                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Gemini API Key</label>
                          <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-gray-50 border p-5 rounded-2xl text-sm font-bold outline-none focus:border-red-600 focus:bg-white transition shadow-inner" />
                      </div>
                      <div className="p-6 bg-red-50 rounded-3xl border border-red-100 flex gap-4">
                          <i className="fas fa-shield-alt text-red-500 mt-1"></i>
                          <p className="text-[11px] font-bold text-red-700 leading-relaxed uppercase">
                              This key powers Martha's conversational engine. Ensure it has billing enabled for Gemini 3 Flash Preview models.
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
