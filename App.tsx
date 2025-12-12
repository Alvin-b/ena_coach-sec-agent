import React, { useState } from 'react';
import CustomerChat from './components/CustomerChat';
import AdminDashboard from './components/AdminDashboard';
import { MockBackendProvider } from './contexts/MockBackendContext';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'admin'>('chat');

  return (
    <MockBackendProvider>
      <div className="flex h-screen overflow-hidden bg-gray-200">
        {/* Sidebar Navigation */}
        <aside className="w-20 md:w-64 bg-gray-900 text-white flex flex-col shadow-2xl z-20">
          <div className="p-4 md:p-6 border-b border-gray-800 flex items-center justify-center md:justify-start">
             <i className="fas fa-bus-alt text-3xl text-red-500 mr-0 md:mr-3"></i>
             <span className="text-xl font-bold tracking-wider hidden md:block">ENA COACH</span>
          </div>
          
          <nav className="flex-1 py-6 space-y-2">
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center px-4 py-3 transition-colors duration-200 ${
                activeTab === 'chat' 
                  ? 'bg-red-600 text-white border-r-4 border-white' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <i className="fab fa-whatsapp text-2xl md:mr-4 w-8 text-center"></i>
              <span className="font-medium hidden md:block">Customer Chat</span>
            </button>
            
            <button
              onClick={() => setActiveTab('admin')}
              className={`w-full flex items-center px-4 py-3 transition-colors duration-200 ${
                activeTab === 'admin' 
                  ? 'bg-red-600 text-white border-r-4 border-white' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <i className="fas fa-tachometer-alt text-2xl md:mr-4 w-8 text-center"></i>
              <span className="font-medium hidden md:block">Admin Dashboard</span>
            </button>
          </nav>

          <div className="p-4 border-t border-gray-800 text-center md:text-left">
            <div className="text-xs text-gray-500 mb-2 hidden md:block">SYSTEM STATUS</div>
            <div className="flex items-center justify-center md:justify-start space-x-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-sm text-gray-300 hidden md:block">Systems Online</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 relative">
           {/* We use absolute positioning to keep components alive in DOM but hidden to preserve state if needed, 
               or conditional rendering. Conditional rendering is better here for simplicity, 
               but MockBackendProvider wraps both so state is shared. 
           */}
           {activeTab === 'chat' ? <CustomerChat /> : <AdminDashboard />}
        </main>
      </div>
    </MockBackendProvider>
  );
};

export default App;
