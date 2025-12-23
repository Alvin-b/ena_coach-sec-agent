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
  const [darajaEnv, setDarajaEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [darajaType, setDarajaType] = useState<'Paybill' | 'Till'>('Paybill');
  const [darajaKey, setDarajaKey] = useState('');
  const [darajaSecret, setDarajaSecret] = useState('');
  const [darajaPasskey, setDarajaPasskey] = useState('');
  const [darajaShortcode, setDarajaShortcode] = useState('');
  const [darajaAccountRef, setDarajaAccountRef] = useState('ENA_COACH');

  // UI State
  const [isTestingPayment, setIsTestingPayment] = useState(false);
  const [currentCheckoutId, setCurrentCheckoutId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [terminalLogs, setTerminalLogs] = useState<{msg: string, type: 'info' | 'error' | 'success'}[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);

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
              setDarajaEnv(data.darajaEnv || 'sandbox');
              setDarajaType(data.darajaType || 'Paybill');
              setDarajaKey(data.darajaKey || '');
              setDarajaSecret(data.darajaSecret || '');
              setDarajaPasskey(data.darajaPasskey || '');
              setDarajaShortcode(data.darajaShortcode || '');
              setDarajaAccountRef(data.darajaAccountRef || 'ENA_COACH');
          });

      const interval = setInterval(() => {
          fetch('/api/debug/webhook-logs').then(res => res.json()).then(setWebhookLogs).catch(() => {});
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  const handleSaveAndSync = async () => {
    try {
        const res = await fetch('/api/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                evolutionUrl: apiUrl, 
                evolutionToken: apiToken, 
                instanceName, 
                apiKey: geminiKey,
                darajaEnv,
                darajaType,
                darajaKey,
                darajaSecret,
                darajaPasskey,
                darajaShortcode,
                darajaAccountRef
            })
        });
        if (res.ok) {
            addTerminalLog('✅ Credentials synchronized with server.', 'success');
        }
    } catch (e: any) { addTerminalLog(`Sync Error: ${e.message}`, 'error'); }
  };

  const handleTestSTKPush = async () => {
      setIsTestingPayment(true);
      addTerminalLog(`Initiating STK Push (${darajaEnv.toUpperCase()})...`, 'info');
      try {
          await handleSaveAndSync();
          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber: '254712345678', amount: 1 })
          });
          const data = await res.json();
          if (data.success) {
              setCurrentCheckoutId(data.checkoutRequestId);
              addTerminalLog(`STK Sent! ID: ${data.checkoutRequestId}`, 'success');
          } else {
              addTerminalLog(`Error: ${data.message}`, 'error');
          }
      } catch (e: any) { addTerminalLog(`Error: ${e.message}`, 'error'); }
      finally { setIsTestingPayment(false); }
  };

  const handleCheckStatus = async () => {
      if (!currentCheckoutId) return;
      try {
          const res = await fetch(`/api/payment/status/${currentCheckoutId}`);
          const data = await res.json();
          setPaymentStatus(data);
          addTerminalLog(`Status: ${data.status} - ${data.message}`, data.status === 'COMPLETED' ? 'success' : 'info');
      } catch (e: any) { addTerminalLog(`Status Error: ${e.message}`, 'error'); }
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Terminal Display */}
      <div className="bg-black rounded-xl p-4 h-64 flex flex-col border border-gray-800 shadow-2xl font-mono">
          <div className="flex justify-between items-center mb-2">
            <p className="text-blue-400 text-[10px] uppercase tracking-widest font-bold">Systems Integration Terminal</p>
            <button onClick={() => setTerminalLogs([])} className="text-[10px] text-gray-500 hover:text-white">Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-tight space-y-1 scrollbar-hide">
              {terminalLogs.length === 0 ? <p className="text-gray-700 italic"># Monitoring API activity...</p> : terminalLogs.map((log, i) => (
                  <div key={i} className={`whitespace-pre-wrap ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-300'}`}>
                      <span className="text-gray-600 mr-2">&gt;</span>{log.msg}
                  </div>
              ))}
              <div ref={terminalEndRef} />
          </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 p-6 border-b border-gray-200 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-gray-800">Integration Hub</h2>
                <p className="text-xs text-gray-500">Manage Production APIs and Credentials</p>
            </div>
            <div className="flex bg-gray-200 p-1 rounded-lg">
                <button onClick={() => setDarajaEnv('sandbox')} className={`px-3 py-1 text-[10px] font-bold rounded ${darajaEnv === 'sandbox' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>SANDBOX</button>
                <button onClick={() => setDarajaEnv('production')} className={`px-3 py-1 text-[10px] font-bold rounded ${darajaEnv === 'production' ? 'bg-red-600 text-white' : 'text-gray-500'}`}>LIVE</button>
            </div>
        </div>

        <div className="p-6 space-y-10">
            {/* WhatsApp */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center"><i className="fab fa-whatsapp mr-2 text-green-600"></i> WhatsApp API</h3>
                    <p className="text-[10px] text-gray-500 mt-1">Configure Evolution API for user interactions.</p>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Base URL</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full border p-2 rounded text-xs" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Instance</label>
                        <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full border p-2 rounded text-xs font-bold" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Token</label>
                        <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full border p-2 rounded text-xs" />
                    </div>
                </div>
            </section>

            {/* Daraja */}
            <section className={`grid grid-cols-1 md:grid-cols-3 gap-6 p-4 rounded-xl transition-colors ${darajaEnv === 'production' ? 'bg-red-50 border border-red-100' : 'bg-blue-50 border border-blue-100'}`}>
                <div className="md:col-span-1">
                    <h3 className={`text-sm font-bold flex items-center ${darajaEnv === 'production' ? 'text-red-800' : 'text-blue-800'}`}>
                        <i className="fas fa-money-check-alt mr-2"></i> M-Pesa {darajaEnv.toUpperCase()}
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1">Set to <b>LIVE</b> to receive real money.</p>
                    <div className="mt-4 flex gap-2">
                        <button onClick={handleTestSTKPush} disabled={isTestingPayment} className="flex-1 py-2 bg-gray-900 text-white text-[10px] font-bold rounded hover:bg-black transition">TEST STK</button>
                        <button onClick={handleCheckStatus} disabled={!currentCheckoutId} className="flex-1 py-2 border border-gray-300 text-[10px] font-bold rounded hover:bg-white transition">STATUS</button>
                    </div>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Consumer Key</label>
                        <input type="text" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full border p-2 rounded text-xs font-mono" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Consumer Secret</label>
                        <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full border p-2 rounded text-xs font-mono" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Payment Method</label>
                        <select 
                            value={darajaType} 
                            onChange={e => setDarajaType(e.target.value as any)} 
                            className="w-full border p-2 rounded text-xs font-bold bg-white"
                        >
                            <option value="Paybill">Paybill (KCB/Equity/etc)</option>
                            <option value="Till">Buy Goods (Till Number)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Shortcode (Number)</label>
                        <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full border p-2 rounded text-xs font-bold" placeholder="e.g. 522522" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Account Ref (KCB Account)</label>
                        <input type="text" value={darajaAccountRef} onChange={e => setDarajaAccountRef(e.target.value)} className="w-full border p-2 rounded text-xs font-bold" placeholder="Your Bank Acc No" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Passkey</label>
                        <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full border p-2 rounded text-xs font-mono" />
                    </div>
                </div>
            </section>

            <button onClick={handleSaveAndSync} className="w-full py-4 bg-gray-900 text-white font-black rounded-lg hover:bg-black shadow-xl transition-all transform active:scale-[0.98]">
                SAVE & DEPLOY LIVE SETTINGS
            </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;