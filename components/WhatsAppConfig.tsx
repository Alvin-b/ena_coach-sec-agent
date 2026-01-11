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
  const [darajaShortcode, setDarajaShortcode] = useState('');
  const [darajaAccountRef, setDarajaAccountRef] = useState('ENA_COACH');
  const [securityCredential, setSecurityCredential] = useState('');
  const [initiatorPassword, setInitiatorPassword] = useState('');

  // Test Phone State
  const [testPhone, setTestPhone] = useState('0712345678');

  // UI State
  const [isTestingPayment, setIsTestingPayment] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<{msg: string, timestamp: number} | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchLogsAndAlerts = async () => {
      try {
          const logRes = await fetch('/api/debug/system-logs');
          const logs = await logRes.json();
          setTerminalLogs(logs);

          const errRes = await fetch('/api/debug/latest-error');
          const error = await errRes.json();
          if (error && (!currentAlert || error.timestamp > currentAlert.timestamp)) {
              setCurrentAlert(error);
          }
      } catch (e) {}
  };

  useEffect(() => {
      fetch('/api/config')
          .then(res => res.json())
          .then(data => {
              setGeminiKey(data.apiKey || '');
              setApiUrl(data.evolutionUrl || '');
              setApiToken(data.evolutionToken || '');
              setInstanceName(data.instanceName || '');
              setDarajaEnv(data.darajaEnv || 'production');
              setDarajaType(data.darajaType || 'Till');
              setDarajaKey(data.darajaKey || '');
              setDarajaSecret(data.darajaSecret || '');
              setDarajaPasskey(data.darajaPasskey || '');
              setDarajaShortcode(data.darajaShortcode || '');
              setDarajaAccountRef(data.darajaAccountRef || 'ENA_COACH');
              setSecurityCredential(data.darajaSecurityCredential || '');
              setInitiatorPassword(data.darajaInitiatorPassword || '');
          });
      
      const poll = setInterval(fetchLogsAndAlerts, 3000);
      return () => clearInterval(poll);
  }, []);

  const handleSaveAndSync = async () => {
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
                darajaAccountRef: darajaAccountRef.trim(),
                darajaSecurityCredential: securityCredential.trim(),
                darajaInitiatorPassword: initiatorPassword.trim()
            })
        });
        return res.ok;
    } catch (e) { return false; }
  };

  const handleTestSTKPush = async () => {
      if (!testPhone) return;
      setIsTestingPayment(true);
      setCurrentAlert(null); // Clear previous alert
      try {
          await handleSaveAndSync();
          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber: testPhone, amount: 1 })
          });
          const data = await res.json();
          if (!data.success) {
              setCurrentAlert({ msg: data.message, timestamp: Date.now() });
          }
      } catch (e) {
          setCurrentAlert({ msg: "Server connection failed.", timestamp: Date.now() });
      } finally {
          setIsTestingPayment(false);
          fetchLogsAndAlerts();
      }
  };

  return (
    <div className="space-y-8 pb-20 relative">
      
      {/* Failure Alert Prompt */}
      {currentAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-4 border-red-500 transform transition-all scale-100">
                  <div className="bg-red-500 p-6 text-white text-center">
                      <i className="fas fa-exclamation-circle text-5xl mb-3"></i>
                      <h2 className="text-xl font-black uppercase tracking-widest">Transaction Failed</h2>
                  </div>
                  <div className="p-8">
                      <p className="text-gray-800 font-bold text-center mb-6 leading-relaxed">
                          {currentAlert.msg}
                      </p>
                      <button 
                        onClick={() => setCurrentAlert(null)}
                        className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl hover:bg-black transition shadow-lg active:scale-95 uppercase tracking-widest text-xs"
                      >
                        Dismiss Alert
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Real-time System Monitor Terminal */}
      <div className="bg-gray-950 rounded-2xl p-6 h-80 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                <p className="text-blue-400 text-xs uppercase tracking-[0.2em] font-black">M-Pesa API Live Monitor</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto text-xs leading-relaxed space-y-3 scrollbar-hide flex flex-col-reverse">
              <div ref={terminalEndRef} />
              {terminalLogs.length === 0 ? <p className="text-gray-700 italic text-center py-10"># Systems Online. Listening for production API activity...</p> : terminalLogs.map((log: any, i) => (
                  <div key={i} className={`p-3 rounded-lg border transition-all ${
                    log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 
                    log.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-900/30' : 
                    'bg-blue-950/10 text-blue-300 border-blue-900/20'
                  }`}>
                      <div className="flex justify-between items-start gap-4">
                          <span className="font-bold flex-1 flex gap-3">
                              <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                              <span>{log.msg}</span>
                          </span>
                      </div>
                  </div>
              ))}
          </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 p-8 border-b border-gray-200 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h2 className="text-2xl font-black text-gray-800 tracking-tight">Production Daraja Engine</h2>
                <p className="text-sm text-gray-500 mt-1">Status: <span className="text-green-600 font-bold uppercase">Connected to Safaricom Live</span></p>
            </div>
            <div className="flex bg-gray-200 p-1 rounded-xl">
                <button onClick={() => setDarajaEnv('sandbox')} className={`px-4 py-2 text-[10px] font-black rounded-lg transition ${darajaEnv === 'sandbox' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>SANDBOX</button>
                <button onClick={() => setDarajaEnv('production')} className={`px-4 py-2 text-[10px] font-black rounded-lg transition ${darajaEnv === 'production' ? 'bg-red-600 text-white' : 'text-gray-500'}`}>PRODUCTION</button>
            </div>
        </div>

        <div className="p-8 space-y-12">
            {/* Direct Transaction Initiation Test */}
            <section className="bg-red-50 p-8 rounded-3xl border border-red-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="max-w-md">
                        <h3 className="text-lg font-black text-red-800 flex items-center"><i className="fas fa-play-circle mr-3"></i> Manual Initiation Test</h3>
                        <p className="text-sm text-red-600 font-medium mt-2">Force trigger an STK Push to any number to verify the production channel.</p>
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row gap-4">
                        <input 
                            type="text" 
                            value={testPhone} 
                            onChange={e => setTestPhone(e.target.value)} 
                            className="flex-1 border-2 border-red-200 p-4 rounded-2xl text-base font-black focus:border-red-600 outline-none transition-all"
                            placeholder="Recipient Phone Number"
                        />
                        <button 
                            onClick={handleTestSTKPush} 
                            disabled={isTestingPayment}
                            className="bg-gray-900 text-white px-10 py-4 rounded-2xl font-black text-xs hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:bg-gray-400"
                        >
                            {isTestingPayment ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                            PUSH TEST PAYMENT
                        </button>
                    </div>
                </div>
            </section>

            {/* Credential Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">Business Shortcode</label>
                    <input type="text" value={darajaShortcode} readOnly className="w-full bg-gray-100 border p-4 rounded-2xl text-base font-black text-red-600 outline-none" />
                </div>
                <div className="lg:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">M-Pesa Consumer Key</label>
                    <input type="text" value={darajaKey} readOnly className="w-full bg-gray-100 border p-4 rounded-2xl text-xs font-mono outline-none" />
                </div>
                <div className="lg:col-span-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">Security Credential (RSA Public Key)</label>
                    <textarea value={securityCredential} readOnly className="w-full bg-gray-100 border p-4 rounded-2xl text-[9px] font-mono h-20 resize-none outline-none text-gray-500" />
                </div>
            </section>

            <button onClick={handleSaveAndSync} className="w-full py-6 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 shadow-2xl transition-all transform active:scale-[0.98] uppercase tracking-[0.3em] text-sm">
                Deploy & Reload Production Engine
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
