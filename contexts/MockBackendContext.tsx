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
  processPayment: (phoneNumber: string, amount: number) => Promise<boolean>;
  bookTicket: (passengerName: string, routeId: string, phoneNumber: string) => Ticket | null;
  logComplaint: (customerName: string, issue: string, severity: 'low' | 'medium' | 'high') => string;
  
  // Admin Actions
  validateTicket: (ticketId: string) => { success: boolean; message: string; ticket?: Ticket };

  // Auth
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, phoneNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  getUserTickets: () => Ticket[];

  // Tracking
  getBusStatus: (query: string) => Promise<any | null>; // Changed to Promise and any to handle API response
  
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

      // 1. Direct Match
      if (routeOrigin.includes(termOrigin) && routeDest.includes(termDest)) return true;

      // 2. Intermediate Stop Match (Smart Search)
      const isOriginStart = routeOrigin.includes(termOrigin);
      const isDestStop = stops.includes(termDest);
      
      if (isOriginStart && isDestStop) return true;

      // 3. Stop to Stop (Advanced)
      if (stops.includes(termOrigin) && stops.includes(termDest)) {
         const idxOrigin = stops.indexOf(termOrigin);
         const idxDest = stops.indexOf(termDest);
         return idxOrigin < idxDest;
      }
      
      return false;
    });
  };

  const checkSeats = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    return route ? route.availableSeats : 0;
  };

  const processPayment = async (phoneNumber: string, amount: number): Promise<boolean> => {
    console.log(`[Daraja Mock] STK Push sent to ${phoneNumber} for KES ${amount}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return true; // Always succeed for testing purposes
  };

  const bookTicket = (passengerName: string, routeId: string, phoneNumber: string) => {
    const routeIndex = routes.findIndex((r) => r.id === routeId);
    if (routeIndex === -1) return null;

    const route = routes[routeIndex];
    if (route.availableSeats <= 0) return null;

    const updatedRoutes = [...routes];
    updatedRoutes[routeIndex] = { ...route, availableSeats: route.availableSeats - 1 };
    setRoutes(updatedRoutes);

    const ticketId = `TKT-${Math.floor(Math.random() * 10000)}`;
    const newTicket: Ticket = {
      id: ticketId,
      passengerName,
      routeId,
      seatNumber: route.capacity - route.availableSeats + 1,
      status: 'booked',
      boardingStatus: 'pending',
      paymentId: `PAY-${Math.floor(Math.random() * 100000)}`,
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

  const logComplaint = (customerName: string, issue: string, severity: 'low' | 'medium' | 'high') => {
    const newComplaint: Complaint = {
      id: `CMP-${Math.floor(Math.random() * 10000)}`,
      customerName,
      issue,
      severity,
      status: 'open',
      timestamp: new Date().toISOString(),
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
    // If ticket ID, resolve to route ID if possible
    let search = query;
    const ticket = tickets.find(t => t.id === query);
    if (ticket) {
        search = ticket.routeId;
    }

    try {
        // We call our own server, which will then call the real FLEET_API
        const response = await fetch(`/api/bus-location/${encodeURIComponent(search)}`);
        if (response.ok) {
            return await response.json();
        }
        return { error: 'Failed to fetch real data' };
    } catch (e) {
        console.error("GPS Fetch Error:", e);
        return null;
    }
  };

  const saveWhatsAppConfig = (config: WhatsAppConfigData) => setWhatsappConfig(config);

  return (
    <MockBackendContext.Provider
      value={{
        routes, tickets, complaints, currentUser, whatsappConfig,
        searchRoutes, checkSeats, processPayment, bookTicket, logComplaint, validateTicket,
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