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

  // Test Phone State
  const [testPhone, setTestPhone] = useState('0712345678');

  // UI State
  const [isTestingPayment, setIsTestingPayment] = useState(false);
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [currentCheckoutId, setCurrentCheckoutId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [terminalLogs, setTerminalLogs] = useState<{msg: string, type: 'info' | 'error' | 'success'}[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const addTerminalLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
      setTerminalLogs(prev => [...prev, { msg, type }]);
  };

  useEffect(() => {
      if (terminalEndRef.current) {
          terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [terminalLogs]);

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
              addTerminalLog(`System Loaded: Using ${data.darajaEnv.toUpperCase()} M-Pesa credentials for Shortcode ${data.darajaShortcode}.`, 'info');
          });
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
                darajaSecurityCredential: securityCredential.trim()
            })
        });
        if (res.ok) {
            addTerminalLog('✅ Credentials saved and synced with server.', 'success');
            return true;
        }
    } catch (e: any) { addTerminalLog(`Sync Error: ${e.message}`, 'error'); }
    return false;
  };

  const handleTestAuth = async () => {
      setIsTestingAuth(true);
      addTerminalLog(`Testing ${darajaEnv.toUpperCase()} Authentication...`, 'info');
      try {
          await handleSaveAndSync();
          const res = await fetch('/api/daraja/test-auth');
          const data = await res.json();
          if (res.ok && data.success) {
              addTerminalLog(`🚀 Safaricom Auth Success: ${data.message}`, 'success');
          } else {
              addTerminalLog(`❌ Auth Failed: ${data.error || 'Check Consumer Key/Secret'}`, 'error');
          }
      } catch (e: any) { addTerminalLog(`Auth Error: ${e.message}`, 'error'); }
      finally { setIsTestingAuth(false); }
  };

  const handleTestSTKPush = async () => {
      if (!testPhone) {
          addTerminalLog("Please enter a phone number to test.", "error");
          return;
      }
      setIsTestingPayment(true);
      addTerminalLog(`Initiating STK Push to ${testPhone}...`, 'info');
      try {
          const synced = await handleSaveAndSync();
          if (!synced) return;

          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber: testPhone, amount: 1 })
          });
          const data = await res.json();
          if (data.success) {
              setCurrentCheckoutId(data.checkoutRequestId);
              addTerminalLog(`STK Prompts Sent! ID: ${data.checkoutRequestId}`, 'success');
          } else {
              addTerminalLog(`Payment Initiation Failed: ${data.message}`, 'error');
              if (data.error) addTerminalLog(`Error Code: ${data.error}`, 'error');
          }
      } catch (e: any) { addTerminalLog(`Internal Error: ${e.message}`, 'error'); }
      finally { setIsTestingPayment(false); }
  };

  const handleCheckStatus = async () => {
      if (!currentCheckoutId) return;
      try {
          const res = await fetch(`/api/payment/status/${currentCheckoutId}`);
          const data = await res.json();
          setPaymentStatus(data);
          addTerminalLog(`Current Status: ${data.status} - ${data.message}`, data.status === 'COMPLETED' ? 'success' : 'info');
      } catch (e: any) { addTerminalLog(`Status Error: ${e.message}`, 'error'); }
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Terminal Display */}
      <div className="bg-black rounded-xl p-4 h-64 flex flex-col border border-gray-800 shadow-2xl font-mono overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <p className="text-blue-400 text-[10px] uppercase tracking-widest font-bold">Daraja System Monitor</p>
            <button onClick={() => setTerminalLogs([])} className="text-[10px] text-gray-500 hover:text-white uppercase">Clear Console</button>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-tight space-y-1 scrollbar-hide">
              {terminalLogs.length === 0 ? <p className="text-gray-700 italic"># Waiting for API activity...</p> : terminalLogs.map((log, i) => (
                  <div key={i} className={`whitespace-pre-wrap ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}`}>
                      <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>{log.msg}
                  </div>
              ))}
              <div ref={terminalEndRef} />
          </div>
      </div>

      {/* Configuration Hub */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 p-6 border-b border-gray-200 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-gray-800">Production Integration</h2>
                <p className="text-xs text-gray-500">Connected to Safaricom Daraja Production API</p>
            </div>
            <div className="flex bg-gray-200 p-1 rounded-lg">
                <button onClick={() => setDarajaEnv('sandbox')} className={`px-3 py-1 text-[10px] font-bold rounded transition ${darajaEnv === 'sandbox' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>SANDBOX</button>
                <button onClick={() => setDarajaEnv('production')} className={`px-3 py-1 text-[10px] font-bold rounded transition ${darajaEnv === 'production' ? 'bg-red-600 text-white' : 'text-gray-500'}`}>LIVE PRODUCTION</button>
            </div>
        </div>

        <div className="p-6 space-y-10">
            {/* WhatsApp Section */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center"><i className="fab fa-whatsapp mr-2 text-green-600 text-lg"></i> WhatsApp Messaging</h3>
                    <p className="text-[10px] text-gray-500 mt-1">Connect your Evolution API instance to Martha AI.</p>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Evolution Base URL</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full border p-2 rounded text-xs bg-gray-50" placeholder="https://api.example.com" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Instance Name</label>
                        <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full border p-2 rounded text-xs font-bold" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">API Key / Token</label>
                        <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full border p-2 rounded text-xs" />
                    </div>
                </div>
            </section>

            {/* M-Pesa Daraja Section */}
            <section className={`grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-xl transition-all border ${darajaEnv === 'production' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className="md:col-span-1">
                    <h3 className={`text-sm font-bold flex items-center ${darajaEnv === 'production' ? 'text-red-800' : 'text-blue-800'}`}>
                        <i className="fas fa-credit-card mr-2"></i> Daraja Lipa na M-Pesa
                    </h3>
                    
                    <div className="mt-4 p-3 bg-white/70 rounded-lg border border-white backdrop-blur-sm">
                        <button 
                            onClick={handleTestAuth} 
                            disabled={isTestingAuth}
                            className={`w-full py-2 mb-4 rounded text-[10px] font-bold transition flex items-center justify-center gap-2 ${isTestingAuth ? 'bg-gray-300' : 'bg-white border border-gray-300 hover:bg-gray-50 shadow-sm'}`}
                        >
                            {isTestingAuth ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-shield-alt"></i>}
                            VALIDATE API ACCESS
                        </button>

                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Test Push Phone</label>
                        <input 
                            type="text" 
                            value={testPhone} 
                            onChange={e => setTestPhone(e.target.value)} 
                            className="w-full border p-2 rounded text-sm font-bold mb-3 focus:border-red-500 outline-none"
                            placeholder="07XXXXXXXX"
                        />
                        <div className="flex gap-2">
                            <button onClick={handleTestSTKPush} disabled={isTestingPayment} className="flex-1 py-2 bg-gray-900 text-white text-[10px] font-bold rounded hover:bg-black transition shadow-md">PUSH STK</button>
                            <button onClick={handleCheckStatus} disabled={!currentCheckoutId} className="flex-1 py-2 border border-gray-300 text-[10px] font-bold rounded hover:bg-white transition bg-white">STATUS</button>
                        </div>
                    </div>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Consumer Key</label>
                        <input type="text" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full border p-2 rounded text-xs font-mono" placeholder="Provided Key" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Consumer Secret</label>
                        <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full border p-2 rounded text-xs font-mono" placeholder="Provided Secret" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Payment Method</label>
                        <select 
                            value={darajaType} 
                            onChange={e => setDarajaType(e.target.value as any)} 
                            className="w-full border p-2 rounded text-xs font-bold bg-white"
                        >
                            <option value="Paybill">M-Pesa Paybill</option>
                            <option value="Till">Lipa na M-Pesa Till</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Business Shortcode</label>
                        <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full border p-2 rounded text-xs font-bold" placeholder="5512238" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Account Reference</label>
                        <input type="text" value={darajaAccountRef} onChange={e => setDarajaAccountRef(e.target.value)} className="w-full border p-2 rounded text-xs font-bold border-orange-200" placeholder="ENA_COACH" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">M-Pesa Passkey</label>
                        <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full border p-2 rounded text-xs font-mono" placeholder="Provided Passkey" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Security Credential (Encrypted)</label>
                        <textarea 
                          value={securityCredential} 
                          onChange={e => setSecurityCredential(e.target.value)} 
                          className="w-full border p-2 rounded text-[10px] font-mono h-16 bg-gray-50 resize-none" 
                          placeholder="Security Credential for advanced operations..."
                        ></textarea>
                    </div>
                </div>
            </section>

            <button onClick={handleSaveAndSync} className="w-full py-5 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 shadow-xl transition-all transform active:scale-[0.98] uppercase tracking-widest">
                <i className="fas fa-save mr-2"></i> DEPLOY PRODUCTION ENVIRONMENT
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;
