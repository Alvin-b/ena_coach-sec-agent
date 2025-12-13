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
  
  // Actions
  searchRoutes: (origin: string, destination: string) => BusRoute[];
  fetchAllRoutes: () => Promise<void>;
  updateRoutePrice: (routeId: string, newPrice: number) => Promise<boolean>;
  addRoute: (routeData: Partial<BusRoute>) => Promise<boolean>;
  
  // Inventory
  getInventory: (date: string) => Promise<BusRoute[]>;
  checkSeats: (routeId: string) => number;
  getRouteManifest: (routeId: string, date: string) => Promise<any>;
  
  // Payment
  initiatePayment: (phoneNumber: string, amount: number) => Promise<any>;
  verifyPayment: (checkoutRequestId: string) => Promise<any>;
  
  // Booking
  bookTicket: (passengerName: string, routeId: string, phoneNumber: string, checkoutRequestId?: string) => Ticket | null;
  validateTicket: (ticketId: string) => { success: boolean; message: string; ticket?: Ticket };
  
  // CRM
  fetchContacts: () => Promise<void>;
  broadcastMessage: (message: string, contactList: string[]) => Promise<{success: boolean, count: number}>;
  logComplaint: (customerName: string, issue: string, severity: 'low' | 'medium' | 'high', incidentDate?: string, routeInfo?: string) => string;
  
  // Admin AI Helpers
  getFinancialReport: (startDate?: string, endDate?: string) => { totalRevenue: number; ticketCount: number; averagePrice: number };
  getOccupancyStats: () => { totalCapacity: number; totalBooked: number; utilization: string };
  getComplaints: (status?: 'open' | 'resolved') => Complaint[];
  resolveComplaint: (complaintId: string, resolutionMessage: string) => Promise<{success: boolean, message: string, notificationStatus: string}>;

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
              if (Array.isArray(data) && data.length > 0) {
                  setRoutes(data);
                  return;
              }
          }
      } catch (e) { console.error("API Route fetch failed, using fallback.", e); }
      
      // Fallback if API fails or returns empty
      console.log("Using local backup routes.");
      setRoutes(ALL_ROUTES as BusRoute[]);
  };

  const updateRoutePrice = async (routeId: string, newPrice: number) => {
      try {
          const res = await fetch(`/api/routes/${routeId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ price: newPrice })
          });
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

    return routes.filter((r) => {
      const routeOrigin = r.origin.toLowerCase();
      const routeDest = r.destination.toLowerCase();
      const stops = r.stops ? r.stops.map(s => s.toLowerCase()) : [];
      if (routeOrigin.includes(termOrigin) && routeDest.includes(termDest)) return true;
      if (routeOrigin.includes(termOrigin) && stops.includes(termDest)) return true;
      return false;
    });
  };

  // FETCH REAL INVENTORY
  const getInventory = async (date: string): Promise<BusRoute[]> => {
      try {
          const res = await fetch(`/api/inventory?date=${date}`);
          if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                  return data.map((d: any) => ({
                      ...d,
                      stops: d.stops || [], 
                      availableSeats: d.available !== undefined ? d.available : d.availableSeats,
                      capacity: d.capacity
                  }));
              }
          }
          console.warn("Server inventory empty, using local backup.");
      } catch (e) {
          console.error("Failed to fetch inventory from server", e);
      }
      
      // Fallback to local routes with default availability
      return ALL_ROUTES.map(r => ({
          ...r,
          id: r.id || `BAK-${Math.random()}`,
          availableSeats: r.availableSeats || 45,
          capacity: r.capacity || 45,
          stops: r.stops || []
      })) as BusRoute[];
  };

  const getRouteManifest = async (routeId: string, date: string): Promise<any> => {
      try {
          const res = await fetch(`/api/manifest?routeId=${routeId}&date=${date}`);
          if (res.ok) {
              return await res.json();
          }
      } catch (e) {
          console.error("Manifest fetch failed", e);
      }
      return { passengers: [], total: 0 };
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
    
    const ticketId = `TKT-${Math.floor(Math.random() * 10000)}`;
    const now = new Date();
    const bookingDateStr = now.toISOString();

    const newTicket: Ticket = {
      id: ticketId,
      passengerName,
      routeId,
      seatNumber: route.capacity - route.availableSeats + 1,
      status: 'booked',
      boardingStatus: 'pending',
      paymentId: checkoutRequestId || `VERIFIED-PAYMENT`,
      bookingTime: bookingDateStr,
      bookingDate: bookingDateStr,
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

  // --- CRM ---
  const fetchContacts = async () => {
      try {
          const res = await fetch('/api/contacts');
          if (res.ok) {
              const data = await res.json();
              setContacts(data);
          }
      } catch (e) { console.error(e); }
  };

  const broadcastMessage = async (message: string, contactList: string[]) => {
      try {
          const res = await fetch('/api/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, contacts: contactList })
          });
          if (res.ok) {
              const data = await res.json();
              return { success: true, count: data.count };
          }
      } catch (e) { console.error(e); }
      return { success: false, count: 0 };
  };

  // --- Admin AI Helpers ---
  const getFinancialReport = (startDate?: string, endDate?: string) => {
    // Basic implementation: Aggregates all tickets currently in memory
    // In a real app, date filtering would be applied here
    const totalRevenue = tickets.reduce((acc, t) => acc + (t.routeDetails?.price || 0), 0);
    const count = tickets.length;
    return {
      totalRevenue,
      ticketCount: count,
      averagePrice: count > 0 ? totalRevenue / count : 0
    };
  };

  const getOccupancyStats = () => {
    const totalCapacity = routes.reduce((acc, r) => acc + r.capacity, 0);
    const totalAvailable = routes.reduce((acc, r) => acc + r.availableSeats, 0);
    const totalBooked = totalCapacity - totalAvailable;
    const utilization = totalCapacity > 0 ? ((totalBooked / totalCapacity) * 100).toFixed(1) + '%' : '0%';
    
    return {
      totalCapacity,
      totalBooked,
      utilization
    };
  };

  const getComplaints = (status?: 'open' | 'resolved') => {
    if (status) return complaints.filter(c => c.status === status);
    return complaints;
  };

  const resolveComplaint = async (complaintId: string, resolutionMessage: string) => {
    const complaint = complaints.find(c => c.id === complaintId);
    if (!complaint) return { success: false, message: "Complaint ID not found.", notificationStatus: "Failed" };

    // Update local state
    setComplaints(prev => prev.map(c => c.id === complaintId ? { ...c, status: 'resolved' } : c));

    // Try to notify customer
    // Simple matching by name for simulation
    const contact = contacts.find(c => c.name.toLowerCase().includes(complaint.customerName.toLowerCase()));
    let messageSent = false;
    
    if (contact) {
        // Use the existing broadcast endpoint/function to send a single message
        await broadcastMessage(resolutionMessage, [contact.phoneNumber]);
        messageSent = true;
    }

    return { 
        success: true, 
        message: "Complaint marked as resolved.", 
        notificationStatus: messageSent ? `Message sent to ${contact?.phoneNumber}` : "Could not find customer phone number to send notification."
    };
  };

  // --- Auth ---
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
        routes, tickets, complaints, currentUser, whatsappConfig, contacts,
        searchRoutes, checkSeats, initiatePayment, verifyPayment, bookTicket, logComplaint, validateTicket,
        login, register, logout, getUserTickets, getBusStatus, saveWhatsAppConfig,
        getInventory, updateRoutePrice, addRoute, fetchAllRoutes, fetchContacts, broadcastMessage,
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