import React, { useState, useEffect } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { Ticket, Complaint, BusRoute } from '../types';
import WhatsAppConfig from './WhatsAppConfig';

const AdminDashboard: React.FC = () => {
  const { tickets, complaints, routes, validateTicket, getInventory, updateRoutePrice, addRoute, contacts, broadcastMessage } = useMockBackend();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'routes' | 'checkin' | 'whatsapp' | 'crm'>('overview');

  // Inventory State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [inventoryRoutes, setInventoryRoutes] = useState<BusRoute[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Route Management State
  const [routeSearch, setRouteSearch] = useState('');
  const [editPriceId, setEditPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ origin: '', destination: '', price: 1000, departureTime: '08:00 AM', busType: 'Standard' });

  // CRM State
  const [broadcastText, setBroadcastText] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Check-in State
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string; ticket?: Ticket } | null>(null);

  useEffect(() => {
    if (activeSubTab === 'routes') {
        fetchInventoryData();
    }
  }, [activeSubTab, selectedDate]);

  const fetchInventoryData = async () => {
      setLoadingInventory(true);
      const data = await getInventory(selectedDate);
      setInventoryRoutes(data);
      setLoadingInventory(false);
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    
    const result = validateTicket(scanInput.trim());
    setScanResult(result);
    setScanInput(''); // Clear input for next scan
    
    // Auto-clear success message after 5 seconds
    if (result.success) {
      setTimeout(() => setScanResult(null), 5000);
    }
  };

  const handlePriceUpdate = async (id: string) => {
      if (editPriceId === id) {
          await updateRoutePrice(id, tempPrice);
          setEditPriceId(null);
          // Refetch to update UI
          fetchInventoryData();
      } else {
          setEditPriceId(id);
          const route = inventoryRoutes.find(r => r.id === id);
          if (route) setTempPrice(route.price);
      }
  };

  const handleAddRoute = async () => {
      if (!newRoute.origin || !newRoute.destination) return;
      await addRoute(newRoute as any);
      setIsAddingRoute(false);
      setNewRoute({ origin: '', destination: '', price: 1000, departureTime: '08:00 AM', busType: 'Standard' });
      fetchInventoryData();
  };

  const handleBroadcast = async () => {
      if (!broadcastText.trim()) return;
      if (contacts.length === 0) {
          setBroadcastResult("No contacts available to message.");
          return;
      }
      setIsBroadcasting(true);
      const phones = contacts.map(c => c.phoneNumber);
      const res = await broadcastMessage(broadcastText, phones);
      setIsBroadcasting(false);
      setBroadcastResult(res.success ? `Sent to ${res.count} clients.` : "Failed to send.");
      if (res.success) setBroadcastText('');
      setTimeout(() => setBroadcastResult(null), 3000);
  };

  const totalRevenue = tickets.reduce((acc, ticket) => {
    return acc + (ticket.routeDetails?.price || 0);
  }, 0);

  const activeComplaints = complaints.filter(c => c.status === 'open');

  // Filter routes for display
  const filteredRoutes = inventoryRoutes.filter(r => 
      r.origin.toLowerCase().includes(routeSearch.toLowerCase()) || 
      r.destination.toLowerCase().includes(routeSearch.toLowerCase()) ||
      r.id.toLowerCase().includes(routeSearch.toLowerCase())
  );

  return (
    <div className="h-full bg-gray-50 p-6 overflow-y-auto">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-500">Overview of Ena Coach Operations</p>
        </div>
        <div className="flex items-center space-x-4">
             <div className="bg-white p-2 rounded shadow text-sm">
                <span className="font-semibold">User:</span> Admin
             </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex space-x-2 mb-6 border-b border-gray-200 overflow-x-auto">
        <button onClick={() => setActiveSubTab('overview')} className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${activeSubTab === 'overview' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Overview</button>
        <button onClick={() => setActiveSubTab('routes')} className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${activeSubTab === 'routes' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Fleet & Routes</button>
        <button onClick={() => setActiveSubTab('crm')} className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${activeSubTab === 'crm' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:text-gray-700'}`}>CRM & Marketing</button>
        <button onClick={() => setActiveSubTab('checkin')} className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${activeSubTab === 'checkin' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Boarding & Check-in</button>
        <button onClick={() => setActiveSubTab('whatsapp')} className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${activeSubTab === 'whatsapp' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Integration</button>
      </div>

      {activeSubTab === 'whatsapp' ? (
        <WhatsAppConfig />
      ) : activeSubTab === 'crm' ? (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Client Contacts</h2>
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">{contacts.length} Contacts</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600">
                                <tr>
                                    <th className="p-3">Name</th>
                                    <th className="p-3">Phone</th>
                                    <th className="p-3">Last Travelled</th>
                                    <th className="p-3 text-center">Total Trips</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {contacts.length === 0 ? (
                                    <tr><td colSpan={4} className="p-4 text-center text-gray-500">No client data yet.</td></tr>
                                ) : contacts.map((contact, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3 font-medium">{contact.name}</td>
                                        <td className="p-3 text-gray-500">{contact.phoneNumber}</td>
                                        <td className="p-3 text-gray-500">{contact.lastTravelDate}</td>
                                        <td className="p-3 text-center">{contact.totalTrips}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-purple-100 overflow-hidden">
                    <div className="bg-purple-600 p-4 text-white">
                        <h2 className="font-bold flex items-center">
                            <i className="fas fa-bullhorn mr-2"></i> Bulk Advertisement
                        </h2>
                        <p className="text-purple-100 text-xs mt-1">Send promotional messages to all saved contacts via the AI Agent.</p>
                    </div>
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message Content</label>
                            <textarea
                                value={broadcastText}
                                onChange={(e) => setBroadcastText(e.target.value)}
                                className="w-full border p-3 rounded-lg text-sm h-32 focus:border-purple-500 outline-none resize-none"
                                placeholder="e.g., Special Offer! Get 20% off all Kisumu routes this weekend!"
                            ></textarea>
                        </div>
                        <button 
                            onClick={handleBroadcast}
                            disabled={isBroadcasting || !broadcastText}
                            className={`w-full py-3 rounded-lg text-white font-bold transition ${
                                isBroadcasting ? 'bg-purple-300' : 'bg-purple-600 hover:bg-purple-700'
                            }`}
                        >
                            {isBroadcasting ? 'Sending...' : 'SEND BROADCAST'}
                        </button>
                        {broadcastResult && (
                            <div className={`text-center text-sm p-2 rounded ${broadcastResult.includes('Sent') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {broadcastResult}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      ) : activeSubTab === 'checkin' ? (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="bg-gray-800 p-6 text-white text-center">
              <i className="fas fa-qrcode text-4xl mb-3 text-red-500"></i>
              <h2 className="text-2xl font-bold">Passenger Check-in</h2>
              <p className="text-gray-400 text-sm">Scan QR code or enter Ticket ID to validate boarding.</p>
            </div>
            
            <div className="p-8">
              <form onSubmit={handleScan} className="flex gap-4 mb-6">
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Enter Ticket ID (e.g. TKT-1234)"
                  className="flex-1 p-4 text-lg border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none uppercase font-mono tracking-wide"
                  autoFocus
                />
                <button
                  type="submit"
                  className="bg-red-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-red-700 transition"
                >
                  VALIDATE
                </button>
              </form>

              {scanResult && (
                <div className={`p-6 rounded-lg border-l-8 animation-fade-in ${
                  scanResult.success ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'
                }`}>
                   <div className="flex items-start">
                     <div className={`text-3xl mr-4 ${scanResult.success ? 'text-green-500' : 'text-red-500'}`}>
                       <i className={`fas ${scanResult.success ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                     </div>
                     <div>
                       <h3 className={`font-bold text-lg ${scanResult.success ? 'text-green-800' : 'text-red-800'}`}>
                         {scanResult.success ? 'BOARDING APPROVED' : 'VALIDATION FAILED'}
                       </h3>
                       <p className="text-gray-700 mt-1">{scanResult.message}</p>
                       
                       {scanResult.ticket && (
                         <div className="mt-3 text-sm text-gray-600 bg-white p-3 rounded shadow-sm inline-block">
                           <p><strong>Route:</strong> {scanResult.ticket.routeDetails?.origin} &rarr; {scanResult.ticket.routeDetails?.destination}</p>
                           <p><strong>Time:</strong> {scanResult.ticket.routeDetails?.departureTime}</p>
                           <p><strong>Seat:</strong> {scanResult.ticket.seatNumber} ({scanResult.ticket.routeDetails?.busType})</p>
                         </div>
                       )}
                     </div>
                   </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Recent Scans List */}
          <div className="mt-8">
             <h3 className="font-bold text-gray-700 mb-4">Recently Boarded</h3>
             <div className="bg-white rounded shadow-sm overflow-hidden">
                <ul className="divide-y divide-gray-100">
                   {tickets.filter(t => t.boardingStatus === 'boarded').length === 0 ? (
                     <li className="p-4 text-gray-400 text-center italic">No passengers have boarded yet.</li>
                   ) : (
                     tickets.filter(t => t.boardingStatus === 'boarded').slice(0, 5).map(t => (
                       <li key={t.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                          <div>
                            <span className="font-bold text-gray-800">{t.passengerName}</span>
                            <span className="text-gray-400 text-xs ml-2">({t.id})</span>
                          </div>
                          <div className="text-xs text-green-600 font-bold flex items-center">
                            <i className="fas fa-check mr-1"></i> Boarded
                          </div>
                       </li>
                     ))
                   )}
                </ul>
             </div>
          </div>
        </div>
      ) : activeSubTab === 'routes' ? (
        <div className="space-y-6">
           {/* Controls Header */}
           <div className="bg-white p-4 rounded-lg shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                  <h2 className="text-lg font-bold text-gray-800">Fleet & Routes</h2>
                  <p className="text-xs text-gray-500">Manage pricing and inventory</p>
              </div>
              <div className="flex-1 w-full md:w-auto flex items-center space-x-2">
                  <div className="relative flex-1">
                      <i className="fas fa-search absolute left-3 top-2.5 text-gray-400"></i>
                      <input 
                        type="text" 
                        placeholder="Search origin, dest, or ID..."
                        value={routeSearch}
                        onChange={(e) => setRouteSearch(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full text-sm focus:border-red-500 outline-none"
                      />
                  </div>
                  <button 
                    onClick={() => setIsAddingRoute(!isAddingRoute)}
                    className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 whitespace-nowrap"
                  >
                    <i className="fas fa-plus mr-2"></i> Add Route
                  </button>
              </div>
           </div>
           
           {/* Add Route Panel */}
           {isAddingRoute && (
               <div className="bg-gray-100 border border-gray-200 p-4 rounded-lg animation-fade-in">
                   <h3 className="font-bold text-gray-700 mb-3">Add New Route</h3>
                   <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                       <input type="text" placeholder="Origin" className="p-2 rounded border" value={newRoute.origin} onChange={e => setNewRoute({...newRoute, origin: e.target.value})} />
                       <input type="text" placeholder="Destination" className="p-2 rounded border" value={newRoute.destination} onChange={e => setNewRoute({...newRoute, destination: e.target.value})} />
                       <input type="time" className="p-2 rounded border" value={newRoute.departureTime} onChange={e => setNewRoute({...newRoute, departureTime: e.target.value})} />
                       <input type="number" placeholder="Price" className="p-2 rounded border" value={newRoute.price} onChange={e => setNewRoute({...newRoute, price: parseInt(e.target.value)})} />
                       <button onClick={handleAddRoute} className="bg-green-600 text-white rounded font-bold hover:bg-green-700">Save</button>
                   </div>
               </div>
           )}

           {loadingInventory ? (
               <div className="text-center py-10 text-gray-500">
                   <i className="fas fa-spinner fa-spin fa-2x mb-2"></i>
                   <p>Fetching server data...</p>
               </div>
           ) : (
             <div className="bg-white rounded-lg shadow-sm overflow-hidden">
               <table className="w-full text-left text-sm">
                 <thead className="bg-gray-100 text-gray-600">
                   <tr>
                     <th className="p-3">ID</th>
                     <th className="p-3">Route</th>
                     <th className="p-3">Time</th>
                     <th className="p-3">Type</th>
                     <th className="p-3">Price (KES)</th>
                     <th className="p-3 text-center">Avail</th>
                     <th className="p-3 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {filteredRoutes.map((route) => {
                      const isEditing = editPriceId === route.id;
                      return (
                       <tr key={route.id} className="hover:bg-gray-50">
                         <td className="p-3 font-mono text-xs text-gray-400">{route.id}</td>
                         <td className="p-3 font-medium">{route.origin} &rarr; {route.destination}</td>
                         <td className="p-3">{route.departureTime}</td>
                         <td className="p-3">
                           <span className={`px-2 py-1 rounded text-xs ${route.busType === 'Luxury' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                             {route.busType}
                           </span>
                         </td>
                         <td className="p-3 font-bold text-gray-800">
                             {isEditing ? (
                                 <input 
                                    type="number" 
                                    value={tempPrice} 
                                    onChange={(e) => setTempPrice(Number(e.target.value))}
                                    className="w-20 border rounded px-1"
                                 />
                             ) : (
                                 `KES ${route.price}`
                             )}
                         </td>
                         <td className="p-3 text-center">
                           <span className={`font-bold ${route.availableSeats < 5 ? 'text-red-500' : 'text-green-500'}`}>
                             {route.availableSeats}
                           </span>
                         </td>
                         <td className="p-3 text-right">
                             <button 
                                onClick={() => handlePriceUpdate(route.id)}
                                className={`text-xs px-3 py-1 rounded font-bold transition ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                             >
                                 {isEditing ? 'Save' : 'Edit Price'}
                             </button>
                         </td>
                       </tr>
                      );
                   })}
                 </tbody>
               </table>
               {filteredRoutes.length === 0 && <div className="p-6 text-center text-gray-400">No routes found matching your search.</div>}
             </div>
           )}
        </div>
      ) : (
        <>
          {/* Overview Tab (Existing Mock Data Fallback for visual continuity if needed, or update to use real data aggregation) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
              <div className="text-gray-500 text-sm font-medium uppercase">Total Bookings (All Time)</div>
              <div className="text-3xl font-bold text-gray-800">{tickets.length}</div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
              <div className="text-gray-500 text-sm font-medium uppercase">Total Revenue</div>
              <div className="text-3xl font-bold text-gray-800">KES {totalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
              <div className="text-gray-500 text-sm font-medium uppercase">Active Complaints</div>
              <div className="text-3xl font-bold text-gray-800">{activeComplaints.length}</div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-purple-500">
              <div className="text-gray-500 text-sm font-medium uppercase">Active Routes</div>
              <div className="text-3xl font-bold text-gray-800">{routes.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Bookings */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-800">Recent Bookings</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {tickets.slice(0, 5).map(ticket => (
                  <li key={ticket.id} className="p-4 hover:bg-gray-50 flex justify-between items-center">
                    <div>
                       <p className="font-bold text-sm text-gray-800">{ticket.passengerName}</p>
                       <p className="text-xs text-gray-500">{ticket.routeDetails?.origin} - {ticket.routeDetails?.destination}</p>
                    </div>
                    <div className="text-right">
                       <span className={`text-xs px-2 py-1 rounded-full ${ticket.boardingStatus === 'boarded' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                         {ticket.boardingStatus === 'boarded' ? 'Boarded' : ticket.status}
                       </span>
                       <p className="text-xs text-gray-400 mt-1">{new Date(ticket.bookingTime).toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
                {tickets.length === 0 && <li className="p-4 text-center text-gray-400 text-sm">No bookings yet.</li>}
              </ul>
            </div>

            {/* Recent Complaints */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-800">Escalated Complaints</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {activeComplaints.slice(0, 5).map(complaint => (
                  <li key={complaint.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-sm text-gray-800">{complaint.customerName}</span>
                      <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                        complaint.severity === 'high' ? 'bg-red-100 text-red-600' : 
                        complaint.severity === 'medium' ? 'bg-orange-100 text-orange-600' : 
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {complaint.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">{complaint.issue}</p>
                    <div className="text-xs text-gray-400 flex justify-between">
                        <span>ID: {complaint.id}</span>
                        {complaint.incidentDate && <span>Incident: {complaint.incidentDate} {complaint.routeInfo && `(${complaint.routeInfo})`}</span>}
                    </div>
                  </li>
                ))}
                {activeComplaints.length === 0 && <li className="p-4 text-center text-gray-400 text-sm">No active complaints.</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;