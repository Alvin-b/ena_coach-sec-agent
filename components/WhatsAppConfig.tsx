
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
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean, status?: 'success'|'error', msg?: string }>>({
      gemini: { loading: false },
      whatsapp: { loading: false },
      mpesa: { loading: false }
  });

  // UI State
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastPulse, setLastPulse] = useState<Date | null>(null);

  const fetchLogs = async () => {
      try {
          const logRes = await fetch('/api/debug/system-logs');
          if (logRes.ok) {
              const logs = await logRes.json();
              if (logs.length > 0 && terminalLogs.length > 0) {
                  if (logs[0].timestamp !== terminalLogs[0].timestamp) {
                      setLastPulse(new Date());
                  }
              }
              setTerminalLogs(logs);
          }
      } catch (e) { console.debug("Polling logs..."); }
  };

  useEffect(() => {
      const currentOrigin = `${window.location.protocol}//${window.location.host}`;
      setWebhookUrl(`${currentOrigin}/webhook`);
      
      if (!darajaCallbackUrl) {
          setDarajaCallbackUrl(`${currentOrigin}/callback/mpesa`);
      }

      fetch('/api/config')
          .then(res => res.ok ? res.json() : null)
          .then(data => {
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
      
      const poll = setInterval(fetchLogs, 3000); // Polling every 3 seconds for tighter feedback
      return () => clearInterval(poll);
  }, []);

  const handleSaveAndSync = async () => {
    setIsSaving(true);
    try {
        const res = await fetch('/api/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                evolutionUrl: apiUrl.trim(), 
                evolutionToken: apiToken.trim(), 
                instanceName: instanceName.trim(), 
                apiKey: geminiKey.trim(),
                darajaEnv,
                darajaType,
                darajaKey: darajaKey.trim(),
                darajaSecret: darajaSecret.trim(),
                darajaPasskey: darajaPasskey.trim(),
                darajaShortcode: darajaShortcode.trim(),
                darajaStoreNumber: darajaStoreNumber.trim(),
                darajaAccountRef: darajaAccountRef.trim(),
                darajaCallbackUrl: darajaCallbackUrl.trim()
            })
        });
        if (res.ok) alert("Production Engine settings synchronized. Webhook is now active.");
        else alert("Sync failed. Check terminal logs.");
    } catch (e) { alert("Network error: Server is unreachable."); }
    finally { setIsSaving(false); }
  };

  const runDiagnostics = async (type: 'gemini' | 'whatsapp' | 'mpesa') => {
      setTestResults(prev => ({ ...prev, [type]: { loading: true } }));
      
      let payload = {};
      if (type !== 'gemini') {
          if (!testPhone) {
              setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Enter phone' } }));
              return;
          }
          payload = { phoneNumber: testPhone };
      }

      try {
          const res = await fetch(`/api/test/${type}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          setTestResults(prev => ({ 
              ...prev, 
              [type]: { 
                  loading: false, 
                  status: data.success ? 'success' : 'error', 
                  msg: data.success ? 'OK' : (data.message || 'Error')
              } 
          }));
      } catch (e: any) {
          setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Offline' } }));
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Endpoint Status Header */}
      <div className="bg-white rounded-[2.5rem] p-1 shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex flex-col md:flex-row">
              <div className="bg-red-600 p-10 text-white md:w-2/5 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                      <div className={`w-3 h-3 rounded-full bg-white shadow-[0_0_10px_white] ${lastPulse ? 'animate-ping' : ''}`}></div>
                      <h2 className="text-xl font-black uppercase tracking-widest">Server Pulse</h2>
                  </div>
                  <p className="text-red-100 text-sm font-medium leading-relaxed mb-4">
                      Server is listening for webhooks. If traffic doesn't appear in the log below, verify your external gateway settings.
                  </p>
                  <div className="text-[10px] font-black uppercase tracking-tighter opacity-60">
                      Last Detection: {lastPulse ? lastPulse.toLocaleTimeString() : 'Waiting for traffic...'}
                  </div>
              </div>
              <div className="p-10 flex-1 space-y-6">
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">WhatsApp Webhook Target</label>
                      <div className="flex bg-gray-50 p-1.5 rounded-2xl items-center border border-gray-100">
                          <input readOnly value={webhookUrl} className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none text-gray-700" />
                          <button onClick={() => copyToClipboard(webhookUrl)} className="bg-red-600 text-white px-5 py-3 rounded-xl font-black text-xs uppercase hover:bg-red-700 transition">Copy</button>
                      </div>
                  </div>
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">M-Pesa Callback URL</label>
                      <div className="flex bg-gray-50 p-1.5 rounded-2xl items-center border border-gray-100">
                          <input readOnly value={darajaCallbackUrl} className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none text-gray-700" />
                          <button onClick={() => copyToClipboard(darajaCallbackUrl)} className="bg-gray-900 text-white px-5 py-3 rounded-xl font-black text-xs uppercase hover:bg-black transition">Copy</button>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Terminal Display */}
      <div className="bg-[#0b0b0e] rounded-[2.5rem] p-8 h-96 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <div className="flex space-x-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                </div>
                <p className="text-gray-400 text-xs uppercase tracking-[0.3em] font-black ml-2">Live Activity Monitor</p>
            </div>
            <div className="flex items-center gap-4">
                {lastPulse && <span className="text-[10px] text-green-500 font-black uppercase animate-pulse">● Receiving Data</span>}
                <button onClick={fetchLogs} className="text-[10px] text-gray-500 hover:text-white uppercase font-black"><i className="fas fa-sync-alt mr-2"></i> Refresh</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed space-y-2 scrollbar-hide">
              {terminalLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-20">
                    <i className="fas fa-terminal text-5xl"></i>
                    <p className="text-xs uppercase tracking-widest text-center">No traffic detected yet.<br/>Ensure your Webhook URL is saved in Evolution API.</p>
                </div>
              ) : terminalLogs.map((log: any, i) => (
                  <div key={i} className={`p-2.5 rounded-lg border flex items-start gap-4 ${
                    log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 
                    log.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-900/30' : 
                    'bg-gray-900/40 text-gray-400 border-gray-800'
                  }`}>
                      <span className="opacity-40 font-bold shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                      <span className="font-mono">{log.msg}</span>
                  </div>
              ))}
          </div>
      </div>

      {/* Diagnostics Suite */}
      <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-10 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Diagnostic Suite</h2>
                  <p className="text-xs text-gray-500 font-bold mt-1">Check outgoing connection to your APIs.</p>
              </div>
              <div className="flex bg-gray-50 p-1.5 rounded-2xl items-center border border-gray-100 w-full md:w-64">
                  <i className="fas fa-phone-alt ml-4 text-gray-400"></i>
                  <input 
                      type="text" 
                      value={testPhone} 
                      onChange={e => setTestPhone(e.target.value)} 
                      placeholder="Test Phone..."
                      className="flex-1 bg-transparent px-4 py-2 text-sm font-bold text-gray-900 outline-none"
                  />
              </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-50">
              {['gemini', 'whatsapp', 'mpesa'].map((type) => (
                  <div key={type} className="p-10 flex flex-col items-center text-center">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">{type === 'mpesa' ? 'M-Pesa (Daraja)' : type === 'whatsapp' ? 'WhatsApp (Evolution)' : 'AI (Gemini)'}</h4>
                      <button 
                        onClick={() => runDiagnostics(type as any)}
                        disabled={testResults[type].loading}
                        className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition transform active:scale-95 ${
                            testResults[type].status === 'success' ? 'bg-green-600 text-white shadow-green-200' :
                            testResults[type].status === 'error' ? 'bg-red-600 text-white shadow-red-200' :
                            'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } shadow-lg`}
                      >
                          {testResults[type].loading ? <i className="fas fa-circle-notch fa-spin"></i> : `TEST ${type.toUpperCase()}`}
                      </button>
                      {testResults[type].msg && (
                          <p className={`mt-4 text-[10px] font-black uppercase ${testResults[type].status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                             {testResults[type].msg}
                          </p>
                      )}
                  </div>
              ))}
          </div>
      </div>

      {/* Configuration Hub */}
      <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-950 p-10 text-white flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-black tracking-widest uppercase">Integration Hub</h2>
                <p className="text-xs text-gray-400 mt-2 font-medium">Production Credentials & Settings</p>
            </div>
            <button 
                onClick={handleSaveAndSync} 
                disabled={isSaving}
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition shadow-xl active:scale-95"
            >
                {isSaving ? <i className="fas fa-circle-notch fa-spin"></i> : 'Apply Changes'}
            </button>
        </div>

        <div className="p-10 space-y-12">
            {/* Evolution API Settings */}
            <section className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-8 flex items-center">
                    <span className="w-8 h-px bg-gray-200 mr-4"></span>
                    Evolution API (WhatsApp)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Evolution API URL</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 focus:border-red-600 outline-none" placeholder="https://..." />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Instance Name</label>
                        <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 focus:border-red-600 outline-none" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">API Key (X-API-KEY)</label>
                        <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                </div>
            </section>

            {/* Daraja M-Pesa Settings */}
            <section className="bg-green-50/30 p-8 rounded-[2rem] border border-green-100">
                <h3 className="text-xs font-black text-green-600 uppercase tracking-widest mb-8 flex items-center">
                    <span className="w-8 h-px bg-green-200 mr-4"></span>
                    Safaricom Daraja (M-Pesa)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Environment</label>
                        <select value={darajaEnv} onChange={e => setDarajaEnv(e.target.value as any)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none">
                            <option value="sandbox">Sandbox (Testing)</option>
                            <option value="production">Production (Real)</option>
                        </select>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Consumer Key</label>
                        <input type="password" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Consumer Secret</label>
                        <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">STK Passkey</label>
                        <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Shortcode</label>
                        <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Store/Till Number</label>
                        <input type="text" value={darajaStoreNumber} onChange={e => setDarajaStoreNumber(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none" />
                    </div>
                </div>
            </section>

            {/* Gemini API Key */}
            <section className="bg-blue-50/30 p-8 rounded-[2rem] border border-blue-100">
                <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-8 flex items-center">
                    <span className="w-8 h-px bg-blue-200 mr-4"></span>
                    Gemini AI Engine
                </h3>
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
