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

  // Test Phone State
  const [testPhone, setTestPhone] = useState('0712345678');

  // UI State
  const [isTestingPayment, setIsTestingPayment] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<{msg: string, timestamp: number} | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<any[]>([]);
  const [lastCheckoutId, setLastCheckoutId] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchLogsAndAlerts = async () => {
      try {
          const logRes = await fetch('/api/debug/system-logs');
          if (logRes.ok) {
              const logs = await logRes.json();
              setTerminalLogs(logs);
          }

          const errRes = await fetch('/api/debug/latest-error');
          if (errRes.ok) {
              const errorData = await errRes.json();
              if (errorData && errorData.msg) {
                  setCurrentAlert({ msg: errorData.msg, timestamp: errorData.timestamp });
              }
          }
      } catch (e) {
          console.debug("Polling paused.");
      }
  };

  useEffect(() => {
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
      
      const poll = setInterval(fetchLogsAndAlerts, 5000);
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
                darajaStoreNumber: darajaStoreNumber.trim(),
                darajaAccountRef: darajaAccountRef.trim(),
                darajaCallbackUrl: darajaCallbackUrl.trim()
            })
        });
        return res.ok;
    } catch (e) { return false; }
  };

  const handleTestSTKPush = async () => {
      if (!testPhone) return;
      setIsTestingPayment(true);
      setCurrentAlert(null); 
      try {
          await handleSaveAndSync();
          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber: testPhone, amount: 1 })
          });
          const data = await res.json();
          if (data.success) {
              setLastCheckoutId(data.checkoutRequestId);
          } else {
              setCurrentAlert({ msg: data.message, timestamp: Date.now() });
          }
      } catch (e) {
          setCurrentAlert({ msg: "Server Connection Error.", timestamp: Date.now() });
      } finally {
          setIsTestingPayment(false);
          fetchLogsAndAlerts();
      }
  };

  const checkPaymentStatus = async () => {
      if (!lastCheckoutId) return;
      setIsCheckingStatus(true);
      try {
          const res = await fetch(`/api/payment/status/${lastCheckoutId}`);
          const data = await res.json();
          alert(`M-Pesa Verification:\nStatus: ${data.status}\nMessage: ${data.message}`);
          fetchLogsAndAlerts();
      } catch (e) {}
      finally { setIsCheckingStatus(false); }
  };

  return (
    <div className="space-y-8 pb-20 relative">
      
      {/* Alert Overlay */}
      {currentAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border-4 border-red-500">
                  <div className="bg-red-500 p-8 text-white text-center">
                      <i className="fas fa-exclamation-triangle text-7xl mb-4"></i>
                      <h2 className="text-2xl font-black uppercase tracking-widest">Setup Issue</h2>
                  </div>
                  <div className="p-8">
                      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 mb-6 text-center">
                        <p className="text-red-900 font-bold text-sm leading-relaxed">
                            {currentAlert.msg}
                        </p>
                      </div>
                      <p className="text-gray-500 text-[10px] mb-6 text-center italic">
                        Tip: If logs say "Accepted" but phone doesn't ring, verify your **Till Number** (PartyB) is correct.
                      </p>
                      <button 
                        onClick={() => setCurrentAlert(null)}
                        className="w-full py-5 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition shadow-lg active:scale-95 uppercase tracking-widest text-xs"
                      >
                        Got it
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Terminal Display */}
      <div className="bg-[#0b0b0e] rounded-[2.5rem] p-8 h-96 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></span>
                <p className="text-blue-400 text-xs uppercase tracking-[0.3em] font-black">Lipa Na M-Pesa Live Traffic</p>
            </div>
            {lastCheckoutId && (
                <button 
                  onClick={checkPaymentStatus}
                  className="text-[10px] text-blue-400 border border-blue-900/40 px-4 py-2 rounded-full font-black hover:bg-blue-900/20 transition uppercase"
                >
                    {isCheckingStatus ? 'QUERYING...' : `CHECK STATUS: ${lastCheckoutId.substring(0, 8)}...`}
                </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed space-y-4 scrollbar-hide flex flex-col-reverse">
              <div ref={terminalEndRef} />
              {terminalLogs.length === 0 ? <p className="text-gray-700 italic text-center py-20"># Standing by for production events...</p> : terminalLogs.map((log: any, i) => (
                  <div key={i} className={`p-4 rounded-xl border transition-all ${
                    log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/30' : 
                    log.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-900/30' : 
                    'bg-blue-950/10 text-blue-300 border-blue-900/20'
                  }`}>
                      <div className="flex justify-between items-start gap-4">
                          <span className="font-bold flex-1">
                              <span className="opacity-30 mr-3">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                              <span>{log.msg}</span>
                          </span>
                      </div>
                  </div>
              ))}
          </div>
      </div>

      {/* Config Hub */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 p-10 border-b border-gray-200 flex flex-col xl:flex-row justify-between items-center gap-8">
            <div className="text-center xl:text-left">
                <h2 className="text-3xl font-black text-gray-950 tracking-tight tracking-widest uppercase">Daraja Engine Hub</h2>
                <p className="text-sm text-gray-500 mt-2 font-medium">Shortcode (Store): <span className="text-red-600 font-black">{darajaShortcode}</span></p>
            </div>
            <div className="flex bg-gray-200 p-2 rounded-2xl shadow-inner">
                <div className="flex bg-white rounded-xl shadow-sm p-1">
                    <button onClick={() => setDarajaType('Till')} className={`px-6 py-3 text-xs font-black rounded-lg transition ${darajaType === 'Till' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400'}`}>BUY GOODS (TILL)</button>
                    <button onClick={() => setDarajaType('Paybill')} className={`px-6 py-3 text-xs font-black rounded-lg transition ${darajaType === 'Paybill' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400'}`}>PAYBILL</button>
                </div>
            </div>
        </div>

        <div className="p-10 space-y-12">
            
            {/* Payment Diagnostic */}
            <section className="bg-red-50/50 p-10 rounded-[2.5rem] border-2 border-dashed border-red-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                    <div className="max-w-md">
                        <h3 className="text-xl font-black text-red-900 flex items-center"><i className="fas fa-satellite-dish mr-3 text-red-600"></i> Production Handshake</h3>
                        <p className="text-sm text-red-700/70 font-bold mt-2 leading-relaxed">Send a live prompt to your phone. If it doesn't appear, ensure **Actual Till Number** matches your green poster.</p>
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row gap-4">
                        <input 
                            type="text" 
                            value={testPhone} 
                            onChange={e => setTestPhone(e.target.value)} 
                            className="flex-1 bg-white border-2 border-red-100 p-5 rounded-2xl text-lg font-black text-gray-900 focus:border-red-600 outline-none"
                            placeholder="Phone (254...)"
                        />
                        <button 
                            onClick={handleTestSTKPush} 
                            disabled={isTestingPayment}
                            className="bg-gray-950 text-white px-12 py-5 rounded-2xl font-black text-xs hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
                        >
                            {isTestingPayment ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            PUSH TEST
                        </button>
                    </div>
                </div>
            </section>

            {/* Credential Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Store Number (BusinessShortCode)</label>
                    <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-black text-red-600 outline-none" placeholder="e.g. 5512238" />
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Actual Till Number (PartyB)</label>
                    <input type="text" value={darajaStoreNumber} onChange={e => setDarajaStoreNumber(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-sm font-black text-gray-800 outline-none" placeholder="Enter Till Number (e.g. 4159923)" />
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Verified Production Passkey</label>
                    <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-xs font-mono outline-none" />
                </div>
                <div className="lg:col-span-3 space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Consumer Key (Live)</label>
                    <input type="text" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-xs font-mono outline-none" />
                </div>
                <div className="lg:col-span-3 space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Consumer Secret (Live)</label>
                    <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-5 rounded-2xl text-xs font-mono outline-none" />
                </div>
            </section>

            <button onClick={handleSaveAndSync} className="w-full py-8 bg-red-600 text-white font-black rounded-3xl hover:bg-red-700 shadow-2xl transition-all transform active:scale-95 uppercase tracking-[0.4em] text-sm">
                Apply Production Settings
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
