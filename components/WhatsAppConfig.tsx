
import React, { useState, useEffect } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

const WhatsAppConfig: React.FC = () => {
  const { whatsappConfig } = useMockBackend();

  const [apiUrl, setApiUrl] = useState(whatsappConfig.apiUrl);
  const [apiToken, setApiToken] = useState(whatsappConfig.apiToken);
  const [instanceName, setInstanceName] = useState(whatsappConfig.instanceName);
  const [geminiKey, setGeminiKey] = useState('');
  
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
          if (l.ok) setTerminalLogs(await l.json());
          if (r.ok) {
              const payloads = await r.json();
              setRawPayloads(payloads);
              if (payloads.length > 0) setLastTraffic(new Date(payloads[0].timestamp));
          }
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
                apiKey: geminiKey
            })
        });
        alert("Configuration Synchronized!");
    } catch (e) { alert("Save failed."); }
    setIsSaving(false);
  };

  const simulateTest = async () => {
      try {
          await fetch('/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-test-header': 'Simulated' },
              body: JSON.stringify({ event: 'test.signal', message: 'Hello from Internal Simulator' })
          });
      } catch (e) {}
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      
      {/* Target Info */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-10 grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg">
                          <i className="fas fa-satellite-dish text-xl"></i>
                      </div>
                      <div>
                          <h2 className="text-2xl font-black text-gray-900">Webhook Node</h2>
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mt-1">Status: Active & Sniffing</p>
                      </div>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Target Webhook URL</label>
                      <div className="flex items-center gap-3">
                          <code className="text-xs font-mono bg-white p-3 rounded-xl border border-gray-200 flex-1 break-all">{webhookUrl}</code>
                          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); alert("Copied!"); }} className="bg-gray-900 text-white p-3 rounded-xl hover:bg-black transition">
                              <i className="fas fa-copy"></i>
                          </button>
                      </div>
                  </div>
                  <button onClick={simulateTest} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-xs uppercase hover:bg-gray-50 transition">
                      Run Internal Connectivity Test
                  </button>
              </div>

              <div className="bg-gray-950 rounded-[2.5rem] p-10 text-white flex flex-col justify-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 blur-[100px]"></div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-8">Signal Heartbeat</h3>
                  <div className="flex items-center gap-6">
                      <div className={`w-4 h-4 rounded-full ${lastTraffic ? 'bg-green-500 shadow-[0_0_20px_#22c55e]' : 'bg-gray-800 animate-pulse'}`}></div>
                      <div>
                          <p className="text-xl font-black">{lastTraffic ? 'Signals Detected' : 'Idle - Waiting for Traffic'}</p>
                          <p className="text-xs text-gray-500 font-bold mt-1">
                              {lastTraffic ? `Last Activity: ${lastTraffic.toLocaleTimeString()}` : 'Verify Evolution API Webhook Config'}
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Traffic Terminal */}
      <div className="bg-[#0c0c0e] rounded-[2.5rem] border border-gray-800 shadow-2xl flex flex-col h-[650px] overflow-hidden">
          <div className="bg-gray-900/50 p-8 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Master Live Terminal</h3>
              </div>
              <div className="flex gap-2">
                  <button onClick={() => setShowRaw(false)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${!showRaw ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>Process Logs</button>
                  <button onClick={() => setShowRaw(true)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${showRaw ? 'bg-red-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>Raw Signals</button>
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-6 font-mono scrollbar-hide">
              {showRaw ? (
                  rawPayloads.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-700 text-[10px] uppercase font-black tracking-widest">Awaiting raw packets...</div>
                  ) : (
                    rawPayloads.map((p, i) => (
                      <div key={i} className="bg-gray-900/50 p-6 rounded-[2rem] border border-gray-800 animate-fade-in-up space-y-6">
                          <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                              <span className="text-[10px] text-gray-500 font-bold">{new Date(p.timestamp).toLocaleString()}</span>
                              <span className="text-[10px] text-red-600 uppercase font-black tracking-widest">Inbound Signal</span>
                          </div>
                          
                          <div className="space-y-2">
                              <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">HTTP Headers</p>
                              <pre className="text-blue-400 text-[10px] bg-black/40 p-4 rounded-xl overflow-x-auto border border-white/5">{JSON.stringify(p.headers, null, 2)}</pre>
                          </div>

                          <div className="space-y-2">
                              <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Body Payload</p>
                              <pre className="text-green-500 text-[10px] bg-black/40 p-4 rounded-xl overflow-x-auto border border-white/5">
                                {typeof p.body === 'string' ? p.body : JSON.stringify(p.body, null, 2)}
                              </pre>
                          </div>
                      </div>
                    ))
                  )
              ) : (
                  terminalLogs.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-700 text-[10px] uppercase font-black tracking-widest">Initializing Terminal...</div>
                  ) : (
                    terminalLogs.map((log, i) => (
                      <div key={i} className={`p-5 rounded-2xl border flex gap-6 items-start transition-all ${log.type === 'error' ? 'bg-red-950/20 border-red-900/40' : log.type === 'success' ? 'bg-green-950/10 border-green-900/30' : 'bg-gray-900/50 border-gray-800'}`}>
                          <span className="text-[10px] text-gray-500 font-black pt-1 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <p className={`text-xs font-bold leading-relaxed ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}`}>{log.msg}</p>
                      </div>
                    ))
                  )
              )}
          </div>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 p-10">
          <div className="flex justify-between items-center mb-10">
              <div>
                  <h2 className="text-xl font-black uppercase tracking-widest">Engine Parameters</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Configure API Endpoints & Auth</p>
              </div>
              <button onClick={handleSave} disabled={isSaving} className="bg-red-600 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase hover:bg-red-700 transition shadow-lg active:scale-95">
                  {isSaving ? <i className="fas fa-sync fa-spin"></i> : 'Sync Settings'}
              </button>
          </div>
          <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Evolution API URL</label>
                  <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://..." className="w-full bg-gray-50 p-5 rounded-2xl border-2 border-transparent focus:border-red-600 outline-none font-bold text-gray-800 transition-all" />
              </div>
              <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Gemini API Key</label>
                  <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-gray-50 p-5 rounded-2xl border-2 border-transparent focus:border-red-600 outline-none font-bold text-gray-800 transition-all" />
              </div>
          </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
