import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusRoute, Ticket, Complaint, User, BusLocation } from '../types';

// Initial Mock Data
const INITIAL_ROUTES: BusRoute[] = [
  { id: 'R001', origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, availableSeats: 24, busType: 'Luxury' },
  { id: 'R002', origin: 'Nairobi', destination: 'Kisumu', departureTime: '09:00 PM', price: 1200, availableSeats: 10, busType: 'Standard' },
  { id: 'R003', origin: 'Kisumu', destination: 'Nairobi', departureTime: '10:00 AM', price: 1500, availableSeats: 40, busType: 'Luxury' },
  { id: 'R004', origin: 'Nairobi', destination: 'Mombasa', departureTime: '07:00 AM', price: 2000, availableSeats: 5, busType: 'Luxury' },
  { id: 'R005', origin: 'Mombasa', destination: 'Nairobi', departureTime: '08:00 PM', price: 1800, availableSeats: 15, busType: 'Standard' },
];

const MOCK_LOCATIONS: Record<string, BusLocation> = {
  'R001': { routeId: 'R001', currentLocation: 'Passing Naivasha', nextStop: 'Nakuru', estimatedArrival: '02:00 PM', status: 'On Time', coordinates: { lat: -0.717, lng: 36.431 } },
  'R002': { routeId: 'R002', currentLocation: 'Departing Nairobi', nextStop: 'Limuru', estimatedArrival: '04:00 AM', status: 'Delayed', coordinates: { lat: -1.292, lng: 36.821 } },
  'R003': { routeId: 'R003', currentLocation: 'Kericho Junction', nextStop: 'Mau Summit', estimatedArrival: '03:30 PM', status: 'On Time', coordinates: { lat: -0.368, lng: 35.286 } },
  'R004': { routeId: 'R004', currentLocation: 'Mtito Andei', nextStop: 'Voi', estimatedArrival: '02:00 PM', status: 'On Time', coordinates: { lat: -2.686, lng: 38.163 } },
};

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
  
  // Auth
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, phoneNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  getUserTickets: () => Ticket[];

  // Tracking
  getBusStatus: (query: string) => BusLocation | null; // Query can be Ticket ID or Route ID
  
  // Config
  saveWhatsAppConfig: (config: WhatsAppConfigData) => void;
}

const MockBackendContext = createContext<MockBackendContextType | undefined>(undefined);

export const MockBackendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routes, setRoutes] = useState<BusRoute[]>(INITIAL_ROUTES);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Default config (persisted in state only for this session)
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfigData>({
    apiUrl: 'https://api.evolution-api.com',
    apiToken: '',
    instanceName: 'EnaCoachInstance'
  });

  const searchRoutes = (origin: string, destination: string) => {
    return routes.filter(
      (r) =>
        r.origin.toLowerCase().includes(origin.toLowerCase()) &&
        r.destination.toLowerCase().includes(destination.toLowerCase())
    );
  };

  const checkSeats = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    return route ? route.availableSeats : 0;
  };

  const processPayment = async (phoneNumber: string, amount: number): Promise<boolean> => {
    // Simulate Daraja API STK Push latency
    console.log(`[Daraja Mock] STK Push sent to ${phoneNumber} for KES ${amount}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // Simulate 90% success rate
    return Math.random() > 0.1;
  };

  const bookTicket = (passengerName: string, routeId: string, phoneNumber: string) => {
    const routeIndex = routes.findIndex((r) => r.id === routeId);
    if (routeIndex === -1) return null;

    const route = routes[routeIndex];
    if (route.availableSeats <= 0) return null;

    // Update seats
    const updatedRoutes = [...routes];
    updatedRoutes[routeIndex] = { ...route, availableSeats: route.availableSeats - 1 };
    setRoutes(updatedRoutes);

    // Create ticket
    const newTicket: Ticket = {
      id: `TKT-${Math.floor(Math.random() * 10000)}`,
      passengerName,
      routeId,
      seatNumber: 45 - route.availableSeats + 1, // Simple seat logic
      status: 'booked',
      paymentId: `PAY-${Math.floor(Math.random() * 100000)}`,
      bookingTime: new Date().toISOString(),
      routeDetails: route,
      userId: currentUser?.id 
    };

    setTickets((prev) => [newTicket, ...prev]);
    return newTicket;
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

  // Auth Methods
  const login = async (identifier: string, password: string): Promise<boolean> => {
    await new Promise(r => setTimeout(r, 1000)); // Simulate delay
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

  const logout = () => {
    setCurrentUser(null);
  };

  const getUserTickets = () => {
    if (!currentUser) return [];
    return tickets.filter(t => t.userId === currentUser.id);
  };

  // Tracking Method
  const getBusStatus = (query: string): BusLocation | null => {
    // Check if query is a Ticket ID
    const ticket = tickets.find(t => t.id === query);
    if (ticket) {
      return MOCK_LOCATIONS[ticket.routeId] || null;
    }
    // Check if query is a Route ID
    if (MOCK_LOCATIONS[query]) {
      return MOCK_LOCATIONS[query];
    }
    return null;
  };

  const saveWhatsAppConfig = (config: WhatsAppConfigData) => {
    setWhatsappConfig(config);
  };

  return (
    <MockBackendContext.Provider
      value={{
        routes,
        tickets,
        complaints,
        currentUser,
        whatsappConfig,
        searchRoutes,
        checkSeats,
        processPayment,
        bookTicket,
        logComplaint,
        login,
        register,
        logout,
        getUserTickets,
        getBusStatus,
        saveWhatsAppConfig
      }}
    >
      {children}
    </MockBackendContext.Provider>
  );
};

export const useMockBackend = () => {
  const context = useContext(MockBackendContext);
  if (!context) {
    throw new Error('useMockBackend must be used within a MockBackendProvider');
  }
  return context;
};
