
import React, { useState, useEffect, useRef } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

const WhatsAppConfig: React.FC = () => {
  const { whatsappConfig } = useMockBackend();

  // Unified Server Config State
  const [apiUrl, setApiUrl] = useState(whatsappConfig.apiUrl);
  const [apiToken, setApiToken] = useState(whatsappConfig.apiToken);
  const [instanceName, setInstanceName] = useState(whatsappConfig.instanceName);
  const [geminiKey, setGeminiKey] = useState('');
  
  // Daraja M-Pesa State
  const [darajaEnv, setDarajaEnv] = useState<'sandbox' | 'production'>('production');
  const [darajaType, setDarajaType] = useState<'Paybill' | 'Till'>('Till');
  const [darajaKey, setDarajaKey] = useState('');
  const [darajaSecret, setDarajaSecret] = useState('');
  const [darajaPasskey, setDarajaPasskey] = useState('');
  const [darajaShortcode, setDarajaShortcode] = useState('5512238');
  const [darajaStoreNumber, setDarajaStoreNumber] = useState('4159923');
  const [darajaAccountRef, setDarajaAccountRef] = useState('ENA_COACH');
  const [darajaCallbackUrl, setDarajaCallbackUrl] = useState('');

  // Diagnostics State
  const [testPhone, setTestPhone] = useState('');
  const [simText, setSimText] = useState('Hello Martha');
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean, status?: 'success'|'error', msg?: string }>>({
      gemini: { loading: false },
      whatsapp: { loading: false },
      simulation: { loading: false }
  });

  // UI State
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);
  const [rawPayloads, setRawPayloads] = useState<any[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showRawInspector, setShowRawInspector] = useState(false);

  const fetchData = async () => {
      try {
          const [logRes, rawRes] = await Promise.all([
              fetch('/api/debug/system-logs'),
              fetch('/api/debug/raw-payloads')
          ]);
          if (logRes.ok) setTerminalLogs(await logRes.json());
          if (rawRes.ok) setRawPayloads(await rawRes.json());
      } catch (e) { console.debug("Polling..."); }
  };

  useEffect(() => {
      const currentOrigin = `${window.location.protocol}//${window.location.host}`;
      setWebhookUrl(`${currentOrigin}/webhook`);
      if (!darajaCallbackUrl) setDarajaCallbackUrl(`${currentOrigin}/callback/mpesa`);

      fetch('/api/config').then(res => res.json()).then(data => {
          if (!data) return;
          setGeminiKey(data.apiKey || '');
          setApiUrl(data.evolutionUrl || '');
          setApiToken(data.evolutionToken || '');
          setInstanceName(data.instanceName || '');
          setDarajaEnv(data.darajaEnv || 'production');
          setDarajaType(data.darajaType || 'Till');
          setDarajaKey(data.darajaKey || '');
          setDarajaSecret(data.darajaSecret || '');
          setDarajaPasskey(data.darajaPasskey || '');
          setDarajaShortcode(data.darajaShortcode || '5512238');
          setDarajaStoreNumber(data.darajaStoreNumber || '4159923');
          setDarajaAccountRef(data.darajaAccountRef || 'ENA_COACH');
          setDarajaCallbackUrl(data.darajaCallbackUrl || `${currentOrigin}/callback/mpesa`);
      });
      
      const poll = setInterval(fetchData, 2000); 
      return () => clearInterval(poll);
  }, []);

  const handleSaveAndSync = async () => {
    setIsSaving(true);
    try {
        const res = await fetch('/api/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                evolutionUrl: apiUrl.trim(), evolutionToken: apiToken.trim(), instanceName: instanceName.trim(), 
                apiKey: geminiKey.trim(), darajaEnv, darajaType, darajaKey, darajaSecret, darajaPasskey, 
                darajaShortcode, darajaStoreNumber, darajaAccountRef, darajaCallbackUrl
            })
        });
        if (res.ok) alert("Synced successfully.");
    } catch (e) { alert("Network Error."); }
    finally { setIsSaving(false); }
  };

  const runDiagnostics = async (type: string) => {
      setTestResults(prev => ({ ...prev, [type]: { loading: true } }));
      let payload: any = {};
      let endpoint = `/api/test/${type}`;

      if (type === 'simulation') {
          endpoint = '/api/test/trigger-webhook';
          payload = { phoneNumber: testPhone || '254700000000', text: simText };
      } else if (type !== 'gemini') {
          if (!testPhone) return setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Enter phone' } }));
          payload = { phoneNumber: testPhone };
      }

      try {
          const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const data = await res.json();
          setTestResults(prev => ({ ...prev, [type]: { loading: false, status: data.success || res.ok ? 'success' : 'error', msg: data.success || res.ok ? 'OK' : (data.message || 'Error') } }));
      } catch (e) { setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Offline' } })); }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("Copied!");
  };

  const generateCurlCommand = () => {
      return `curl -X POST ${webhookUrl} \\
-H "Content-Type: application/json" \\
-d '{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "254700000000@s.whatsapp.net", "fromMe": false },
    "message": { "conversation": "Hello test" }
  }
}'`;
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Webhook Configuration & Diagnostic Tool */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex flex-col md:flex-row">
              <div className="bg-red-600 p-10 text-white md:w-2/5 flex flex-col justify-center">
                  <h2 className="text-xl font-black uppercase tracking-widest mb-4">Webhook Target</h2>
                  <p className="text-red-100 text-sm font-medium leading-relaxed mb-6">
                      Ensure your Evolution API sends POST requests to this URL. Our server is ready to receive data.
                  </p>
                  <button 
                    onClick={() => setShowRawInspector(!showRawInspector)}
                    className="self-start px-4 py-2 bg-black/20 hover:bg-black/40 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
                  >
                    {showRawInspector ? 'Close Inspector' : 'Open Raw Inspector'}
                  </button>
              </div>
              <div className="p-10 flex-1 space-y-6">
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Webhook URL</label>
                      <div className="flex bg-gray-50 p-1.5 rounded-2xl items-center border border-gray-100">
                          <input readOnly value={webhookUrl} className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none text-gray-700" />
                          <button onClick={() => copyToClipboard(webhookUrl)} className="bg-red-600 text-white px-5 py-3 rounded-xl font-black text-xs uppercase transition hover:bg-red-700">Copy</button>
                      </div>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">CURL Diagnostic (Test Webhook Now)</label>
                      <div className="bg-gray-900 p-4 rounded-xl relative group">
                          <pre className="text-[10px] text-green-400 font-mono overflow-x-auto">
                              {generateCurlCommand()}
                          </pre>
                          <button 
                            onClick={() => copyToClipboard(generateCurlCommand())}
                            className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition"
                          >
                             <i className="fas fa-copy"></i>
                          </button>
                      </div>
                      <p className="text-[9px] text-gray-400 italic">Copy this and run it in your terminal. If it appears in the logs below, your server is working perfectly.</p>
                  </div>
              </div>
          </div>
      </div>

      {showRawInspector && (
          <div className="bg-gray-950 rounded-[2.5rem] p-8 border border-gray-800 shadow-2xl animation-fade-in">
              <h3 className="text-white text-xs font-black uppercase tracking-widest mb-6">Last 10 Payloads</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-4 scrollbar-hide">
                  {rawPayloads.length === 0 ? (
                      <p className="text-gray-500 text-xs italic text-center py-10">Waiting for signals...</p>
                  ) : rawPayloads.map((raw, i) => (
                      <div key={i} className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] text-red-500 font-bold uppercase">{new Date(raw.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <pre className="text-[10px] text-green-500 font-mono overflow-x-auto bg-black/50 p-4 rounded-xl">
                              {JSON.stringify(raw.data, null, 2)}
                          </pre>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Activity Log */}
      <div className="bg-[#0b0b0e] rounded-[2.5rem] p-8 h-[400px] flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <p className="text-gray-400 text-[10px] uppercase tracking-[0.4em] font-black ml-2">Live Activity Monitor</p>
            <button onClick={fetchData} className="text-[10px] text-gray-500 hover:text-white uppercase font-black tracking-widest"><i className="fas fa-sync-alt mr-2"></i> Sync</button>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed space-y-2 scrollbar-hide">
              {terminalLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-10">
                    <i className="fas fa-satellite-dish text-6xl"></i>
                    <p className="text-xs uppercase tracking-widest">No signals detected.</p>
                </div>
              ) : terminalLogs.map((log: any, i) => (
                  <div key={i} className={`p-2.5 rounded-xl border flex items-start gap-4 ${
                    log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 
                    log.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-900/30' : 
                    'bg-gray-900/60 text-gray-400 border-gray-800'
                  }`}>
                      <span className="opacity-40 font-bold shrink-0 text-[9px] uppercase">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                      <span className="font-mono break-all">{log.msg}</span>
                  </div>
              ))}
          </div>
      </div>

      {/* Simulation Hub */}
      <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-950 p-10 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black uppercase tracking-widest">Logic Simulator</h2>
                <p className="text-gray-400 text-xs font-medium">Verify AI logic independently of the network.</p>
              </div>
              <div className="flex bg-gray-900 p-1 rounded-2xl border border-gray-800">
                  <input type="text" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Phone: 2547..." className="bg-transparent px-4 py-2 text-xs font-bold text-white outline-none w-40" />
              </div>
          </div>
          <div className="p-10 flex flex-col md:flex-row gap-8">
              <div className="flex-1 p-8 rounded-3xl bg-gray-50 border border-gray-100 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Internal Webhook Test</h4>
                    <input type="text" value={simText} onChange={e => setSimText(e.target.value)} className="w-full bg-white border border-gray-200 p-4 rounded-xl text-sm font-bold mb-4 outline-none focus:border-red-500" />
                  </div>
                  <button onClick={() => runDiagnostics('simulation')} disabled={testResults.simulation.loading} className="w-full py-4 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition active:scale-95">Run Simulation</button>
              </div>
              <div className="flex-1 space-y-4">
                  {['gemini', 'whatsapp'].map((type) => (
                      <div key={type} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{type}</p>
                            <p className="text-[10px] font-bold text-gray-900">{testResults[type].msg || 'Awaiting Test'}</p>
                         </div>
                         <button onClick={() => runDiagnostics(type)} disabled={testResults[type].loading} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition ${testResults[type].status === 'success' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Test</button>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Integration Settings */}
      <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-950 p-10 text-white flex justify-between items-center">
            <h2 className="text-2xl font-black tracking-widest uppercase">Integration Hub</h2>
            <button onClick={handleSaveAndSync} disabled={isSaving} className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition shadow-xl active:scale-95">{isSaving ? 'Syncing...' : 'Deploy Changes'}</button>
        </div>
        <div className="p-10 space-y-12">
            <section className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8">Evolution API (WhatsApp)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Evolution API URL</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none focus:border-red-600" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Instance Name</label>
                        <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none focus:border-red-600" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">API Key (apikey header)</label>
                        <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                </div>
            </section>
            <section className="bg-blue-50/30 p-8 rounded-[2rem] border border-blue-100">
                <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-8">Gemini AI Engine</h3>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Master API Key</label>
                    <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                </div>
            </section>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
