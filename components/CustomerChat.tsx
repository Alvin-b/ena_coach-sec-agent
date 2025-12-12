import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { GeminiService } from '../services/geminiService';
import { ChatMessage, Ticket } from '../types';
import AuthModal from './AuthModal';
import TicketCard from './TicketCard';

const CustomerChat: React.FC = () => {
  const { searchRoutes, bookTicket, processPayment, logComplaint, getBusStatus, currentUser, logout, getUserTickets } = useMockBackend();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! Welcome to Ena Coach. I can help you find buses, track your bus location, book seats, and handle any issues. How can I assist you today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize Gemini Service
  const gemini = useMemo(() => {
    // Note: In a real app, do not hardcode, use process.env.API_KEY
    if (!process.env.API_KEY) return null;
    return new GeminiService(process.env.API_KEY);
  }, []);

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
      const responseText = await gemini.sendMessage(input, {
        searchRoutes,
        bookTicket,
        processPayment,
        logComplaint,
        getBusStatus
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date(),
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

  if (!process.env.API_KEY) {
      return (
          <div className="flex items-center justify-center h-full bg-gray-100 p-6">
              <div className="bg-white p-8 rounded-lg shadow-md text-center">
                  <h2 className="text-xl font-bold text-red-600 mb-2">API Key Missing</h2>
                  <p className="text-gray-600">Please provide a valid Google Gemini API Key in <code>metadata.json</code> or via environment variables to run this simulation.</p>
              </div>
          </div>
      )
  }

  return (
    <div className="flex flex-col h-full bg-[#efeae2] relative">
      {/* Auth Modal Overlay */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      
      {/* Ticket Card Overlay */}
      {selectedTicket && <TicketCard ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}

      {/* WhatsApp Header */}
      <div className="bg-[#075e54] p-4 flex items-center text-white shadow-md z-10 sticky top-0">
        <div className="w-10 h-10 rounded-full bg-white text-[#075e54] flex items-center justify-center font-bold text-lg mr-3">
          EC
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-lg">Ena Coach Support</h1>
          <p className="text-xs opacity-80">
             {currentUser ? `Hi, ${currentUser.name}` : 'Online | Automated Assistant'}
          </p>
        </div>
        <div className="ml-auto flex items-center space-x-4 relative">
          <button className="hidden md:block hover:opacity-80"><i className="fas fa-video"></i></button>
          <button className="hidden md:block hover:opacity-80"><i className="fas fa-phone"></i></button>
          
          {/* Profile / Login Trigger */}
          <div className="relative">
            <button 
                onClick={() => currentUser ? setShowProfileMenu(!showProfileMenu) : setShowAuthModal(true)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition"
            >
              <i className={`fas ${currentUser ? 'fa-user' : 'fa-sign-in-alt'}`}></i>
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

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        onClick={() => setShowProfileMenu(false)}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] p-3 rounded-lg shadow-sm relative text-sm md:text-base ${
                msg.role === 'user'
                  ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-none'
                  : msg.role === 'system' 
                    ? 'bg-red-100 text-red-800'
                    : 'bg-white text-gray-800 rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <span className="text-[10px] text-gray-500 block text-right mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm">
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
      <div className="bg-[#f0f0f0] p-2 flex items-center space-x-2">
        <button className="p-2 text-gray-500 hover:text-gray-700">
          <i className="fas fa-smile text-xl"></i>
        </button>
        <div className="flex-1 bg-white rounded-full px-4 py-2 shadow-sm border border-gray-200">
          <input
            type="text"
            className="w-full bg-transparent outline-none text-gray-700"
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
             className="p-3 bg-[#075e54] text-white rounded-full hover:bg-[#128c7e] transition shadow-md"
           >
             <i className="fas fa-paper-plane"></i>
           </button>
        ) : (
          <button className="p-3 bg-[#075e54] text-white rounded-full hover:bg-[#128c7e] transition shadow-md opacity-50 cursor-default">
            <i className="fas fa-microphone"></i>
          </button>
        )}
      </div>
    </div>
  );
};

export default CustomerChat;