
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

  const fetchLogs = async () => {
      try {
          const logRes = await fetch('/api/debug/system-logs');
          if (logRes.ok) {
              const logs = await logRes.json();
              setTerminalLogs(logs);
          }
      } catch (e) { console.debug("Polling logs..."); }
  };

  useEffect(() => {
      const currentOrigin = `${window.location.protocol}//${window.location.host}`;
      setWebhookUrl(`${currentOrigin}/webhook`);
      
      // Suggest this URL for M-Pesa callback if empty
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
      
      const poll = setInterval(fetchLogs, 5000);
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
        if (res.ok) alert("Production Engine successfully synchronized.");
        else alert("Sync failed. Check console.");
    } catch (e) { alert("Network error during sync."); }
    finally { setIsSaving(false); }
  };

  const runDiagnostics = async (type: 'gemini' | 'whatsapp' | 'mpesa') => {
      setTestResults(prev => ({ ...prev, [type]: { loading: true } }));
      
      let payload = {};
      if (type !== 'gemini') {
          if (!testPhone) {
              setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Phone required' } }));
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
                  msg: data.success ? 'Connected Successfully' : (data.message || 'Validation Failed')
              } 
          }));
      } catch (e: any) {
          setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Engine Offline' } }));
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Dynamic Webhook Info Card */}
      <div className="bg-red-600 rounded-[2.5rem] p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-20 -mt-20"></div>
          <div className="relative z-10">
              <h2 className="text-2xl font-black uppercase tracking-widest mb-4">Production Endpoint</h2>
              <p className="text-red-100 text-sm max-w-xl mb-6 font-medium leading-relaxed">
                  Use this URL in your Evolution API and M-Pesa portal for webhooks. 
                  If you are using <strong>Render</strong>, ensure your "Render URL" matches this domain.
              </p>
              <div className="space-y-4">
                  <div className="flex bg-black/20 p-1.5 rounded-2xl items-center border border-white/20">
                      <div className="px-4 text-[10px] font-black uppercase tracking-tighter text-white/60">WhatsApp Webhook</div>
                      <input 
                        readOnly 
                        value={webhookUrl} 
                        className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none" 
                      />
                      <button 
                        onClick={() => copyToClipboard(webhookUrl)}
                        className="bg-white text-red-600 px-6 py-3 rounded-xl font-black text-xs hover:bg-gray-100 transition uppercase tracking-widest"
                      >
                        Copy
                      </button>
                  </div>
                  <div className="flex bg-black/20 p-1.5 rounded-2xl items-center border border-white/20">
                      <div className="px-4 text-[10px] font-black uppercase tracking-tighter text-white/60">M-Pesa Callback</div>
                      <input 
                        readOnly 
                        value={darajaCallbackUrl} 
                        className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none" 
                      />
                      <button 
                        onClick={() => copyToClipboard(darajaCallbackUrl)}
                        className="bg-white text-red-600 px-6 py-3 rounded-xl font-black text-xs hover:bg-gray-100 transition uppercase tracking-widest"
                      >
                        Copy
                      </button>
                  </div>
              </div>
          </div>
      </div>

      {/* Terminal Display */}
      <div className="bg-[#0b0b0e] rounded-[2.5rem] p-8 h-80 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></span>
                <p className="text-gray-400 text-xs uppercase tracking-[0.3em] font-black">Agent Debug Feed</p>
            </div>
            <button onClick={fetchLogs} className="text-[10px] text-gray-500 hover:text-white uppercase font-black"><i className="fas fa-sync-alt mr-2"></i> Sync Logs</button>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed space-y-3 scrollbar-hide flex flex-col-reverse">
              {terminalLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <i className="fas fa-satellite-dish text-gray-800 text-4xl animate-bounce"></i>
                    <p className="text-gray-700 italic text-center">Monitoring traffic. Send a WhatsApp message or test M-Pesa to see events...</p>
                </div>
              ) : terminalLogs.map((log: any, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${
                    log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 
                    log.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-900/30' : 
                    'bg-gray-900 text-gray-300 border-gray-800'
                  }`}>
                      <span className="opacity-30 mr-3 text-[9px] uppercase">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="font-bold">{log.msg}</span>
                  </div>
              ))}
          </div>
      </div>

      {/* API Test Suite */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 p-10 border-b border-gray-100">
              <h2 className="text-2xl font-black text-gray-900 tracking-widest uppercase">Connectivity Suite</h2>
              <p className="text-xs text-gray-500 mt-1 font-bold">Instantly verify if your credentials and webhooks are active.</p>
          </div>
          <div className="p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Test Phone (Must be 07... or 254...)</label>
                    <input 
                        type="text" 
                        value={testPhone} 
                        onChange={e => setTestPhone(e.target.value)} 
                        placeholder="0712345678"
                        className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 outline-none focus:border-red-600 transition"
                    />
                </div>
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                    <p className="text-[10px] text-yellow-800 font-bold uppercase tracking-tight">
                        <i className="fas fa-exclamation-triangle mr-2"></i> M-Pesa test costs 1 KES. WhatsApp test sends one message.
                    </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Gemini Diagnostic */}
                  <div className={`p-6 rounded-3xl border-2 transition ${testResults.gemini.status === 'success' ? 'border-green-100 bg-green-50' : 'border-gray-50 bg-gray-50'}`}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Gemini API (AI)</h4>
                      <button 
                        onClick={() => runDiagnostics('gemini')}
                        disabled={testResults.gemini.loading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition active:scale-95"
                      >
                          {testResults.gemini.loading ? 'Pinging...' : 'Test AI Ping'}
                      </button>
                      {testResults.gemini.status && (
                          <p className={`mt-3 text-[10px] font-bold text-center uppercase ${testResults.gemini.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                             {testResults.gemini.status === 'success' ? '✅ Operational' : `❌ ${testResults.gemini.msg}`}
                          </p>
                      )}
                  </div>

                  {/* WhatsApp Diagnostic */}
                  <div className={`p-6 rounded-3xl border-2 transition ${testResults.whatsapp.status === 'success' ? 'border-green-100 bg-green-50' : 'border-gray-50 bg-gray-50'}`}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">WhatsApp (Evolution)</h4>
                      <button 
                        onClick={() => runDiagnostics('whatsapp')}
                        disabled={testResults.whatsapp.loading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition active:scale-95"
                      >
                          {testResults.whatsapp.loading ? 'Sending...' : 'Test WhatsApp'}
                      </button>
                      {testResults.whatsapp.status && (
                          <p className={`mt-3 text-[10px] font-bold text-center uppercase ${testResults.whatsapp.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                             {testResults.whatsapp.status === 'success' ? '✅ Message Sent' : `❌ ${testResults.whatsapp.msg}`}
                          </p>
                      )}
                  </div>

                  {/* M-Pesa Diagnostic */}
                  <div className={`p-6 rounded-3xl border-2 transition ${testResults.mpesa.status === 'success' ? 'border-green-100 bg-green-50' : 'border-gray-50 bg-gray-50'}`}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">M-Pesa (Daraja)</h4>
                      <button 
                        onClick={() => runDiagnostics('mpesa')}
                        disabled={testResults.mpesa.loading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition active:scale-95"
                      >
                          {testResults.mpesa.loading ? 'Pushing...' : 'Test STK Push'}
                      </button>
                      {testResults.mpesa.status && (
                          <p className={`mt-3 text-[10px] font-bold text-center uppercase ${testResults.mpesa.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                             {testResults.mpesa.status === 'success' ? '✅ Prompt Triggered' : `❌ ${testResults.mpesa.msg}`}
                          </p>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Config Hub */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-950 p-10 text-white flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-black tracking-widest uppercase">Integration Hub</h2>
                <p className="text-xs text-gray-400 mt-2 font-medium">Production Credentials & Gateway Settings</p>
            </div>
            <i className="fas fa-cog fa-spin text-gray-800 text-4xl"></i>
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
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Shortcode (Paybill/Store)</label>
                        <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Callback URL (Auto-calculated)</label>
                        <input type="text" value={darajaCallbackUrl} onChange={e => setDarajaCallbackUrl(e.target.value)} className="w-full bg-white border-2 border-gray-100 p-5 rounded-2xl text-xs font-mono outline-none" />
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

            <button 
                onClick={handleSaveAndSync} 
                disabled={isSaving}
                className="w-full py-8 bg-red-600 text-white font-black rounded-3xl hover:bg-red-700 shadow-2xl transition-all transform active:scale-95 uppercase tracking-[0.4em] text-sm"
            >
                {isSaving ? 'Deploying Changes...' : 'Save & Sync to Production'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
