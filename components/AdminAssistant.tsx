
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { GeminiService } from '../services/geminiService';

const AdminAssistant: React.FC = () => {
  const { 
    getFinancialReport, 
    getOccupancyStats, 
    addRoute,
    updateRoute,
    deleteRoute,
    getComplaints,
    resolveComplaint
  } = useMockBackend();
  
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([
      { role: 'model', text: "Operations Assistant online. I can manage routes, adjust pricing, and generate fleet reports. How can I help?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');

  useEffect(() => {
    if (!apiKey) {
       fetch('/api/config').then(res => res.json()).then(data => setApiKey(data.apiKey));
    }
  }, []);

  const gemini = useMemo(() => apiKey ? new GeminiService(apiKey) : null, [apiKey]);

  useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
      if (!input.trim() || !gemini) return;
      
      const userText = input;
      setMessages(prev => [...prev, { role: 'user', text: userText }]);
      setInput('');
      setIsLoading(true);

      try {
          const responseText = await gemini.sendAdminMessage(userText, {
              getFinancialReport,
              getOccupancyStats,
              addRoute,
              updateRoute,
              deleteRoute,
              getComplaints,
              resolveComplaint
          });
          setMessages(prev => [...prev, { role: 'model', text: responseText }]);
      } catch (e) {
          setMessages(prev => [...prev, { role: 'model', text: "Error executing command." }]);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-900 text-white p-5 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
                    <i className="fas fa-microchip"></i>
                </div>
                <div>
                    <h3 className="font-black text-xs uppercase tracking-widest">Ops Intelligence</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Database Access: Active</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fcfcfd]" ref={scrollRef}>
            {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-blue-200 shadow-lg' 
                        : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-none font-medium'
                    }`}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                    </div>
                </div>
            ))}
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                        <i className="fas fa-circle-notch fa-spin text-blue-500"></i>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Applying changes...</span>
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
            <input 
                type="text" 
                className="flex-1 bg-gray-50 border-2 border-transparent rounded-2xl px-5 py-3 text-sm font-bold text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                placeholder="e.g. Increase price of R001 to 2000"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button 
                onClick={handleSend}
                disabled={isLoading}
                className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center hover:bg-blue-700 transition shadow-lg active:scale-90 disabled:opacity-50"
            >
                <i className="fas fa-bolt text-sm"></i>
            </button>
        </div>
    </div>
  );
};

export default AdminAssistant;
