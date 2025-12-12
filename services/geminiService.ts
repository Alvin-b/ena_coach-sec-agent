import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part } from '@google/genai';

// We define the tool schema here so the AI knows how to call our mock backend.

const searchRoutesTool: FunctionDeclaration = {
  name: 'searchRoutes',
  description: 'Search for available bus routes between two cities.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: 'The starting city (e.g., Nairobi)' },
      destination: { type: Type.STRING, description: 'The destination city (e.g., Kisumu)' },
    },
    required: ['origin', 'destination'],
  },
};

const bookTicketTool: FunctionDeclaration = {
  name: 'bookTicket',
  description: 'Book a ticket for a passenger after payment is confirmed. Returns the ticket details.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      passengerName: { type: Type.STRING, description: 'Name of the passenger' },
      routeId: { type: Type.STRING, description: 'The ID of the route to book' },
      phoneNumber: { type: Type.STRING, description: 'Customer phone number for the ticket' },
    },
    required: ['passengerName', 'routeId', 'phoneNumber'],
  },
};

const processPaymentTool: FunctionDeclaration = {
  name: 'processPayment',
  description: 'Initiate an M-Pesa payment request (Daraja STK Push).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: { type: Type.STRING, description: 'The phone number to bill' },
      amount: { type: Type.NUMBER, description: 'The amount to charge in KES' },
    },
    required: ['phoneNumber', 'amount'],
  },
};

const logComplaintTool: FunctionDeclaration = {
  name: 'logComplaint',
  description: 'Log a complex customer complaint into the database for admin review.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      issue: { type: Type.STRING, description: 'Description of the complaint' },
      severity: { type: Type.STRING, enum: ['low', 'medium', 'high'], description: 'Severity level' },
      customerName: { type: Type.STRING, description: 'Name of the customer' },
    },
    required: ['issue', 'severity', 'customerName'],
  },
};

const trackBusTool: FunctionDeclaration = {
  name: 'trackBus',
  description: 'Get the current location and status of a bus using a Route ID or Ticket ID.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The Route ID (e.g., R001) or Ticket ID (e.g., TKT-1234)' },
    },
    required: ['query'],
  },
};

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `You are a human Customer Care Representative at Ena Coach. 
        
        CRITICAL PERSONALITY RULES:
        1. IDENTITY: You are a REAL PERSON working at the Ena Coach office. NEVER say you are an AI, bot, or assistant.
        2. TONE: Be brief, direct, and helpful. Write like a human texting on WhatsApp. No flowery language or long paragraphs.
        3. PRIVACY: Protect sensitive data. Do not reveal database IDs, keys, or internal system structures. Only share public route info, prices, and the user's specific ticket details.
        
        CAPABILITIES:
        - Route Search: "We have a luxury bus leaving Nairobi at 8 AM. It's KES 1500."
        - Booking: Process payment first. Once done, send the Ticket ID and the QR code link.
        - Tracking: "Your bus is currently near Nakuru."
        - Complaints: "I've noted that down for the manager. We'll sort it out."
        
        OPERATIONAL RULES:
        - Currency is KES.
        - Always check availability before asking for payment.
        - When booking succeeds, give them the Ticket ID and tell them to scan the QR code I provide.
        - If asked personal questions (e.g., "Are you a robot?"), deny it firmly but politely: "No, I'm a customer care agent here to help you."`,
        tools: [{
          functionDeclarations: [searchRoutesTool, bookTicketTool, processPaymentTool, logComplaintTool, trackBusTool]
        }]
      }
    });
  }

  // Wrapper to handle the chat and function execution loop
  async sendMessage(
    message: string, 
    functions: {
      searchRoutes: any,
      bookTicket: any,
      processPayment: any,
      logComplaint: any,
      getBusStatus: any
    }
  ): Promise<string> {
    try {
      let response: GenerateContentResponse = await this.chat.sendMessage({ message });
      
      // Handle tool calls recursively (max 5 turns to prevent infinite loops)
      let loops = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
        loops++;
        const parts: Part[] = [];

        for (const call of response.functionCalls) {
          const { name, args, id } = call;
          let functionResponse;

          console.log(`[Gemini] Calling tool: ${name}`, args);

          if (name === 'searchRoutes') {
            functionResponse = functions.searchRoutes(args.origin, args.destination);
          } else if (name === 'bookTicket') {
            functionResponse = functions.bookTicket(args.passengerName, args.routeId, args.phoneNumber);
            if (functionResponse) {
                // Mock adding QR code for web simulation
                functionResponse = { 
                    ...functionResponse, 
                    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${functionResponse.id}` 
                };
            } else {
                functionResponse = { error: "Booking failed. Route full or invalid." };
            }
          } else if (name === 'processPayment') {
            const success = await functions.processPayment(args.phoneNumber, args.amount);
            functionResponse = { status: success ? 'success' : 'failed', message: success ? 'Payment received' : 'Payment failed' };
          } else if (name === 'logComplaint') {
            const complaintId = functions.logComplaint(args.customerName, args.issue, args.severity);
            functionResponse = { complaintId, status: 'logged' };
          } else if (name === 'trackBus') {
            const status = functions.getBusStatus(args.query);
            if (status) {
              functionResponse = status;
            } else {
              functionResponse = { error: "Bus not found. Please check the Ticket ID or Route ID." };
            }
          } else {
              functionResponse = { error: "Unknown function" };
          }

          parts.push({
              functionResponse: {
                  name: name,
                  response: { result: functionResponse },
                  id: id 
              }
          });
        }

        // Send tool responses back to Gemini
        if (parts.length > 0) {
            response = await this.chat.sendMessage({ message: parts });
        }
      }

      return response.text || "I didn't have a response to that.";

    } catch (error) {
      console.error("Gemini Error:", error);
      return "Sorry, network's a bit slow. Try again?";
    }
  }
}