import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { GeminiService } from '../services/geminiService';

const AdminAssistant: React.FC = () => {
  const { 
    getFinancialReport, 
    getOccupancyStats, 
    broadcastMessage, 
    searchRoutes, 
    getBusStatus, 
    getRouteManifest,
    getComplaints,
    resolveComplaint,
    contacts 
  } = useMockBackend();
  
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([
      { role: 'model', text: "Hello Admin. I'm ready to assist with reports, fleet management, and customer support." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load API Key specifically for this component instance
  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');

  useEffect(() => {
    if (!apiKey) {
       fetch('/api/config')
        .then(res => res.json())
        .then(data => setApiKey(data.apiKey));
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
              broadcastMessage,
              searchRoutes,
              getBusStatus,
              getRouteManifest,
              getComplaints,
              resolveComplaint,
              contacts
          });
          setMessages(prev => [...prev, { role: 'model', text: responseText }]);
      } catch (e) {
          setMessages(prev => [...prev, { role: 'model', text: "Error executing command." }]);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
            <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center mr-3">
                    <i className="fas fa-brain"></i>
                </div>
                <div>
                    <h3 className="font-bold text-sm">Ops Assistant</h3>
                    <p className="text-[10px] text-gray-400">Powered by Gemini 2.5</p>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50" ref={scrollRef}>
            {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-lg text-sm ${
                        msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white text-gray-800 shadow-sm border border-gray-200 rounded-tl-none'
                    }`}>
                        <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                    </div>
                </div>
            ))}
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                        <i className="fas fa-circle-notch fa-spin text-gray-400"></i>
                    </div>
                </div>
            )}
        </div>

        <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
            <input 
                type="text" 
                className="flex-1 bg-gray-100 border-0 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Ask for revenue, occupancy, or help..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button 
                onClick={handleSend}
                disabled={isLoading}
                className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition shadow-sm"
            >
                <i className="fas fa-paper-plane text-xs"></i>
            </button>
        </div>
    </div>
  );
};

export default AdminAssistant;