import React, { useState, useEffect, useRef } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

const WhatsAppConfig: React.FC = () => {
  const { whatsappConfig, saveWhatsAppConfig } = useMockBackend();

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
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [currentCheckoutId, setCurrentCheckoutId] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<{msg: string, type: 'info' | 'error' | 'success', timestamp: string}[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
      try {
          const res = await fetch('/api/debug/system-logs');
          const data = await res.json();
          setTerminalLogs(data);
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
      
      const poll = setInterval(fetchLogs, 3000);
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
        if (res.ok) {
            return true;
        }
    } catch (e: any) {}
    return false;
  };

  const handleTestAuth = async () => {
      setIsTestingAuth(true);
      try {
          await handleSaveAndSync();
          const res = await fetch('/api/daraja/test-auth');
          const data = await res.json();
          if (res.ok) fetchLogs();
      } catch (e: any) {}
      finally { setIsTestingAuth(false); }
  };

  const handleTestSTKPush = async () => {
      if (!testPhone) return;
      setIsTestingPayment(true);
      try {
          await handleSaveAndSync();
          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber: testPhone, amount: 1 })
          });
          const data = await res.json();
          if (data.success) {
              setCurrentCheckoutId(data.checkoutRequestId);
          }
          fetchLogs();
      } catch (e: any) {}
      finally { setIsTestingPayment(false); }
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Real-time System Monitor Terminal */}
      <div className="bg-gray-950 rounded-2xl p-6 h-80 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                <p className="text-blue-400 text-xs uppercase tracking-[0.2em] font-black">Lipa na M-Pesa Live System Monitor</p>
            </div>
            <button className="text-[10px] text-gray-500 hover:text-white uppercase font-bold tracking-widest border border-gray-800 px-3 py-1 rounded-full">Reset Engine</button>
          </div>
          <div className="flex-1 overflow-y-auto text-xs leading-relaxed space-y-3 scrollbar-hide flex flex-col-reverse">
              <div ref={terminalEndRef} />
              {terminalLogs.length === 0 ? <p className="text-gray-700 italic text-center py-10"># Systems idle. Listening for M-Pesa API activity...</p> : terminalLogs.map((log: any, i) => (
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
                          <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded ${
                            log.type === 'error' ? 'bg-red-500 text-white' : 
                            log.type === 'success' ? 'bg-green-500 text-white' : 
                            'bg-blue-500 text-white'
                          }`}>{log.type}</span>
                      </div>
                  </div>
              ))}
          </div>
      </div>

      {/* Main Configuration Interface */}
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-white p-8 border-b border-gray-200 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
                <h2 className="text-2xl font-black text-gray-800 tracking-tight">Daraja Production Engine</h2>
                <p className="text-sm text-gray-500 mt-1">Managing Live Payments for Till Number <span className="text-red-600 font-black">{darajaShortcode}</span></p>
            </div>
            <div className="flex bg-gray-100 p-1.5 rounded-2xl shadow-inner">
                <button onClick={() => setDarajaEnv('sandbox')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all duration-300 ${darajaEnv === 'sandbox' ? 'bg-white shadow-lg text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>SANDBOX</button>
                <button onClick={() => setDarajaEnv('production')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all duration-300 ${darajaEnv === 'production' ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'text-gray-400 hover:text-gray-600'}`}>PRODUCTION</button>
            </div>
        </div>

        <div className="p-8 space-y-12">
            
            {/* Payment Diagnostic Center */}
            <section className="bg-red-50/50 p-8 rounded-3xl border border-red-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <i className="fas fa-credit-card text-8xl text-red-900"></i>
                </div>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative z-10">
                    <div className="max-w-md">
                        <h3 className="text-lg font-black text-red-800 flex items-center"><i className="fas fa-vial mr-3"></i> System Diagnostic</h3>
                        <p className="text-sm text-red-600/80 mt-2 font-medium leading-relaxed">Instantly verify that your production keys are valid by triggering a real KES 1 prompt to your phone.</p>
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row gap-4">
                        <input 
                            type="text" 
                            value={testPhone} 
                            onChange={e => setTestPhone(e.target.value)} 
                            className="flex-1 bg-white border-2 border-red-200 p-4 rounded-2xl text-base font-black text-gray-800 focus:border-red-600 focus:ring-4 focus:ring-red-100 outline-none transition-all"
                            placeholder="Recipient Phone (e.g. 0712...)"
                        />
                        <button 
                            onClick={handleTestSTKPush} 
                            disabled={isTestingPayment}
                            className="bg-gray-900 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:bg-gray-400"
                        >
                            {isTestingPayment ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-rocket"></i>}
                            RUN DIAGNOSTIC
                        </button>
                    </div>
                </div>
            </section>

            {/* Credential Matrix */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Consumer Key</label>
                    <input type="text" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-xs font-mono focus:bg-white focus:border-blue-500 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Consumer Secret</label>
                    <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-xs font-mono focus:bg-white focus:border-blue-500 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Business Shortcode (Till)</label>
                    <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full border-2 border-red-100 bg-white p-4 rounded-2xl text-base font-black text-red-600 outline-none" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">M-Pesa Online Passkey</label>
                    <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-xs font-mono outline-none" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Initiator Password</label>
                    <input type="password" value={initiatorPassword} onChange={e => setInitiatorPassword(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-xs font-mono outline-none" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Payment Type</label>
                    <select value={darajaType} onChange={e => setDarajaType(e.target.value as any)} className="w-full border border-gray-200 bg-gray-50 p-4 rounded-2xl text-xs font-black outline-none appearance-none">
                        <option value="Till">Lipa na M-Pesa Buy Goods (Till)</option>
                        <option value="Paybill">M-Pesa Paybill</option>
                    </select>
                </div>
                <div className="col-span-1 md:col-span-2 lg:col-span-3 space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Security Credential (RSA Encrypted)</label>
                    <textarea 
                      value={securityCredential} 
                      onChange={e => setSecurityCredential(e.target.value)} 
                      className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-[10px] font-mono h-24 resize-none outline-none focus:bg-white focus:border-blue-500" 
                      placeholder="Public Key provided by Safaricom..."
                    ></textarea>
                </div>
            </section>

            <button onClick={handleSaveAndSync} className="w-full py-6 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 shadow-[0_15px_30px_rgba(220,38,38,0.3)] hover:shadow-[0_20px_40px_rgba(220,38,38,0.4)] transition-all transform active:scale-[0.98] uppercase tracking-[0.3em] text-sm flex items-center justify-center gap-4">
                <i className="fas fa-shield-check text-xl"></i>
                DEPLOY LIVE PRODUCTION ENVIRONMENT
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
