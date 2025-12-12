import React, { useState } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';
import { Ticket, Complaint } from '../types';
import WhatsAppConfig from './WhatsAppConfig';

const AdminDashboard: React.FC = () => {
  const { tickets, complaints, routes } = useMockBackend();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'whatsapp'>('overview');

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
      <div className="flex space-x-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeSubTab === 'overview' 
              ? 'text-red-600 border-b-2 border-red-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveSubTab('whatsapp')}
          className={`px-4 py-2 text-sm font-medium transition ${
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Tickets Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="font-semibold text-gray-800">Recent Bookings</h2>
                <button className="text-sm text-blue-600 hover:text-blue-800">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Passenger</th>
                      <th className="p-3">Route</th>
                      <th className="p-3">Seat</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-400">No bookings yet.</td>
                      </tr>
                    ) : (
                      tickets.slice(0, 5).map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-gray-50">
                          <td className="p-3 font-mono text-xs">{ticket.id}</td>
                          <td className="p-3">{ticket.passengerName}</td>
                          <td className="p-3">
                            {ticket.routeDetails?.origin} &rarr; {ticket.routeDetails?.destination}
                          </td>
                          <td className="p-3 font-bold">{ticket.seatNumber}</td>
                          <td className="p-3">
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              {ticket.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Complaints Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="font-semibold text-gray-800">Escalated Complaints</h2>
                <span className="text-xs text-red-500 font-medium">Attention Required</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Issue</th>
                      <th className="p-3">Severity</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                     {complaints.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-400">No active complaints.</td>
                      </tr>
                    ) : (
                      complaints.map((complaint) => (
                        <tr key={complaint.id} className="hover:bg-gray-50">
                          <td className="p-3">{complaint.customerName}</td>
                          <td className="p-3 truncate max-w-xs">{complaint.issue}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                complaint.severity === 'high' ? 'bg-red-100 text-red-700' :
                                complaint.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-700'
                            }`}>
                              {complaint.severity}
                            </span>
                          </td>
                          <td className="p-3">
                            <button className="text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 px-2 py-1 rounded">
                              Resolve
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
