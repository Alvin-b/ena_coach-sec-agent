
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
      } catch (e) { console.debug("Polling paused."); }
  };

  useEffect(() => {
      setWebhookUrl(`${window.location.protocol}//${window.location.host}/webhook`);

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
              setDarajaCallbackUrl(data.darajaCallbackUrl || '');
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
        if (res.ok) alert("Settings synchronized with production engine.");
    } catch (e) { alert("Failed to save settings."); }
    finally { setIsSaving(false); }
  };

  const runDiagnostics = async (type: 'gemini' | 'whatsapp' | 'mpesa') => {
      setTestResults(prev => ({ ...prev, [type]: { loading: true } }));
      
      let payload = {};
      if (type !== 'gemini') {
          if (!testPhone) {
              setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: 'Enter phone first' } }));
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
          
          if (!res.ok) {
              const text = await res.text();
              throw new Error(res.status === 404 ? "Endpoint not found" : "Server error");
          }

          const data = await res.json();
          setTestResults(prev => ({ 
              ...prev, 
              [type]: { 
                  loading: false, 
                  status: data.success ? 'success' : 'error', 
                  msg: data.success ? 'Operational' : (data.message || 'Check config')
              } 
          }));
      } catch (e: any) {
          setTestResults(prev => ({ ...prev, [type]: { loading: false, status: 'error', msg: e.message || 'Unreachable' } }));
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Dynamic Webhook Info Card */}
      <div className="bg-blue-600 rounded-[2.5rem] p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-20 -mt-20"></div>
          <div className="relative z-10">
              <h2 className="text-2xl font-black uppercase tracking-widest mb-4">WhatsApp Integration Guide</h2>
              <p className="text-blue-100 text-sm max-w-xl mb-6 font-medium leading-relaxed">
                  To receive WhatsApp messages, copy the URL below and paste it into your <strong>Evolution API Instance Dashboard</strong> under the "Webhooks" section. Set the event to <strong>messages.upsert</strong>.
              </p>
              <div className="flex bg-blue-900/40 p-1.5 rounded-2xl items-center border border-blue-400/30">
                  <input 
                    readOnly 
                    value={webhookUrl} 
                    className="flex-1 bg-transparent px-4 py-3 text-sm font-mono outline-none" 
                  />
                  <button 
                    onClick={() => copyToClipboard(webhookUrl)}
                    className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-xs hover:bg-blue-50 transition uppercase tracking-widest"
                  >
                    Copy URL
                  </button>
              </div>
          </div>
      </div>

      {/* Terminal Display */}
      <div className="bg-[#0b0b0e] rounded-[2.5rem] p-8 h-80 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></span>
                <p className="text-blue-400 text-xs uppercase tracking-[0.3em] font-black">Agent Activity Feed</p>
            </div>
            <button onClick={fetchLogs} className="text-[10px] text-gray-500 hover:text-white uppercase font-black"><i className="fas fa-sync-alt mr-2"></i> Refresh Logs</button>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed space-y-3 scrollbar-hide flex flex-col-reverse">
              {terminalLogs.length === 0 ? <p className="text-gray-700 italic text-center py-20"># Monitoring incoming events...</p> : terminalLogs.map((log: any, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${
                    log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 
                    log.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-900/30' : 
                    'bg-blue-950/10 text-blue-300 border-blue-900/20'
                  }`}>
                      <span className="opacity-30 mr-3">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="font-bold">{log.msg}</span>
                  </div>
              ))}
          </div>
      </div>

      {/* API Test Suite */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
          <div className="bg-red-50 p-10 border-b border-red-100">
              <h2 className="text-2xl font-black text-red-900 tracking-widest uppercase">Integration Test Center</h2>
              <p className="text-xs text-red-600 mt-1 font-bold">Validate your configurations with real-time diagnostic pings.</p>
          </div>
          <div className="p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Test Phone Number (For WhatsApp & M-Pesa)</label>
                    <input 
                        type="text" 
                        value={testPhone} 
                        onChange={e => setTestPhone(e.target.value)} 
                        placeholder="e.g. 0712345678"
                        className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 outline-none focus:border-red-400 transition"
                    />
                </div>
                <p className="text-[10px] text-gray-400 italic mb-3 leading-relaxed">
                    Note: M-Pesa test triggers a <strong>1 KES</strong> real push. WhatsApp test sends a template system message.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Gemini Diagnostic */}
                  <div className={`p-6 rounded-3xl border-2 transition ${testResults.gemini.status === 'success' ? 'border-green-100 bg-green-50/30' : 'border-gray-50 bg-gray-50/50'}`}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Gemini AI Engine</h4>
                      <button 
                        onClick={() => runDiagnostics('gemini')}
                        disabled={testResults.gemini.loading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
                      >
                          {testResults.gemini.loading ? 'Pinging...' : 'Test AI Ping'}
                      </button>
                      {testResults.gemini.status && (
                          <p className={`mt-3 text-[10px] font-bold text-center uppercase tracking-tighter ${testResults.gemini.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                             {testResults.gemini.status === 'success' ? '✅ Online' : `❌ ${testResults.gemini.msg}`}
                          </p>
                      )}
                  </div>

                  {/* WhatsApp Diagnostic */}
                  <div className={`p-6 rounded-3xl border-2 transition ${testResults.whatsapp.status === 'success' ? 'border-green-100 bg-green-50/30' : 'border-gray-50 bg-gray-50/50'}`}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">WhatsApp (Evolution)</h4>
                      <button 
                        onClick={() => runDiagnostics('whatsapp')}
                        disabled={testResults.whatsapp.loading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
                      >
                          {testResults.whatsapp.loading ? 'Sending...' : 'Test Send MSG'}
                      </button>
                      {testResults.whatsapp.status && (
                          <p className={`mt-3 text-[10px] font-bold text-center uppercase tracking-tighter ${testResults.whatsapp.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                             {testResults.whatsapp.status === 'success' ? '✅ Sent' : `❌ ${testResults.whatsapp.msg}`}
                          </p>
                      )}
                  </div>

                  {/* M-Pesa Diagnostic */}
                  <div className={`p-6 rounded-3xl border-2 transition ${testResults.mpesa.status === 'success' ? 'border-green-100 bg-green-50/30' : 'border-gray-50 bg-gray-50/50'}`}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">M-Pesa (Daraja)</h4>
                      <button 
                        onClick={() => runDiagnostics('mpesa')}
                        disabled={testResults.mpesa.loading}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
                      >
                          {testResults.mpesa.loading ? 'Pushing...' : 'Test STK Push'}
                      </button>
                      {testResults.mpesa.status && (
                          <p className={`mt-3 text-[10px] font-bold text-center uppercase tracking-tighter ${testResults.mpesa.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                             {testResults.mpesa.status === 'success' ? '✅ Request Sent' : `❌ ${testResults.mpesa.msg}`}
                          </p>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Config Hub */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 p-10 border-b border-gray-200">
            <h2 className="text-3xl font-black text-gray-950 tracking-widest uppercase">Integration Hub</h2>
            <p className="text-sm text-gray-500 mt-2 font-medium">Link your Evolution API and Daraja M-Pesa accounts to the Martha Engine.</p>
        </div>

        <div className="p-10 space-y-12">
            
            {/* Evolution API Settings */}
            <section>
                <h3 className="text-xs font-black text-red-600 uppercase tracking-widest mb-8 flex items-center">
                    <span className="w-8 h-px bg-red-600 mr-4"></span>
                    WhatsApp Provider (Evolution API)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">API Base URL</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 focus:border-red-600 outline-none" placeholder="https://api.your-evo.com" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Instance Name</label>
                        <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 focus:border-red-600 outline-none" placeholder="e.g. Martha_Bot" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">API Token (apikey)</label>
                        <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                </div>
            </section>

            {/* Daraja M-Pesa Settings */}
            <section>
                <h3 className="text-xs font-black text-green-600 uppercase tracking-widest mb-8 flex items-center">
                    <span className="w-8 h-px bg-green-600 mr-4"></span>
                    M-Pesa Gateway (Safaricom Daraja)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Environment</label>
                        <select value={darajaEnv} onChange={e => setDarajaEnv(e.target.value as any)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none appearance-none">
                            <option value="sandbox">Sandbox (Testing)</option>
                            <option value="production">Production (Real Payments)</option>
                        </select>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Business Type</label>
                        <select value={darajaType} onChange={e => setDarajaType(e.target.value as any)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold outline-none appearance-none">
                            <option value="Till">Buy Goods (Till Number)</option>
                            <option value="Paybill">Paybill</option>
                        </select>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Consumer Key</label>
                        <input type="password" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Consumer Secret</label>
                        <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Shortcode / Store Number</label>
                        <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-bold text-gray-900 outline-none" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Passkey (STK Push)</label>
                        <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                    </div>
                </div>
            </section>

            {/* Gemini API Key */}
            <section>
                <h3 className="text-xs font-black text-red-600 uppercase tracking-widest mb-8 flex items-center">
                    <span className="w-8 h-px bg-red-600 mr-4"></span>
                    AI Brain (Gemini 3)
                </h3>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Production API Key</label>
                    <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-mono outline-none" />
                </div>
            </section>

            <button 
                onClick={handleSaveAndSync} 
                disabled={isSaving}
                className="w-full py-8 bg-red-600 text-white font-black rounded-3xl hover:bg-red-700 shadow-2xl transition-all transform active:scale-95 uppercase tracking-[0.4em] text-sm"
            >
                {isSaving ? 'Synchronizing...' : 'Save & Deploy to Engine'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
