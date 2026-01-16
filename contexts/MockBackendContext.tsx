
import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusRoute, Ticket, Complaint, User, Contact } from '../types';

export interface WhatsAppConfigData {
  apiUrl: string;
  apiToken: string;
  instanceName: string;
}

interface MockBackendContextType {
  routes: BusRoute[];
  tickets: Ticket[];
  complaints: Complaint[];
  currentUser: User | null;
  whatsappConfig: WhatsAppConfigData;
  contacts: Contact[];
  
  searchRoutes: (origin: string, destination: string) => BusRoute[];
  fetchAllRoutes: () => Promise<void>;
  updateRoutePrice: (routeId: string, newPrice: number) => Promise<boolean>;
  updateRoute: (routeId: string, updates: Partial<BusRoute>) => Promise<boolean>;
  deleteRoute: (routeId: string) => Promise<boolean>;
  addRoute: (routeData: Partial<BusRoute>) => Promise<boolean>;
  
  getInventory: (date: string) => Promise<BusRoute[]>;
  checkSeats: (routeId: string) => number;
  getRouteManifest: (routeId: string, date: string) => Promise<any>;
  
  initiatePayment: (phoneNumber: string, amount: number) => Promise<any>;
  verifyPayment: (checkoutRequestId: string) => Promise<any>;
  
  bookTicket: (passengerName: string, routeId: string, phoneNumber: string, checkoutRequestId?: string) => Promise<Ticket | null>;
  validateTicket: (ticketId: string) => { success: boolean; message: string; ticket?: Ticket };
  
  fetchContacts: () => Promise<void>;
  broadcastMessage: (message: string, contactList: string[]) => Promise<{success: boolean, count: number}>;
  logComplaint: (customerName: string, issue: string, severity: 'low' | 'medium' | 'high', incidentDate?: string, routeInfo?: string) => string;
  
  getFinancialReport: (startDate?: string, endDate?: string) => { totalRevenue: number; ticketCount: number; averagePrice: number };
  getOccupancyStats: () => { totalCapacity: number; totalBooked: number; utilization: string };
  getComplaints: (status?: 'open' | 'resolved') => Complaint[];
  resolveComplaint: (complaintId: string, resolutionMessage: string) => Promise<{success: boolean, message: string, notificationStatus: string}>;

  login: (identifier: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, phoneNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  getUserTickets: () => Ticket[];
  getBusStatus: (query: string) => Promise<any | null>;
  saveWhatsAppConfig: (config: WhatsAppConfigData) => void;
}

const MockBackendContext = createContext<MockBackendContextType | undefined>(undefined);

export const MockBackendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfigData>({
    apiUrl: '',
    apiToken: '',
    instanceName: 'EnaCoach'
  });

  const syncWithServer = async () => {
      try {
          const [rRes, tRes] = await Promise.all([
              fetch('/api/routes'),
              fetch('/api/tickets')
          ]);
          if (rRes.ok) setRoutes(await rRes.json());
          if (tRes.ok) setTickets(await tRes.json());
      } catch (e) { console.error("Sync failed", e); }
  };

  useEffect(() => {
      syncWithServer();
      const interval = setInterval(syncWithServer, 3000); // Polling for new WhatsApp bookings
      return () => clearInterval(interval);
  }, []);

  const fetchAllRoutes = async () => syncWithServer();

  const updateRoute = async (routeId: string, updates: Partial<BusRoute>) => {
    try {
        const res = await fetch(`/api/routes/${routeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (res.ok) { await syncWithServer(); return true; }
    } catch (e) { console.error(e); }
    return false;
  };

  const updateRoutePrice = (id: string, price: number) => updateRoute(id, { price });
  const deleteRoute = async () => false;
  const addRoute = async () => false;

  const searchRoutes = (origin: string, destination: string) => {
    return routes.filter(r => 
        r.origin.toLowerCase().includes(origin.toLowerCase()) && 
        r.destination.toLowerCase().includes(destination.toLowerCase())
    );
  };

  const getInventory = async () => routes;
  const getRouteManifest = async () => ({ passengers: [], total: 0 });
  const checkSeats = () => 0;

  const initiatePayment = async () => ({ success: true, checkoutRequestId: "TEST-" + Date.now() });
  const verifyPayment = async () => ({ status: 'COMPLETED' });

  const bookTicket = async (passengerName: string, routeId: string, phoneNumber: string) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return null;
    const ticketId = `TKT-${Math.floor(Math.random() * 9000) + 1000}`;
    const newTicket: Ticket = {
      id: ticketId,
      passengerName,
      routeId,
      seatNumber: 1,
      status: 'booked',
      boardingStatus: 'pending',
      paymentId: 'DARAJA-TEST',
      bookingTime: new Date().toISOString(),
      bookingDate: new Date().toISOString(),
      routeDetails: route,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${ticketId}`
    };
    // In a real scenario, we'd POST this to the server too
    setTickets(prev => [newTicket, ...prev]);
    return newTicket;
  };

  const validateTicket = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return { success: false, message: 'Invalid Ticket.' };
    return { success: true, message: `Welcome ${ticket.passengerName}`, ticket };
  };

  const logComplaint = () => "CMP-123";
  const fetchContacts = async () => {};
  const broadcastMessage = async () => ({ success: true, count: 0 });
  const getFinancialReport = () => ({ totalRevenue: tickets.reduce((a,t) => a + (t.routeDetails?.price || 0), 0), ticketCount: tickets.length, averagePrice: 0 });
  const getOccupancyStats = () => ({ totalCapacity: 100, totalBooked: 20, utilization: '20%' });
  const getComplaints = () => complaints;
  const resolveComplaint = async () => ({ success: true, message: "OK", notificationStatus: "Sent" });
  const login = async () => true;
  const register = async () => true;
  const logout = () => setCurrentUser(null);
  const getUserTickets = () => tickets;
  const getBusStatus = async () => ({ status: 'On Time' });
  const saveWhatsAppConfig = (config: WhatsAppConfigData) => setWhatsappConfig(config);

  return (
    <MockBackendContext.Provider
      value={{
        routes, tickets, complaints, currentUser, whatsappConfig, contacts,
        searchRoutes, checkSeats, initiatePayment, verifyPayment, bookTicket, logComplaint, validateTicket,
        login, register, logout, getUserTickets, getBusStatus, saveWhatsAppConfig,
        getInventory, updateRoutePrice, updateRoute, deleteRoute, addRoute, fetchAllRoutes, fetchContacts, broadcastMessage,
        getFinancialReport, getOccupancyStats, getRouteManifest, getComplaints, resolveComplaint
      }}
    >
      {children}
    </MockBackendContext.Provider>
  );
};

export const useMockBackend = () => {
  const context = useContext(MockBackendContext);
  if (!context) throw new Error('useMockBackend must be used within a MockBackendProvider');
  return context;
};
