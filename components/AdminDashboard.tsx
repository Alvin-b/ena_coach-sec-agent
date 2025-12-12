import React, { useState } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { Ticket, Complaint } from '../types';
import WhatsAppConfig from './WhatsAppConfig';

const AdminDashboard: React.FC = () => {
  const { tickets, complaints, routes, validateTicket } = useMockBackend();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'routes' | 'checkin' | 'whatsapp'>('overview');

  // Check-in State
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string; ticket?: Ticket } | null>(null);

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

  const totalRevenue = tickets.reduce((acc, ticket) => {
    return acc + (ticket.routeDetails?.price || 0);
  }, 0);

  const activeComplaints = complaints.filter(c => c.status === 'open');

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
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
            activeSubTab === 'overview' 
              ? 'text-red-600 border-b-2 border-red-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveSubTab('routes')}
          className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
            activeSubTab === 'routes' 
              ? 'text-red-600 border-b-2 border-red-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Fleet & Routes
        </button>
        <button
          onClick={() => setActiveSubTab('checkin')}
          className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
            activeSubTab === 'checkin' 
              ? 'text-red-600 border-b-2 border-red-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Boarding & Check-in
        </button>
        <button
          onClick={() => setActiveSubTab('whatsapp')}
          className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
            activeSubTab === 'whatsapp' 
              ? 'text-red-600 border-b-2 border-red-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          WhatsApp Integration
        </button>
      </div>

      {activeSubTab === 'whatsapp' ? (
        <WhatsAppConfig />
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
           {/* Routes Stats */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-4 rounded shadow-sm">
               <p className="text-xs text-gray-500 uppercase font-bold">Total Fleet Capacity</p>
               <p className="text-2xl font-bold text-gray-800">{routes.reduce((acc, r) => acc + r.capacity, 0)} Seats</p>
             </div>
             <div className="bg-white p-4 rounded shadow-sm">
               <p className="text-xs text-gray-500 uppercase font-bold">Total Booked Seats</p>
               <p className="text-2xl font-bold text-green-600">{routes.reduce((acc, r) => acc + (r.capacity - r.availableSeats), 0)} Seats</p>
             </div>
             <div className="bg-white p-4 rounded shadow-sm">
               <p className="text-xs text-gray-500 uppercase font-bold">Occupancy Rate</p>
               <p className="text-2xl font-bold text-blue-600">
                 {Math.round((routes.reduce((acc, r) => acc + (r.capacity - r.availableSeats), 0) / routes.reduce((acc, r) => acc + r.capacity, 0)) * 100)}%
               </p>
             </div>
           </div>

           <div className="bg-white rounded-lg shadow-sm overflow-hidden">
             <div className="p-4 border-b border-gray-100 bg-gray-50">
               <h2 className="font-semibold text-gray-800">Route Management</h2>
             </div>
             <table className="w-full text-left text-sm">
               <thead className="bg-gray-100 text-gray-600">
                 <tr>
                   <th className="p-3">Route ID</th>
                   <th className="p-3">Origin - Destination</th>
                   <th className="p-3">Departure</th>
                   <th className="p-3">Type</th>
                   <th className="p-3 text-center">Capacity</th>
                   <th className="p-3 text-center">Booked</th>
                   <th className="p-3 text-center">Available</th>
                   <th className="p-3 text-right">Revenue (Est)</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 {routes.map((route) => {
                    const booked = route.capacity - route.availableSeats;
                    const revenue = booked * route.price;
                    const occupancy = (booked / route.capacity) * 100;
                    
                    return (
                     <tr key={route.id} className="hover:bg-gray-50">
                       <td className="p-3 font-mono text-xs">{route.id}</td>
                       <td className="p-3 font-medium">{route.origin} &rarr; {route.destination}</td>
                       <td className="p-3">{route.departureTime}</td>
                       <td className="p-3">
                         <span className={`px-2 py-1 rounded text-xs ${route.busType === 'Luxury' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                           {route.busType}
                         </span>
                       </td>
                       <td className="p-3 text-center">{route.capacity}</td>
                       <td className="p-3 text-center font-bold text-gray-700">{booked}</td>
                       <td className="p-3 text-center">
                         <span className={`font-bold ${route.availableSeats < 5 ? 'text-red-500' : 'text-green-500'}`}>
                           {route.availableSeats}
                         </span>
                       </td>
                       <td className="p-3 text-right font-mono">KES {revenue.toLocaleString()}</td>
                     </tr>
                    );
                 })}
               </tbody>
             </table>
           </div>
        </div>
      ) : (
        <>
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
              <div className="text-gray-500 text-sm font-medium uppercase">Total Bookings</div>
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
                    <p className="text-xs text-gray-400">ID: {complaint.id}</p>
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