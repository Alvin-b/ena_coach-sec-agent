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
  const [darajaKey, setDarajaKey] = useState('');
  const [darajaSecret, setDarajaSecret] = useState('');
  const [darajaPasskey, setDarajaPasskey] = useState('');
  const [darajaShortcode, setDarajaShortcode] = useState('');

  // Payment Testing State
  const [testPhone, setTestPhone] = useState('254712345678');
  const [testAmount, setTestAmount] = useState('1');
  const [isTestingPayment, setIsTestingPayment] = useState(false);
  const [currentCheckoutId, setCurrentCheckoutId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [terminalLogs, setTerminalLogs] = useState<{msg: string, type: 'info' | 'error' | 'success'}[]>([]);

  // UI State
  const [logs, setLogs] = useState<string[]>([]);
  const [simPhone, setSimPhone] = useState('254712345678');
  const [simMessage, setSimMessage] = useState('I want to book a bus to Kisumu');
  const [simLoading, setSimLoading] = useState(false);
  const [debugMessages, setDebugMessages] = useState<any[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
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
              setDarajaKey(data.darajaKey || '');
              setDarajaSecret(data.darajaSecret || '');
              setDarajaPasskey(data.darajaPasskey || '');
              setDarajaShortcode(data.darajaShortcode || '');
          });

      const interval = setInterval(() => {
          fetch('/api/debug/messages').then(res => res.json()).then(setDebugMessages).catch(() => {});
          fetch('/api/debug/webhook-logs').then(res => res.json()).then(setWebhookLogs).catch(() => {});
      }, 2500);
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
                darajaKey,
                darajaSecret,
                darajaPasskey,
                darajaShortcode
            })
        });
        if (res.ok) {
            saveWhatsAppConfig({ apiUrl, apiToken, instanceName });
            addLog('✅ All system credentials synced to server.');
        } else {
            addLog('❌ Sync failed.');
        }
    } catch (e: any) { addLog(`Error syncing: ${e.message}`); }
  };

  const handleTestSTKPush = async () => {
      if (!testPhone) return;
      setIsTestingPayment(true);
      addTerminalLog(`Initiating STK Push to ${testPhone} for KES ${testAmount}...`, 'info');
      
      try {
          // First sync credentials to be sure
          await handleSaveAndSync();
          
          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber: testPhone, amount: Number(testAmount) })
          });
          const data = await res.json();
          
          if (data.success) {
              setCurrentCheckoutId(data.checkoutRequestId);
              addTerminalLog(`STK Push Accepted! CheckoutID: ${data.checkoutRequestId}`, 'success');
              addTerminalLog(`Safaricom Response: ${JSON.stringify(data.raw, null, 2)}`, 'info');
          } else {
              addTerminalLog(`STK Push Failed: ${data.error || 'Unknown Error'}`, 'error');
              addTerminalLog(`Details: ${data.message}`, 'error');
              if (data.raw) addTerminalLog(`Raw Response: ${JSON.stringify(data.raw, null, 2)}`, 'error');
          }
      } catch (e: any) {
          addTerminalLog(`API Error: ${e.message}`, 'error');
      } finally {
          setIsTestingPayment(false);
      }
  };

  const handleCheckStatus = async () => {
      if (!currentCheckoutId) return;
      addTerminalLog(`Checking status for ${currentCheckoutId}...`, 'info');
      
      try {
          const res = await fetch(`/api/payment/status/${currentCheckoutId}`);
          const data = await res.json();
          setPaymentStatus(data);
          
          if (data.status === 'COMPLETED') {
              addTerminalLog(`Payment Completed! ${data.message}`, 'success');
          } else if (data.status === 'FAILED') {
              addTerminalLog(`Payment Failed: ${data.message}`, 'error');
          } else {
              addTerminalLog(`Current Status: ${data.status} - ${data.message}`, 'info');
          }
          
          if (data.raw) {
              addTerminalLog(`Raw Status: ${JSON.stringify(data.raw, null, 2)}`, 'info');
          }
      } catch (e: any) {
          addTerminalLog(`Status Check Error: ${e.message}`, 'error');
      }
  };

  const handleSimulateWebhook = async () => {
      if (!simMessage) return;
      setSimLoading(true);
      await handleSaveAndSync();

      const payload = {
          type: "messages.upsert",
          data: {
              key: { remoteJid: `${simPhone}@s.whatsapp.net`, fromMe: false, id: "SIM-" + Date.now() },
              pushName: "Test Customer",
              message: { conversation: simMessage }
          }
      };

      try {
          const res = await fetch('/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (res.ok) addLog(`Simulated: "${simMessage}"`);
      } catch (e: any) { addLog(`Simulator Error: ${e.message}`); }
      finally { setSimLoading(false); }
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* 1. Traffic Monitor */}
      <div className="bg-gray-900 text-green-400 p-6 rounded-lg shadow-xl border border-gray-700">
         <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
             <span className="flex items-center"><i className="fas fa-terminal mr-2"></i> Live Webhook Monitor</span>
             <span className="text-[10px] text-gray-500 uppercase tracking-widest animate-pulse">Monitoring Webhook Traffic</span>
         </h2>
         <div className="h-40 overflow-y-auto font-mono text-xs space-y-1 scrollbar-hide">
             {webhookLogs.length === 0 ? <p className="text-gray-600 italic">// No incoming traffic detected yet...</p> : webhookLogs.map((log, i) => (
                 <div key={i} className="border-b border-gray-800 pb-1 flex justify-between">
                     <span className="text-white">Customer: {log.content}</span>
                     <span className="text-gray-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                 </div>
             ))}
         </div>
      </div>

      {/* 2. Financial API Connectivity Tester */}
      <div className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm relative overflow-hidden">
         <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
         <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
             <i className="fas fa-money-bill-transfer text-blue-600 mr-2"></i> Financial API Tester (Daraja)
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Test Phone</label>
                        <input type="text" value={testPhone} onChange={e => setTestPhone(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50 focus:bg-white outline-none focus:ring-1 focus:ring-blue-400" placeholder="254..." />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Amount (KES)</label>
                        <input type="number" value={testAmount} onChange={e => setTestAmount(e.target.value)} className="w-full border p-2 rounded text-sm bg-gray-50 focus:bg-white outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={handleTestSTKPush} disabled={isTestingPayment} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg transition transform active:scale-95 disabled:bg-gray-300">
                        {isTestingPayment ? 'Requesting...' : 'Initiate Test STK'}
                    </button>
                    <button onClick={handleCheckStatus} disabled={!currentCheckoutId} className="flex-1 py-3 border border-blue-600 text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition transform active:scale-95 disabled:border-gray-300 disabled:text-gray-300">
                        Verify Status
                    </button>
                 </div>
                 
                 <div className="p-3 bg-gray-50 rounded border border-gray-100">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Checkout Info</h4>
                    <p className="text-xs font-mono text-gray-600 truncate">{currentCheckoutId || 'No active test'}</p>
                    {paymentStatus && (
                        <div className={`mt-2 text-xs font-bold ${paymentStatus.status === 'COMPLETED' ? 'text-green-600' : 'text-orange-600'}`}>
                            RESULT: {paymentStatus.status}
                        </div>
                    )}
                 </div>
             </div>
             
             <div className="bg-black rounded-xl p-4 h-64 flex flex-col border border-gray-800">
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-blue-400 text-[10px] font-mono uppercase tracking-widest">Daraja API Terminal</p>
                    <button onClick={() => setTerminalLogs([])} className="text-[10px] text-gray-500 hover:text-white">Clear</button>
                 </div>
                 <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-tight space-y-1">
                     {terminalLogs.length === 0 ? (
                         <p className="text-gray-700 italic"># Waiting for API events...</p>
                     ) : (
                         terminalLogs.map((log, i) => (
                             <div key={i} className={`whitespace-pre-wrap ${
                                 log.type === 'error' ? 'text-red-400' : 
                                 log.type === 'success' ? 'text-green-400' : 'text-gray-300'
                             }`}>
                                 <span className="text-gray-600 mr-2">&gt;</span>
                                 {log.msg}
                             </div>
                         ))
                     )}
                     <div ref={terminalEndRef} />
                 </div>
             </div>
         </div>
      </div>

      {/* 3. Global Configuration */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 flex items-center">
                <i className="fas fa-project-diagram mr-2 text-red-600"></i> Integration Settings
            </h2>
            <p className="text-xs text-gray-500 mt-1">Configure Gemini AI, Evolution WhatsApp, and M-Pesa Daraja APIs.</p>
        </div>

        <div className="p-6 space-y-8">
            {/* Gemini Section */}
            <section className="space-y-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center">
                    <span className="w-6 h-px bg-gray-300 mr-2"></span> AI Brain (Gemini)
                </h3>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Gemini API Key</label>
                    <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" placeholder="AI Key (sk-...)" />
                </div>
            </section>

            {/* WhatsApp Section */}
            <section className="space-y-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center">
                    <span className="w-6 h-px bg-gray-300 mr-2"></span> WhatsApp (Evolution API)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Base URL</label>
                        <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="https://api.yourdomain.com" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Instance Name</label>
                        <input type="text" value={instanceName} onChange={e => setInstanceName(e.target.value)} className="w-full border p-2 rounded text-sm font-bold" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">API Global Token</label>
                        <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" />
                    </div>
                </div>
            </section>

            {/* Daraja Section */}
            <section className="space-y-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider flex items-center">
                    <span className="w-6 h-px bg-blue-300 mr-2"></span> Payment Gateway (Daraja M-Pesa)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Consumer Key</label>
                        <input type="text" value={darajaKey} onChange={e => setDarajaKey(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Consumer Secret</label>
                        <input type="password" value={darajaSecret} onChange={e => setDarajaSecret(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Passkey</label>
                        <input type="password" value={darajaPasskey} onChange={e => setDarajaPasskey(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Shortcode (Paybill/Till)</label>
                        <input type="text" value={darajaShortcode} onChange={e => setDarajaShortcode(e.target.value)} className="w-full border p-2 rounded text-sm font-bold" />
                    </div>
                </div>
            </section>

            <div className="flex pt-4">
                <button onClick={handleSaveAndSync} className="w-full md:w-auto px-10 py-3 bg-gray-900 text-white font-black rounded-lg hover:bg-black shadow-lg transition">
                    SAVE & SYNC ALL CREDENTIALS
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfig;