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
      text: 'Hello! I am the Ena Coach AI Agent. I can help you find buses, track locations, book seats, and handle complaints. How can I assist you?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  
  // Dynamic API Key Loading
  const [dynamicApiKey, setDynamicApiKey] = useState<string>(process.env.API_KEY || '');
  const [isKeyLoading, setIsKeyLoading] = useState<boolean>(!process.env.API_KEY);

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

  // Initialize Gemini Service
  const gemini = useMemo(() => {
    if (!dynamicApiKey) return null;
    return new GeminiService(dynamicApiKey);
  }, [dynamicApiKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: text,
        timestamp: new Date(),
        ticket: ticket // Attach the ticket object if booked
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: 'Error connecting to agent.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const myBookings = currentUser ? getUserTickets() : [];

  if (isKeyLoading) {
      return (
          <div className="flex items-center justify-center h-full bg-gray-100">
              <div className="text-center">
                  <i className="fas fa-circle-notch fa-spin text-red-600 text-3xl mb-4"></i>
                  <p className="text-gray-600">Connecting to secure server...</p>
              </div>
          </div>
      );
  }

  if (!dynamicApiKey) {
      return (
          <div className="flex items-center justify-center h-full bg-gray-100 p-6">
              <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 text-2xl">
                     <i className="fas fa-key"></i>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">API Key Missing</h2>
                  <p className="text-gray-600 mb-4 text-sm">
                      The application could not find a valid Google Gemini API Key in the environment.
                  </p>
                  <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded border border-gray-200">
                      Please ensure <code>GEMINI_API_KEY</code> is set in your server environment variables (Render/Replit/Local .env).
                  </p>
              </div>
          </div>
      )
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 relative overflow-hidden">
      {/* Auth Modal Overlay */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      
      {/* Ticket Card Overlay (Full View) */}
      {selectedTicket && <TicketCard ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}

      {/* Simulator Header */}
      <div className="bg-gray-800 p-4 flex items-center text-white shadow-md z-10 sticky top-0 border-b border-gray-700">
        <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-lg mr-3 shadow-sm">
          <i className="fas fa-robot"></i>
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Agent Simulator</h1>
          <p className="text-xs text-gray-400">
             Internal Testing Environment
          </p>
        </div>
        <div className="ml-auto flex items-center space-x-4 relative">
          
          {/* Profile / Login Trigger */}
          <div className="relative">
            <button 
                onClick={() => currentUser ? setShowProfileMenu(!showProfileMenu) : setShowAuthModal(true)}
                className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition"
            >
              <i className={`fas ${currentUser ? 'fa-user' : 'fa-flask'}`}></i>
            </button>

            {/* Dropdown Menu for Logged In User */}
            {showProfileMenu && currentUser && (
                <div className="absolute right-0 top-10 w-72 bg-white rounded shadow-lg text-gray-800 z-40 overflow-hidden ring-1 ring-black ring-opacity-5">
                    <div className="p-4 border-b bg-gray-50">
                        <p className="font-bold">{currentUser.name}</p>
                        <p className="text-xs text-gray-500">{currentUser.email}</p>
                        <p className="text-xs text-gray-500">{currentUser.phoneNumber}</p>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        <div className="p-2 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0">My Tickets</div>
                        {myBookings.length === 0 ? (
                            <p className="p-3 text-sm text-gray-400 text-center">No bookings found.</p>
                        ) : (
                            myBookings.map(ticket => (
                                <div 
                                    key={ticket.id} 
                                    className="p-3 border-b hover:bg-red-50 cursor-pointer transition group"
                                    onClick={() => { setSelectedTicket(ticket); setShowProfileMenu(false); }}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-sm text-gray-800">{ticket.routeDetails?.destination}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${ticket.boardingStatus === 'boarded' ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                            {ticket.boardingStatus === 'boarded' ? 'USED' : 'ACTIVE'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between mt-1 text-xs text-gray-500">
                                         <span>Seat: {ticket.seatNumber}</span>
                                         <span className="group-hover:text-red-600 group-hover:underline">View Ticket</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button 
                        onClick={() => { logout(); setShowProfileMenu(false); }}
                        className="w-full text-left p-3 text-red-600 hover:bg-red-50 text-sm font-medium border-t"
                    >
                        <i className="fas fa-sign-out-alt mr-2"></i> Logout
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Disclaimer Banner */}
      <div className="bg-yellow-100 text-yellow-800 px-4 py-2 text-xs text-center border-b border-yellow-200 font-medium">
         <i className="fas fa-info-circle mr-1"></i> 
         This is a simulation. Live customer interactions occur via WhatsApp.
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        onClick={() => setShowProfileMenu(false)}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-white"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] p-3 rounded-lg shadow-sm relative text-sm md:text-base ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none' // Changed from WhatsApp green to Blue
                  : msg.role === 'system' 
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
              
              {/* Premium Ticket Bubble inside Chat */}
              {msg.ticket && (
                <div className="mt-3 bg-white border border-gray-200 rounded-lg p-3 shadow-sm text-gray-800">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs">EC</div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wide">Ena Coach Ticket</h3>
                      <p className="text-[10px] text-gray-500">{msg.ticket.id}</p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-700 mb-2 space-y-1">
                    <p><strong>To:</strong> {msg.ticket.routeDetails?.destination}</p>
                    <p><strong>Departs:</strong> {msg.ticket.routeDetails?.departureTime}</p>
                    <p><strong>Seat:</strong> <span className="text-red-600 font-bold text-sm">{msg.ticket.seatNumber}</span></p>
                  </div>
                  <button 
                    onClick={() => setSelectedTicket(msg.ticket!)}
                    className="w-full bg-red-600 text-white py-1.5 rounded text-xs font-bold hover:bg-red-700 transition flex items-center justify-center"
                  >
                    <i className="fas fa-eye mr-2"></i> View & Download Ticket
                  </button>
                </div>
              )}

              <span className={`text-[10px] block text-right mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-gray-100 p-3 rounded-lg rounded-tl-none shadow-sm border border-gray-200">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                </div>
             </div>
           </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-gray-50 p-2 flex items-center space-x-2 border-t border-gray-200">
        <button className="p-2 text-gray-400 hover:text-gray-600">
          <i className="fas fa-paperclip text-xl"></i>
        </button>
        <div className="flex-1 bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-300">
          <input
            type="text"
            className="w-full bg-transparent outline-none text-gray-700 placeholder-gray-400"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
        </div>
        {input.trim() ? (
           <button 
             onClick={handleSend}
             className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md"
           >
             <i className="fas fa-paper-plane"></i>
           </button>
        ) : (
          <button className="p-3 bg-gray-300 text-white rounded-lg cursor-default">
            <i className="fas fa-paper-plane"></i>
          </button>
        )}
      </div>
    </div>
  );
};

export default CustomerChat;