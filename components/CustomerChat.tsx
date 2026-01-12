
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { GeminiService } from '../services/geminiService';
import { ChatMessage, Ticket } from '../types';
import AuthModal from './AuthModal';
import TicketCard from './TicketCard';

const CustomerChat: React.FC = () => {
  const { searchRoutes, bookTicket, initiatePayment, verifyPayment, logComplaint, getBusStatus, currentUser, logout, getUserTickets } = useMockBackend();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am Martha, your Ena Coach assistant. I can help you find buses, track locations, book seats, and handle complaints. How can I assist you today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isMonitoringPayment, setIsMonitoringPayment] = useState(false);
  
  const [dynamicApiKey, setDynamicApiKey] = useState<string>(process.env.API_KEY || '');
  const [isKeyLoading, setIsKeyLoading] = useState<boolean>(!process.env.API_KEY);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dynamicApiKey) {
        setIsKeyLoading(true);
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                if (data.apiKey) setDynamicApiKey(data.apiKey);
            })
            .catch(err => console.error("Failed to load config", err))
            .finally(() => setIsKeyLoading(false));
    }
  }, []);

  const gemini = useMemo(() => {
    if (!dynamicApiKey) return null;
    return new GeminiService(dynamicApiKey);
  }, [dynamicApiKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const pollPaymentStatus = async (checkoutRequestId: string) => {
      setIsMonitoringPayment(true);
      let attempts = 0;
      const maxAttempts = 30; // 2 minutes approx

      const interval = setInterval(async () => {
          attempts++;
          const statusRes = await verifyPayment(checkoutRequestId);
          
          if (statusRes.status === 'COMPLETED') {
              clearInterval(interval);
              setIsMonitoringPayment(false);
              // Proactively notify the agent of success
              handleAutomatedFollowUp(`[PAYMENT_SUCCESS] CheckoutID: ${checkoutRequestId}`);
          } else if (statusRes.status === 'FAILED' || attempts >= maxAttempts) {
              clearInterval(interval);
              setIsMonitoringPayment(false);
          }
      }, 5000);
  };

  const handleAutomatedFollowUp = async (triggerText: string) => {
      if (!gemini) return;
      setIsLoading(true);
      try {
          const { text, ticket } = await gemini.sendMessage(triggerText, {
              searchRoutes, bookTicket, initiatePayment, verifyPayment, logComplaint, getBusStatus
          });
          const aiMsg: ChatMessage = {
              id: Date.now().toString(),
              role: 'model',
              text: text,
              timestamp: new Date(),
              ticket: ticket 
          };
          setMessages((prev) => [...prev, aiMsg]);
      } catch (error) {
          console.error("Auto Follow-up Error:", error);
      } finally {
          setIsLoading(false);
      }
  };

  const handleSend = async () => {
    if (!input.trim() || !gemini) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { text, ticket } = await gemini.sendMessage(input, {
        searchRoutes,
        bookTicket,
        initiatePayment,
        verifyPayment,
        logComplaint,
        getBusStatus
      }, (checkoutId) => {
          // Callback when payment is initiated
          pollPaymentStatus(checkoutId);
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: text,
        timestamp: new Date(),
        ticket: ticket 
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: 'Connection issue. Please check your internet.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const myBookings = currentUser ? getUserTickets() : [];

  if (isKeyLoading) {
      return (
          <div className="flex items-center justify-center h-full bg-gray-100 font-sans">
              <div className="text-center">
                  <i className="fas fa-circle-notch fa-spin text-red-600 text-3xl mb-4"></i>
                  <p className="text-gray-600 font-bold">Securely connecting to server...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 relative overflow-hidden font-sans">
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {selectedTicket && <TicketCard ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}

      {/* Simulator Header */}
      <div className="bg-gray-800 p-4 flex items-center text-white shadow-md z-10 sticky top-0 border-b border-gray-700">
        <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-lg mr-3 shadow-sm">
          <i className="fas fa-robot"></i>
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-lg leading-tight tracking-tight">Agent Simulator</h1>
          <div className="flex items-center text-[10px] text-gray-400 font-mono uppercase tracking-widest">
             <i className="fas fa-clock mr-1"></i>
             {currentTime.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
        <div className="ml-auto flex items-center space-x-4 relative">
          {isMonitoringPayment && (
              <div className="flex items-center space-x-2 bg-red-900/40 px-3 py-1 rounded-full border border-red-500/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  <span className="text-[10px] font-black text-red-400 uppercase tracking-tighter">Monitoring M-Pesa...</span>
              </div>
          )}
          <button 
              onClick={() => currentUser ? setShowProfileMenu(!showProfileMenu) : setShowAuthModal(true)}
              className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition shadow-inner"
          >
            <i className={`fas ${currentUser ? 'fa-user' : 'fa-flask'}`}></i>
          </button>
        </div>
      </div>
      
      {/* Date Banner */}
      <div className="bg-white text-gray-500 px-4 py-1.5 text-[10px] text-center border-b border-gray-200 font-black uppercase tracking-[0.2em]">
         <i className="fas fa-calendar-day mr-2 text-red-500"></i> 
         Today: {currentTime.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        onClick={() => setShowProfileMenu(false)}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa]"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl shadow-sm relative text-sm md:text-base leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-red-600 text-white rounded-tr-none' 
                  : msg.role === 'system' 
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-100 italic text-xs text-center'
                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)]'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
              
              {msg.ticket && (
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner text-gray-800">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs">EC</div>
                    <h3 className="font-black text-gray-900 text-[10px] uppercase tracking-widest">Ena Coach Digital Ticket</h3>
                  </div>
                  <div className="text-[11px] text-gray-600 mb-4 space-y-1.5">
                    <p className="flex justify-between"><span className="font-bold opacity-60">TO:</span> <span className="font-black text-gray-900">{msg.ticket.routeDetails?.destination}</span></p>
                    <p className="flex justify-between"><span className="font-bold opacity-60">SEAT:</span> <span className="text-red-600 font-black">{msg.ticket.seatNumber}</span></p>
                  </div>
                  <button 
                    onClick={() => setSelectedTicket(msg.ticket!)}
                    className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-black transition active:scale-95 shadow-md"
                  >
                    Download PDF Ticket
                  </button>
                </div>
              )}

              <span className={`text-[9px] font-black uppercase tracking-widest block text-right mt-2 opacity-50 ${msg.role === 'user' ? 'text-red-100' : 'text-gray-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 flex items-center space-x-3">
                <div className="flex space-x-1.5">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce delay-150"></div>
                </div>
                {isMonitoringPayment && <span className="text-[10px] font-bold text-red-500 uppercase">Detecting PIN Entry...</span>}
             </div>
           </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 flex items-center space-x-3 border-t border-gray-100">
        <div className="flex-1 bg-gray-50 rounded-2xl px-6 py-4 border border-gray-200 focus-within:border-red-500 transition-colors">
          <input
            type="text"
            className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400 font-medium"
            placeholder="Type your destination..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
        </div>
        <button 
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className={`w-14 h-14 rounded-2xl transition shadow-lg active:scale-90 flex items-center justify-center ${input.trim() ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-400'}`}
        >
          <i className="fas fa-paper-plane text-xl"></i>
        </button>
      </div>
    </div>
  );
};

export default CustomerChat;
