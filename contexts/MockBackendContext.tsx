import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusRoute, Ticket, Complaint, User, BusLocation } from '../types';
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
  
  // Actions
  searchRoutes: (origin: string, destination: string) => BusRoute[];
  checkSeats: (routeId: string) => number;
  
  // New Payment Flow Actions
  initiatePayment: (phoneNumber: string, amount: number) => Promise<any>;
  verifyPayment: (checkoutRequestId: string) => Promise<any>;
  
  bookTicket: (passengerName: string, routeId: string, phoneNumber: string, checkoutRequestId?: string) => Ticket | null;
  logComplaint: (customerName: string, issue: string, severity: 'low' | 'medium' | 'high', incidentDate?: string, routeInfo?: string) => string;
  
  // Admin Actions
  validateTicket: (ticketId: string) => { success: boolean; message: string; ticket?: Ticket };

  // Auth
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, phoneNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  getUserTickets: () => Ticket[];

  // Tracking
  getBusStatus: (query: string) => Promise<any | null>;
  
  // Config
  saveWhatsAppConfig: (config: WhatsAppConfigData) => void;
}

const MockBackendContext = createContext<MockBackendContextType | undefined>(undefined);

export const MockBackendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routes, setRoutes] = useState<BusRoute[]>(ALL_ROUTES);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfigData>({
    apiUrl: 'https://api.evolution-api.com',
    apiToken: '',
    instanceName: 'EnaCoachInstance'
  });

  const searchRoutes = (origin: string, destination: string) => {
    const termOrigin = origin.toLowerCase();
    const termDest = destination.toLowerCase();

    return routes.filter((r) => {
      const routeOrigin = r.origin.toLowerCase();
      const routeDest = r.destination.toLowerCase();
      const stops = r.stops.map(s => s.toLowerCase());
      if (routeOrigin.includes(termOrigin) && routeDest.includes(termDest)) return true;
      if (routeOrigin.includes(termOrigin) && stops.includes(termDest)) return true;
      return false;
    });
  };

  const checkSeats = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    return route ? route.availableSeats : 0;
  };

  // --- Real Server Payment Interactions ---

  const initiatePayment = async (phoneNumber: string, amount: number): Promise<any> => {
      try {
          const res = await fetch('/api/payment/initiate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber, amount })
          });
          return await res.json();
      } catch (e) {
          console.error("Payment Init Error:", e);
          return { success: false, message: "Server connection failed." };
      }
  };

  const verifyPayment = async (checkoutRequestId: string): Promise<any> => {
      try {
          const res = await fetch(`/api/payment/status/${checkoutRequestId}`);
          return await res.json();
      } catch (e) {
          return { status: 'ERROR', message: "Could not reach payment server." };
      }
  };

  const bookTicket = (passengerName: string, routeId: string, phoneNumber: string, checkoutRequestId?: string) => {
    const routeIndex = routes.findIndex((r) => r.id === routeId);
    if (routeIndex === -1) return null;

    const route = routes[routeIndex];
    if (route.availableSeats <= 0) return null;

    const updatedRoutes = [...routes];
    updatedRoutes[routeIndex] = { ...route, availableSeats: route.availableSeats - 1 };
    setRoutes(updatedRoutes);

    // In a full implementation, we would call /api/ticket/generate here to get the signature
    // For now, we simulate the structure.
    
    const ticketId = `TKT-${Math.floor(Math.random() * 10000)}`;
    const newTicket: Ticket = {
      id: ticketId,
      passengerName,
      routeId,
      seatNumber: route.capacity - route.availableSeats + 1,
      status: 'booked',
      boardingStatus: 'pending',
      paymentId: checkoutRequestId || `VERIFIED-PAYMENT`,
      bookingTime: new Date().toISOString(),
      routeDetails: route,
      userId: currentUser?.id,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${ticketId}`
    };

    setTickets((prev) => [newTicket, ...prev]);
    return newTicket;
  };

  const validateTicket = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return { success: false, message: 'Invalid Ticket ID.' };
    if (ticket.status === 'cancelled') return { success: false, message: 'Ticket cancelled.' };
    if (ticket.boardingStatus === 'boarded') return { success: false, message: 'Already used.' };

    const updatedTickets = tickets.map(t => 
      t.id === ticketId ? { ...t, boardingStatus: 'boarded' as const } : t
    );
    setTickets(updatedTickets);

    return { 
      success: true, 
      message: `Welcome, ${ticket.passengerName}. Seat #${ticket.seatNumber}.`,
      ticket
    };
  };

  const logComplaint = (customerName: string, issue: string, severity: 'low' | 'medium' | 'high', incidentDate?: string, routeInfo?: string) => {
    const newComplaint: Complaint = {
      id: `CMP-${Math.floor(Math.random() * 10000)}`,
      customerName,
      issue,
      severity,
      status: 'open',
      timestamp: new Date().toISOString(),
      incidentDate,
      routeInfo
    };
    setComplaints((prev) => [newComplaint, ...prev]);
    return newComplaint.id;
  };

  const login = async (identifier: string, password: string): Promise<boolean> => {
    await new Promise(r => setTimeout(r, 1000));
    const user = users.find(u => (u.email === identifier || u.phoneNumber === identifier) && u.password === password);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const register = async (name: string, email: string, phoneNumber: string, password: string): Promise<boolean> => {
    await new Promise(r => setTimeout(r, 1000));
    const exists = users.some(u => u.email === email || u.phoneNumber === phoneNumber);
    if (exists) return false;

    const newUser: User = { id: `USR-${Date.now()}`, name, email, phoneNumber, password };
    setUsers([...users, newUser]);
    setCurrentUser(newUser);
    return true;
  };

  const logout = () => setCurrentUser(null);
  const getUserTickets = () => currentUser ? tickets.filter(t => t.userId === currentUser.id) : [];

  const getBusStatus = async (query: string): Promise<any | null> => {
    let search = query;
    const ticket = tickets.find(t => t.id === query);
    if (ticket) { search = ticket.routeId; }

    try {
        const response = await fetch(`/api/bus-location/${encodeURIComponent(search)}`);
        if (response.ok) { return await response.json(); }
        return { error: 'Failed to fetch real data' };
    } catch (e) {
        return null;
    }
  };

  const saveWhatsAppConfig = (config: WhatsAppConfigData) => setWhatsappConfig(config);

  return (
    <MockBackendContext.Provider
      value={{
        routes, tickets, complaints, currentUser, whatsappConfig,
        searchRoutes, checkSeats, initiatePayment, verifyPayment, bookTicket, logComplaint, validateTicket,
        login, register, logout, getUserTickets, getBusStatus, saveWhatsAppConfig
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