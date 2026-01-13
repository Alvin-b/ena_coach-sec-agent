
import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusRoute, Ticket, Complaint, User, BusLocation, Contact } from '../types';
import { ALL_ROUTES } from '../data/enaRoutes';

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
  
  bookTicket: (passengerName: string, routeId: string, phoneNumber: string, checkoutRequestId?: string) => Ticket | null;
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
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfigData>({
    apiUrl: 'https://api.evolution-api.com',
    apiToken: '',
    instanceName: 'EnaCoachInstance'
  });

  useEffect(() => {
      fetchAllRoutes();
      fetchContacts();
  }, []);

  const fetchAllRoutes = async () => {
      try {
          const res = await fetch('/api/routes');
          if (res.ok) {
              const data = await res.json();
              setRoutes(data);
              return;
          }
      } catch (e) { console.error("API Route fetch failed", e); }
      setRoutes(ALL_ROUTES as BusRoute[]);
  };

  const updateRoutePrice = async (routeId: string, newPrice: number) => {
      return updateRoute(routeId, { price: newPrice });
  };

  const updateRoute = async (routeId: string, updates: Partial<BusRoute>) => {
    try {
        const res = await fetch(`/api/routes/${routeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (res.ok) {
            await fetchAllRoutes();
            return true;
        }
    } catch (e) { console.error(e); }
    return false;
  };

  const deleteRoute = async (routeId: string) => {
    try {
        const res = await fetch(`/api/routes/${routeId}`, { method: 'DELETE' });
        if (res.ok) {
            await fetchAllRoutes();
            return true;
        }
    } catch (e) { console.error(e); }
    return false;
  };

  const addRoute = async (routeData: Partial<BusRoute>) => {
      try {
          const res = await fetch('/api/routes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(routeData)
          });
          if (res.ok) {
              await fetchAllRoutes();
              return true;
          }
      } catch (e) { console.error(e); }
      return false;
  };

  const searchRoutes = (origin: string, destination: string) => {
    const termOrigin = origin.toLowerCase();
    const termDest = destination.toLowerCase();
    return routes.filter((r) => r.origin.toLowerCase().includes(termOrigin) && r.destination.toLowerCase().includes(termDest));
  };

  const getInventory = async (date: string): Promise<BusRoute[]> => {
      await fetchAllRoutes();
      return routes;
  };

  const getRouteManifest = async (routeId: string, date: string): Promise<any> => {
      return { passengers: [], total: 0 };
  };

  const checkSeats = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    return route ? route.availableSeats : 0;
  };

  const initiatePayment = async (phoneNumber: string, amount: number): Promise<any> => {
      return { success: true, checkoutRequestId: "TEST-" + Date.now() };
  };

  const verifyPayment = async (checkoutRequestId: string): Promise<any> => {
      return { status: 'COMPLETED' };
  };

  const bookTicket = (passengerName: string, routeId: string, phoneNumber: string, checkoutRequestId?: string) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return null;
    const ticketId = `TKT-${Math.floor(Math.random() * 10000)}`;
    const newTicket: Ticket = {
      id: ticketId,
      passengerName,
      routeId,
      seatNumber: 1,
      status: 'booked',
      boardingStatus: 'pending',
      paymentId: checkoutRequestId || `V-PAY`,
      bookingTime: new Date().toISOString(),
      bookingDate: new Date().toISOString(),
      routeDetails: route,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${ticketId}`
    };
    setTickets((prev) => [newTicket, ...prev]);
    return newTicket;
  };

  const validateTicket = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return { success: false, message: 'Invalid Ticket ID.' };
    return { success: true, message: `Welcome, ${ticket.passengerName}.`, ticket };
  };

  const logComplaint = (customerName: string, issue: string, severity: 'low' | 'medium' | 'high') => {
    const id = `CMP-${Math.floor(Math.random() * 10000)}`;
    setComplaints(prev => [{ id, customerName, issue, severity, status: 'open', timestamp: new Date().toISOString() }, ...prev]);
    return id;
  };

  const fetchContacts = async () => { setContacts([]); };
  const broadcastMessage = async (message: string, contactList: string[]) => ({ success: true, count: contactList.length });
  const getFinancialReport = () => ({ totalRevenue: 0, ticketCount: 0, averagePrice: 0 });
  const getOccupancyStats = () => ({ totalCapacity: 100, totalBooked: 20, utilization: '20%' });
  const getComplaints = () => complaints;
  const resolveComplaint = async () => ({ success: true, message: "OK", notificationStatus: "Sent" });
  const login = async () => true;
  const register = async () => true;
  const logout = () => setCurrentUser(null);
  const getUserTickets = () => [];
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
