
export interface BusRoute {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  price: number;
  availableSeats: number;
  capacity: number;
  busType: 'Luxury' | 'Standard';
  stops: string[]; // List of major towns along the route
}

export interface Ticket {
  id: string;
  passengerName: string;
  routeId: string;
  seatNumber: number;
  status: 'booked' | 'cancelled';
  boardingStatus: 'pending' | 'boarded';
  paymentId: string;
  bookingTime: string;
  bookingDate: string; // Captured date of booking
  userId?: string; // Linked to a registered user
  routeDetails?: BusRoute;
  qrCodeUrl: string;
}

export interface Contact {
  phoneNumber: string;
  name: string;
  lastTravelDate: string;
  totalTrips: number;
}

export interface Complaint {
  id: string;
  customerName: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  timestamp: string;
  incidentDate?: string;
  routeInfo?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  isToolOutput?: boolean;
  timestamp: Date;
  ticket?: Ticket; // Added to support rich ticket rendering
}

export interface PaymentRequest {
  phoneNumber: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  password?: string; // In a real app, this would be hashed
}

export interface BusLocation {
  routeId: string;
  currentLocation: string;
  nextStop: string;
  estimatedArrival: string;
  status: 'On Time' | 'Delayed' | 'Arrived';
  coordinates: { lat: number; lng: number }; // For future map integration
}

// Evolution API Types
export interface EvolutionWebhookPayload {
  type: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
    };
    messageType: string;
  };
  sender?: string;
}